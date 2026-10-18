import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { queue, stats } from '$lib/server/community/moderation';
import { REASON_LABEL } from '$lib/server/community/automod';

export const load: PageServerLoad = async (event) => {
	const user = await requireAction(event, 'admin.access');
	const q = event.url.searchParams;
	const sql = db();
	const [cases, st] = await Promise.all([
		queue(sql, user.id, { status: q.get('status') ?? undefined, type: q.get('typ') ?? undefined, reason: q.get('grund') ?? undefined, priority: Number(q.get('prio')) || undefined, mine: q.has('meine') }),
		stats(sql)
	]);
	return { cases, stats: st, reasons: REASON_LABEL, filter: Object.fromEntries(q) };
};
