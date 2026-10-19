import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { PostError } from '$lib/server/community/posts';
import { report } from '$lib/server/community/moderation';
import { getOrg, toggleFollow } from '$lib/server/angebote/orgs';
import { listOccurrences } from '$lib/server/angebote/events';
import { listOffers } from '$lib/server/angebote/offers';

export const load: PageServerLoad = async ({ params, locals }) => {
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const o = await getOrg(sql, params.slug, viewer);
	if (!o) error(404, 'Diese Einrichtung gibt es nicht (mehr).');
	const now = new Date();
	const [events, offers, notices] = await Promise.all([
		listOccurrences(sql, { id: viewer }, { from: now, to: new Date(now.getTime() + 120 * 86_400_000), orgId: o.id, limit: 30 }),
		listOffers(sql, { orgId: o.id }),
		sql`select id, kind, title, body, deadline, valid_from from notices where org_id = ${o.id} and status = 'aktiv' and (valid_until is null or valid_until > now()) order by valid_from desc limit 10`
	]);
	return {
		org: {
			id: o.id,
			slug: o.slug as string,
			name: o.name as string,
			kind: o.kind as string,
			status: o.status as string,
			description: o.description as string,
			topics: o.topics as string[],
			address: o.address as string | null,
			regionName: o.region_name as string | null,
			lat: o.lat as number | null,
			lon: o.lon as number | null,
			website: o.website as string | null,
			email: o.email as string | null,
			phone: o.phone as string | null,
			verifiedAt: o.verified_at as Date | null,
			followersText: o.followersText as string,
			following: o.following as boolean,
			role: o.role
		},
		events: events.map((i) => ({ ...i, start: i.start.toISOString(), end: i.end?.toISOString() ?? null })),
		offers,
		notices: notices.map((n) => ({ id: n.id as string, kind: n.kind as string, title: n.title as string, body: n.body as string, deadline: n.deadline as Date | null, at: n.valid_from as Date })),
		member: !!viewer
	};
};

export const actions: Actions = {
	folgen: async (event) => {
		const user = requireMember(event);
		const sql = db();
		const [o] = await sql`select id from organizations where slug = ${event.params.slug}`;
		if (!o) error(404);
		try {
			return { following: await toggleFollow(sql, user.id, o.id) };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	},
	melden: async (event) => {
		const user = requireMember(event);
		if (!rateLimit(`melden:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Meldungen.' });
		const sql = db();
		const [o] = await sql`select id from organizations where slug = ${event.params.slug}`;
		if (!o) error(404);
		const f = await event.request.formData();
		try {
			await report(sql, user.id, 'org', o.id, String(f.get('reason') ?? ''), cleanText(f.get('message'), 500));
			return { reported: true };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
