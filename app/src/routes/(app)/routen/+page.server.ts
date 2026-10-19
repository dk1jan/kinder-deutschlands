import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listRoutes, SURFACES } from '$lib/server/routes';
import { tileState } from '$lib/server/import/tiles';

export const load: PageServerLoad = async ({ url, locals }) => {
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const p = url.searchParams;
	const region = p.get('region') || null;
	const [r] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
	const near = Number.isFinite(lat) && Number.isFinite(lon) && lat > 47 && lat < 56 && lon > 5 && lon < 16 ? { lat, lon, km: 10 } : null;
	const maxKm = Number(p.get('maxkm')) || null;
	const surface = p.get('untergrund') && p.get('untergrund')! in SURFACES ? p.get('untergrund') : null;
	const [routes, mine, tiles] = await Promise.all([
		listRoutes(sql, { region: near ? null : (r?.code ?? null), near, maxKm, surface, noStairs: p.get('treppen') === 'nein', flat: p.get('eben') === '1', loop: p.get('rund') === '1' }),
		viewer ? listRoutes(sql, { mine: viewer }) : [],
		tileState(sql).catch(() => null)
	]);
	return {
		routes,
		mine: mine.filter((x) => x.status !== 'aktiv'),
		filters: { region: r ? { code: r.code as string, name: r.name as string } : null, maxKm, surface: surface ?? '', noStairs: p.get('treppen') === 'nein', flat: p.get('eben') === '1', loop: p.get('rund') === '1', near: !!near },
		member: !!viewer,
		tiles: !!tiles?.present
	};
};
