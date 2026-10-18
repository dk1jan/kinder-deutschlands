import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rateLimit } from '$lib/server/ratelimit';

const LEVEL = { land: 'Land', kreis: 'Kreis/Stadt', gemeinde: 'Gemeinde', stadtteil: 'Stadtteil' } as Record<string, string>;

// Regionssuche für Auswahlfelder (Profil, Entdecken). Nur Namen und Schlüssel, keine Personen.
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`regionen:${getClientAddress()}`, 120, 60_000)) error(429, 'Zu viele Anfragen.');
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
	if (q.length < 2) return json([]);
	const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
	const rows = await db()`select r.code, r.name, r.level, p.name as parent from regions r left join regions p on p.code = r.parent_code
		where r.level <> 'staat' and r.name ilike ${like}
		order by (r.name ilike ${q + '%'}) desc, case r.level when 'stadtteil' then 1 when 'gemeinde' then 2 when 'kreis' then 3 else 4 end, length(r.name)
		limit 12`;
	return json(rows.map((r) => ({ code: r.code, name: r.name, hint: [LEVEL[r.level] ?? r.level, r.parent].filter(Boolean).join(' · ') })), {
		headers: { 'cache-control': 'public, max-age=300' }
	});
};
