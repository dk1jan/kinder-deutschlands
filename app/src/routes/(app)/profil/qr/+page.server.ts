import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { createTemporaryQr, ensurePermanentQr, listQr, qrSvg, qrUrl, replacePermanentQr, revokeQr } from '$lib/server/qr';
import { cleanText } from '$lib/server/validate';

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) : null);

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	await ensurePermanentQr(sql, user.id);
	const rows = await listQr(sql, user.id);
	const now = Date.now();
	const items = await Promise.all(
		rows.map(async (r) => {
			const expired = !!r.expires_at && new Date(r.expires_at).getTime() <= now;
			const active = !r.revoked_at && !expired;
			return {
				id: r.id as string,
				kind: r.kind as string,
				label: (r.label as string) ?? '',
				active,
				state: r.revoked_at ? 'Gesperrt' : expired ? 'Abgelaufen' : 'Aktiv',
				created: fmt(r.created_at),
				expires: fmt(r.expires_at),
				lastScan: fmt(r.last_scanned_at),
				url: active ? qrUrl(r.token as string) : null,
				svg: active ? await qrSvg(r.token as string) : null
			};
		})
	);
	return { items };
};

export const actions: Actions = {
	befristet: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		try {
			await createTemporaryQr(db(), user.id, Number(f.get('hours')), cleanText(f.get('label'), 60));
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Fehler' });
		}
		return { ok: 'Befristeter Code erstellt.' };
	},
	sperren: async (event) => {
		const user = requireMember(event);
		await revokeQr(db(), user.id, String((await event.request.formData()).get('id') ?? ''));
		return { ok: 'Code gesperrt. Er funktioniert ab sofort nicht mehr.' };
	},
	ersetzen: async (event) => {
		const user = requireMember(event);
		await replacePermanentQr(db(), user.id);
		return { ok: 'Neuer QR-Code erstellt. Der alte funktioniert nicht mehr, bitte neu drucken.' };
	}
};
