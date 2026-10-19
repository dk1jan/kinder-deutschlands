import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { todayIdeas } from '$lib/server/angebote/events';
import { berlinParts, berlinToUtc } from '$lib/server/angebote/recurrence';
import { AGE_GROUPS } from '$lib/angebote';

export const load: PageServerLoad = async ({ url, locals }) => {
	const sql = db();
	const viewer = { id: locals.user && locals.session?.mfaVerified ? locals.user.id : null };
	const p = url.searchParams;
	const c = berlinParts(new Date());
	const morgen = p.get('tag') === 'morgen';
	const day = new Date(berlinToUtc({ y: c.y, m: c.m, d: c.d, h: 0, mi: 0 }).getTime() + (morgen ? 86_400_000 : 0));
	const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
	const near = Number.isFinite(lat) && Number.isFinite(lon) && lat > 47 && lat < 56 && lon > 5 && lon < 16 ? { lat, lon, km: Math.min(Math.max(Number(p.get('km')) || 10, 1), 50) } : null;
	const region = p.get('region') || null;
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const ages = p.getAll('alter').filter((a) => a in AGE_GROUPS);
	const wo = p.get('wo') === 'drinnen' || p.get('wo') === 'draussen' ? p.get('wo') : null;
	const r = await todayIdeas(sql, viewer, { day, region: regionRow?.code ?? null, near, ages, setting: wo, free: p.get('kostenlos') === '1' });
	return {
		morgen,
		near: !!near,
		filters: { region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null, ages, wo: wo ?? '', kostenlos: p.get('kostenlos') === '1' },
		events: r.events.map((i) => ({ ...i, start: i.start.toISOString(), end: i.end?.toISOString() ?? null })),
		places: r.places
	};
};
