import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { FamilyError, FAMILY_KINDS, myLinks, removeLink, requestLink, respondLink } from '$lib/server/family';
import { isUuid } from '$lib/server/contacts';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [p] = await sql`select visibility->>'family' as v from user_profiles where user_id = ${user.id}`;
	return { links: await myLinks(sql, user.id), kinds: FAMILY_KINDS, prefill: event.url.searchParams.get('id') ?? '', vis: (p?.v as string | null) ?? 'niemand' };
};

async function run(fn: () => Promise<void>, ok: string) {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof FamilyError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	anfragen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		return run(() => requestLink(db(), user.id, String(f.get('cid') ?? ''), String(f.get('kind') ?? '')), 'Anfrage geschickt. Die Verbindung gilt, sobald die andere Person bestätigt.');
	},
	antworten: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		const yes = f.get('accept') === '1';
		return run(() => respondLink(db(), user.id, id, yes), yes ? 'Verbunden.' : 'Abgelehnt.');
	},
	loesen: async (event) => {
		const user = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		return run(() => removeLink(db(), user.id, id), 'Verbindung gelöst.');
	}
};
