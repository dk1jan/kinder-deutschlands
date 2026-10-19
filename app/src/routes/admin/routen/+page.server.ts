import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { listRoutes } from '$lib/server/routes';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'routes.edit');
	const sql = db();
	const [pending, warn] = await Promise.all([
		listRoutes(sql, { status: 'pruefung' }),
		sql`select r.id, r.title, count(x.*)::int as n from stroller_routes r join route_reports x on x.route_id = r.id and x.kind <> 'passt' and x.ended_at is null
			where r.status = 'aktiv' group by r.id order by max(x.created_at) desc limit 50`
	]);
	return { pending, warn: warn.map((w) => ({ id: w.id as string, title: w.title as string, n: w.n as number })) };
};
