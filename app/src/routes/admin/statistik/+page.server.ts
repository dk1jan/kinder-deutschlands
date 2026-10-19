import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { PERIODS, statistics } from '$lib/server/stats';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'stats.view');
	const sql = db();
	const p = event.url.searchParams.get('zeitraum') ?? '30';
	const days = PERIODS[p as keyof typeof PERIODS] ?? 30;
	const region = event.url.searchParams.get('region') || null;
	const [r] = region ? await sql`select code, name from regions where code = ${region}` : [];
	return {
		days,
		period: String(days),
		region: r ? { code: r.code as string, name: r.name as string } : null,
		groups: await statistics(sql, days, r?.code ?? null),
		at: new Date().toISOString()
	};
};
