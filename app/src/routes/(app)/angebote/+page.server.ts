import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listOffers } from '$lib/server/angebote/offers';
import { AGE_GROUPS, OFFER_KINDS } from '$lib/angebote';

export const load: PageServerLoad = async ({ url }) => {
	const sql = db();
	const p = url.searchParams;
	const region = p.get('region') || null;
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const kinds = p.getAll('art').filter((k) => k in OFFER_KINDS);
	const ages = p.getAll('alter').filter((a) => a in AGE_GROUPS);
	const offers = await listOffers(sql, { region: regionRow?.code ?? null, kinds, ages, onlyAvailable: p.get('frei') === '1', q: p.get('q') });
	return {
		offers,
		filters: { region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null, kinds, ages, frei: p.get('frei') === '1', q: p.get('q') ?? '' }
	};
};
