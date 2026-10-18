import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const sources = await db()`select key, name, kind, operator, license, license_url, attribution, last_success_at,
		(select count(*)::int from place_sources s where s.source_key = d.key and s.gone_at is null) as n
		from data_sources d order by case kind when 'orte' then 1 when 'regionen' then 2 else 3 end, name`;
	const [{ community }] = await db()`select count(*)::int as community from places p where p.status = 'aktiv'
		and not exists (select 1 from place_sources s where s.place_id = p.id)`;
	return { sources, community };
};
