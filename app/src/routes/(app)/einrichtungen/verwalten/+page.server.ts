import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { myOrgs } from '$lib/server/angebote/orgs';
import { partnerGroups } from '$lib/server/community/groups';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const orgs = await myOrgs(sql, user.id);
	const pending = await sql`select slug, name, status, decision_note, created_at from organizations
		where created_by = ${user.id} and status in ('beantragt', 'abgelehnt') order by created_at desc limit 10`;
	return {
		groups: await partnerGroups(sql, user.id),
		orgs: orgs.map((o) => ({ slug: o.slug as string, name: o.name as string, status: o.status as string, role: o.role as string })),
		pending: pending.map((p) => ({ name: p.name as string, status: p.status as string, note: p.decision_note as string | null, at: p.created_at as Date }))
	};
};
