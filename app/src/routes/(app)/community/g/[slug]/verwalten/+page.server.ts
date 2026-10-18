import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { decideRequest, groupBySlug, members, pendingRequests, removeMember } from '$lib/server/community/groups';
import { PostError } from '$lib/server/community/posts';
import { isUuid } from '$lib/server/contacts';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const g = await groupBySlug(sql, user.id, event.params.slug);
	if (!g || !g.access.moderator) error(404, 'Nicht gefunden.');
	return { g, requests: await pendingRequests(sql, user.id, g.id), members: await members(sql, user.id, g.id) };
};

async function act(event: Parameters<Actions[string]>[0], fn: (sql: ReturnType<typeof db>, mod: string, gid: string, uid: string, f: FormData) => Promise<void>) {
	const user = requireMember(event);
	const sql = db();
	const g = await groupBySlug(sql, user.id, event.params.slug as string);
	if (!g) error(404);
	const f = await event.request.formData();
	const uid = String(f.get('user') ?? '');
	if (!isUuid(uid)) return fail(400, { error: 'Ungültig.' });
	try {
		await fn(sql, user.id, g.id, uid, f);
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
	return { ok: true };
}

export const actions: Actions = {
	entscheiden: (e) => act(e, (sql, mod, gid, uid, f) => decideRequest(sql, mod, gid, uid, f.get('accept') === '1')),
	entfernen: (e) => act(e, (sql, mod, gid, uid) => removeMember(sql, mod, gid, uid))
};
