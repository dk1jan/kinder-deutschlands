import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listHelp } from '$lib/server/alltag/help';
import { HELP_CATEGORIES, HELP_KINDS } from '$lib/alltag';

export const load: PageServerLoad = async ({ url, locals }) => {
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	if (!viewer) return { member: false as const };
	const sql = db();
	const p = url.searchParams;
	const mine = p.get('ansicht') === 'meine';
	let region = p.get('region') || null;
	if (!region && !p.has('region') && !mine) {
		const [u] = await sql`select region_code from user_profiles where user_id = ${viewer}`;
		region = (u?.region_code as string | null) ?? null;
	}
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const kind = p.get('art') && p.get('art')! in HELP_KINDS ? p.get('art') : null;
	const category = p.get('thema') && p.get('thema')! in HELP_CATEGORIES ? p.get('thema') : null;
	const items = await listHelp(sql, viewer, mine ? { mine: true } : { kind, category, region: regionRow?.code ?? null, q: p.get('q') });
	return {
		member: true as const,
		mine,
		items,
		filters: { kind: kind ?? '', category: category ?? '', q: p.get('q') ?? '', region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null }
	};
};
