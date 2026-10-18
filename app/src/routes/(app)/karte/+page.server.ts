import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tileState } from '$lib/server/import/tiles';
import { placeCounts } from '$lib/server/places';
import { displayName, type Kind } from '$lib/places';
import { isUuid } from '$lib/server/contacts';

const BREMEN: [number, number] = [8.8017, 53.0793];

export const load: PageServerLoad = async ({ url, locals }) => {
	const sql = db();
	const [tiles, counts] = await Promise.all([tileState(sql), placeCounts(sql)]);
	let center: [number, number] = BREMEN;
	let zoom = 12.5;
	let focus: { id: string; k: Kind; n: string; f: string; lon: number; lat: number } | null = null;
	const lon = Number(url.searchParams.get('lon'));
	const lat = Number(url.searchParams.get('lat'));
	const z = Number(url.searchParams.get('z'));
	const ort = url.searchParams.get('ort');
	if (ort && isUuid(ort)) {
		const [p] = await sql`select p.id, p.kind, p.name, r.name as region_name, ST_X(p.location) as lon, ST_Y(p.location) as lat, p.features
			from places p left join regions r on r.code = p.region_code where p.id = ${ort} and p.status = 'aktiv'`;
		if (p) {
			center = [p.lon, p.lat];
			zoom = 16;
			focus = {
				id: p.id,
				k: p.kind,
				n: displayName(p.kind, p.name, p.region_name),
				f: Object.entries(p.features ?? {}).filter(([, v]) => v === true).map(([k]) => k).join(','),
				lon: p.lon,
				lat: p.lat
			};
		}
	} else if (Number.isFinite(lon) && Number.isFinite(lat) && lon > 5 && lon < 16 && lat > 47 && lat < 56) {
		center = [lon, lat];
		zoom = Number.isFinite(z) && z >= 5 && z <= 19 ? z : 14;
	} else if (locals.user) {
		// Grob eingetragene Region des Mitglieds als Startpunkt (nur für die eigene Ansicht)
		const [r] = await sql`select ST_X(r.center) as lon, ST_Y(r.center) as lat, r.level from user_profiles p join regions r on r.code = p.region_code
			where p.user_id = ${locals.user.id} and r.center is not null`;
		if (r) {
			center = [r.lon, r.lat];
			zoom = r.level === 'stadtteil' ? 14 : r.level === 'gemeinde' ? 13 : 11;
		}
	}
	// Liste ohne JavaScript bzw. vor dem Laden der Karte: nächste Orte zum Startpunkt
	const near = await sql`select p.id, p.kind, p.name, r.name as region_name,
			round(ST_Distance(p.location::geography, ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326)::geography))::int as m
		from places p left join regions r on r.code = p.region_code
		where p.status = 'aktiv' and p.location && ST_Expand(ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326), 0.08)
		order by p.location <-> ST_SetSRID(ST_MakePoint(${center[0]}, ${center[1]}), 4326) limit 30`;
	return {
		tiles: !!tiles?.present,
		counts,
		total: Object.values(counts).reduce((a, b) => a + (b ?? 0), 0),
		center,
		zoom,
		focus,
		near: near.map((p) => ({ id: p.id as string, kind: p.kind as Kind, name: displayName(p.kind, p.name, p.region_name), m: p.m as number })),
		loggedIn: !!locals.user
	};
};
