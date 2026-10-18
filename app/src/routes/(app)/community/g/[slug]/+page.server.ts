import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { groupBySlug, join, leave } from '$lib/server/community/groups';
import { feed, PostError } from '$lib/server/community/posts';
import { rateLimit } from '$lib/server/ratelimit';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const g = await groupBySlug(sql, user.id, event.params.slug);
	if (!g) error(404, 'Gruppe nicht gefunden.');
	const canRead = g.access.member || g.access.moderator;
	const posts = canRead ? await feed(sql, user.id, { mode: 'neu', groupId: g.id, before: event.url.searchParams.get('vor') }) : null;
	const [{ pending }] = g.access.moderator ? await sql`select count(*)::int as pending from group_members where group_id = ${g.id} and status = 'angefragt'` : [{ pending: 0 }];
	return { g, posts, pending };
};

export const actions: Actions = {
	beitreten: async (event) => {
		const user = requireMember(event);
		if (!rateLimit(`gruppe:${user.id}`, 10, 24 * 3600 * 1000)) return fail(429, { error: 'Zu viele Anfragen heute.' });
		const sql = db();
		const g = await groupBySlug(sql, user.id, event.params.slug);
		if (!g) error(404);
		const f = await event.request.formData();
		try {
			const status = await join(sql, user.id, g.id, String(f.get('pseudonym') ?? '') || null, f.getAll('answer').map(String));
			return { joined: status };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	},
	verlassen: async (event) => {
		const user = requireMember(event);
		const sql = db();
		const g = await groupBySlug(sql, user.id, event.params.slug);
		if (!g) error(404);
		await leave(sql, user.id, g.id);
		return { left: true };
	}
};
