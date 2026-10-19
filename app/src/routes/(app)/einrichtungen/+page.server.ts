import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listOrgs } from '$lib/server/angebote/orgs';

export const load: PageServerLoad = async ({ url, locals }) => {
	const sql = db();
	const p = url.searchParams;
	const region = p.get('region') || null;
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const rows = await listOrgs(sql, { q: p.get('q'), kind: p.get('art'), region: regionRow?.code ?? null });
	return {
		orgs: rows.map((o) => ({ slug: o.slug as string, name: o.name as string, kind: o.kind as string, regionName: o.region_name as string | null, teaser: o.teaser as string })),
		filters: { q: p.get('q') ?? '', art: p.get('art') ?? '', region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null },
		member: !!(locals.user && locals.session?.mfaVerified)
	};
};
