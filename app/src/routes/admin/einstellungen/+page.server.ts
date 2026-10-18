import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAction } from '$lib/server/guard';
import { db } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { clearMailSettings, MailSettingsError, mailSettingsView, saveMailSettings } from '$lib/server/mailsettings';
import { describeMailError, mails, sendMail, verifyMailServer } from '$lib/server/mailer';
import { aerialInfo, ESRI_TILES, saveEsriKey } from '$lib/server/aerial';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'settings.manage');
	return { mail: mailSettingsView(), aerial: aerialInfo() };
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		const f = await event.request.formData();
		const input = {
			host: String(f.get('host') ?? ''),
			port: String(f.get('port') ?? ''),
			user: String(f.get('user') ?? ''),
			password: String(f.get('password') ?? ''),
			from: String(f.get('from') ?? ''),
			insecureTls: f.get('insecure_tls') === 'on'
		};
		const sql = db();
		try {
			await saveMailSettings(sql, input, user.id);
		} catch (e) {
			if (e instanceof MailSettingsError) return fail(400, { error: e.message });
			throw e;
		}
		await audit(sql, {
			actorId: user.id,
			action: 'settings.mail.updated',
			targetType: 'settings',
			targetId: 'mail',
			meta: { host: input.host.trim(), port: Number(input.port), user: input.user.trim(), from: input.from.trim(), passwordChanged: !!input.password, insecureTls: input.insecureTls }
		});
		const problem = await verifyMailServer();
		if (problem) return { saved: true, warn: `Gespeichert, aber die Verbindung klappt noch nicht: ${problem}` };
		return { saved: true, ok: 'Gespeichert. Verbindung und Anmeldung am Mailserver funktionieren. Registrierung ist jetzt offen.' };
	},
	testen: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		try {
			await sendMail(mails.test(user.email));
		} catch (e) {
			return fail(500, { error: `Versand fehlgeschlagen: ${describeMailError(e)}` });
		}
		await audit(db(), { actorId: user.id, action: 'mail.test' });
		return { ok: `Test-E-Mail an ${user.email} verschickt. Bitte Posteingang und Spam-Ordner prüfen.` };
	},
	luftbild: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		const f = await event.request.formData();
		const sql = db();
		if (f.get('remove') === '1') {
			await saveEsriKey(sql, null);
			await audit(sql, { actorId: user.id, action: 'settings.aerial.cleared' });
			return { aerialOk: 'Esri-Schlüssel entfernt. Luftbild wieder nur für Niedersachsen (LGLN).' };
		}
		const key = String(f.get('esri_key') ?? '').trim();
		if (!/^[A-Za-z0-9._-]{20,400}$/.test(key)) return fail(400, { aerialError: 'Das sieht nicht nach einem gültigen API-Schlüssel aus.' });
		// Schlüssel mit einer Kachel über Bremen prüfen, bevor er gespeichert wird
		const r = await fetch(`${ESRI_TILES}/14/8592/5332?token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
		if (!r?.ok || !(r.headers.get('content-type') ?? '').startsWith('image/'))
			return fail(400, { aerialError: `Esri lehnt den Schlüssel ab (${r ? 'HTTP ' + r.status : 'nicht erreichbar'}). Ist „Basemaps“ für den Schlüssel freigegeben?` });
		await saveEsriKey(sql, key);
		await audit(sql, { actorId: user.id, action: 'settings.aerial.updated' });
		return { aerialOk: 'Gespeichert und geprüft. Das Luftbild deckt jetzt auch Bremen ab.' };
	},
	zuruecksetzen: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		const sql = db();
		await clearMailSettings(sql);
		await audit(sql, { actorId: user.id, action: 'settings.mail.cleared', targetType: 'settings', targetId: 'mail' });
		return { ok: 'Gespeicherte Mail-Einstellungen entfernt.' };
	}
};
