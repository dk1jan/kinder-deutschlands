import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { myInvitations } from '$lib/server/alltag/invitations';
import { listOccurrences } from '$lib/server/angebote/events';
import { subtree } from '$lib/server/angebote/common';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const mine = await myInvitations(sql, user.id);
	// Ideen: Orte und Termine in der eigenen Gegend (aus Familienkarte und Veranstaltungen – nichts Erfundenes)
	const [u] = await sql`select p.region_code, r.name from user_profiles p left join regions r on r.code = p.region_code where p.user_id = ${user.id}`;
	const region = (u?.region_code as string | null) ?? null;
	const places = region
		? await sql`select id, name, kind from places where status = 'aktiv' and name is not null and kind in ('indoorspielplatz', 'schwimmbad', 'ausflugsort', 'familiencafe')
			and region_code in ${subtree(sql, region)} order by kind, name limit 12`
		: [];
	const now = new Date();
	const events = region ? (await listOccurrences(sql, { id: user.id }, { from: now, to: new Date(now.getTime() + 60 * 86_400_000), region, kinds: ['workshop', 'kurs', 'fest'], limit: 8 })).filter((e) => !e.cancelled) : [];
	return {
		...mine,
		regionName: (u?.name as string | null) ?? null,
		places: places.map((p) => ({ id: p.id as string, name: p.name as string, kind: p.kind as string })),
		events: events.map((e) => ({ id: e.id, date: e.date, title: e.title, start: e.start.toISOString() }))
	};
};
