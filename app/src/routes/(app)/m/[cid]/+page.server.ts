import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { cardForViewer } from '$lib/server/cards';
import { getProfileByContactId } from '$lib/server/profiles';
import { normalizeContactId } from '$lib/server/contactid';
import { rateLimit } from '$lib/server/ratelimit';
import { sendRequest, ContactError } from '$lib/server/contacts';
import { cleanText } from '$lib/server/validate';

// Profilkarte per Familien-ID (F-051): Einstieg aus dem Forum, gleiche Karte wie nach dem QR-Scan.
// Nur für angemeldete Mitglieder; Sichtbarkeit wie überall (cardForViewer). Unbekannt, gesperrt,
// blockiert und ungültig sehen für Außenstehende gleich aus (keine Auskunft, wer es gibt).
const GONE = 'Diese Familie ist nicht (mehr) sichtbar.';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	if (!rateLimit(`profilkarte:${user.id}`, 120, 3_600_000)) error(429, 'Zu viele Aufrufe. Bitte später erneut versuchen.');
	const cid = normalizeContactId(event.params.cid);
	if (!cid) error(404, GONE);
	const sql = db();
	const owner = await getProfileByContactId(sql, cid);
	if (!owner) error(404, GONE);
	const res = await cardForViewer(sql, owner.user_id, user.id);
	if (!res) error(404, GONE);
	return { ...res, own: owner.user_id === user.id };
};

export const actions: Actions = {
	anfragen: async (event) => {
		const user = requireMember(event);
		if (!rateLimit(`profilkarte-anfrage:${user.id}`, 30, 3_600_000)) return fail(429, { error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
		const sql = db();
		const cid = normalizeContactId(event.params.cid);
		const owner = cid ? await getProfileByContactId(sql, cid) : null;
		if (!owner) return fail(404, { error: GONE });
		try {
			const r = await sendRequest(sql, user.id, owner.user_id, cleanText((await event.request.formData()).get('message'), 300), 'id');
			return { done: r };
		} catch (e) {
			if (e instanceof ContactError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
