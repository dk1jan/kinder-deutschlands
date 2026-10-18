import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { normalizeContactId } from '$lib/server/contactid';
import { getProfileByContactId } from '$lib/server/profiles';
import { cardForViewer } from '$lib/server/cards';
import { rateLimit } from '$lib/server/ratelimit';
import { block, ContactError, sendRequest } from '$lib/server/contacts';
import { cleanText } from '$lib/server/validate';
import { audit } from '$lib/server/audit';

const NOT_FOUND = 'Keine Familie mit dieser ID gefunden. Prüfe die neun Zeichen noch einmal.';

// Exakte ID-Suche: nur angemeldet, begrenzt (gegen Durchprobieren), blockierte und unbestätigte Konten sind „nicht gefunden“.
export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const raw = event.url.searchParams.get('id') ?? '';
	if (!rateLimit(`idlookup:${user.id}`, 60, 3_600_000) || !rateLimit(`idlookup-ip:${event.getClientAddress()}`, 120, 3_600_000)) {
		error(429, 'Zu viele Suchen. Bitte in einer Stunde erneut versuchen.');
	}
	const cid = normalizeContactId(raw);
	if (!cid) return { found: null, query: raw, notFound: raw ? 'Das ist keine gültige Familien-ID. Sie hat neun Zeichen, zum Beispiel K7M-4QX-2HD.' : null };
	const sql = db();
	const owner = await getProfileByContactId(sql, cid);
	if (!owner) {
		await audit(sql, { actorId: user.id, action: 'id.lookup.miss' });
		return { found: null, query: raw, notFound: NOT_FOUND };
	}
	if (owner.user_id === user.id) redirect(303, '/profil/vorschau');
	const res = await cardForViewer(sql, owner.user_id, user.id);
	if (!res) return { found: null, query: raw, notFound: NOT_FOUND };
	return { found: { ...res, cid }, query: raw, notFound: null };
};

async function ownerOf(cid: string | null) {
	if (!cid) return null;
	return getProfileByContactId(db(), cid);
}

export const actions: Actions = {
	anfragen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const owner = await ownerOf(normalizeContactId(String(f.get('cid') ?? '')));
		if (!owner) return fail(404, { error: NOT_FOUND });
		try {
			return { done: await sendRequest(db(), user.id, owner.user_id, cleanText(f.get('message'), 300), 'id') };
		} catch (e) {
			if (e instanceof ContactError) return fail(400, { error: e.message });
			throw e;
		}
	},
	blockieren: async (event) => {
		const user = requireMember(event);
		const owner = await ownerOf(normalizeContactId(String((await event.request.formData()).get('cid') ?? '')));
		if (!owner) return fail(404, { error: NOT_FOUND });
		await block(db(), user.id, owner.user_id);
		redirect(303, '/nachrichten');
	}
};
