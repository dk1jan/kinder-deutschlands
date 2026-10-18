import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAction } from '$lib/server/guard';
import { db } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { clearMailSettings, MailSettingsError, mailSettingsView, saveMailSettings } from '$lib/server/mailsettings';
import { describeMailError, mails, sendMail, verifyMailServer } from '$lib/server/mailer';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'settings.manage');
	return { mail: mailSettingsView() };
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
	zuruecksetzen: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		const sql = db();
		await clearMailSettings(sql);
		await audit(sql, { actorId: user.id, action: 'settings.mail.cleared', targetType: 'settings', targetId: 'mail' });
		return { ok: 'Gespeicherte Mail-Einstellungen entfernt.' };
	}
};
