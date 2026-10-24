// Orte lesen und von Mitgliedern ergänzen (M10/M11/M13). Öffentliche Daten – private Angaben kommen hier nicht vor.
import type { Sql } from './db';
import { notifyPlaceFollowers } from './follows';
import { displayName, isKind, KINDS, KIND_FILTERS, FEATURES, type Kind } from '$lib/places';

export interface Bbox {
	w: number;
	s: number;
	e: number;
	n: number;
}

export function parseBbox(v: string | null): Bbox | null {
	if (!v) return null;
	const p = v.split(',').map(Number);
	if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) return null;
	const [w, s, e, n] = p;
	if (w >= e || s >= n || w < -180 || e > 180 || s < -85 || n > 85) return null;
	// Sehr große Ausschnitte begrenzen (Schutz vor Massenabfragen)
	if (e - w > 8 || n - s > 5) return null;
	return { w, s, e, n };
}

/** Kartenfilter (Chip-Schlüssel) → Ortsarten und optionale Merkmal-Alternativen. */
export function resolveFilters(keys: string[]): { kinds: Kind[]; orFeature: string[] } {
	const kinds = new Set<Kind>();
	const orFeature = new Set<string>();
	for (const k of keys) {
		const f = KIND_FILTERS.find((x) => x.key === k);
		if (!f) continue;
		f.kinds.forEach((x) => kinds.add(x));
		if (f.feature) orFeature.add(f.feature);
	}
	return { kinds: [...kinds], orFeature: [...orFeature] };
}

export const MAX_FEATURES = 6000;

/** Punkte für die Karte als GeoJSON. Kurze Eigenschaften halten die Antwort klein. */
export async function placesInBbox(sql: Sql, b: Bbox, filterKeys: string[], requireFeatures: string[]) {
	const { kinds, orFeature } = resolveFilters(filterKeys.length ? filterKeys : KIND_FILTERS.map((f) => f.key));
	const feats = requireFeatures.filter((f) => f in FEATURES);
	const rows = await sql`
		select p.id, p.kind, p.name, r.name as region_name, ST_X(p.location) as lon, ST_Y(p.location) as lat, p.features
		from places p left join regions r on r.code = p.region_code
		where p.status = 'aktiv'
			and p.location && ST_MakeEnvelope(${b.w}, ${b.s}, ${b.e}, ${b.n}, 4326)
			and (p.kind = any(${kinds}::text[]) ${orFeature.length ? sql`or (${sql.unsafe(orFeature.map((f) => `(p.features->>'${f.replace(/[^a-z_]/g, '')}') = 'true'`).join(' or '))})` : sql``})
			${feats.length ? sql`and p.features @> ${sql.json(Object.fromEntries(feats.map((f) => [f, true])) as never)}::jsonb` : sql``}
		limit ${MAX_FEATURES + 1}`;
	const truncated = rows.length > MAX_FEATURES;
	return {
		type: 'FeatureCollection' as const,
		truncated,
		features: rows.slice(0, MAX_FEATURES).map((r) => ({
			type: 'Feature' as const,
			geometry: { type: 'Point' as const, coordinates: [Number(r.lon.toFixed(6)), Number(r.lat.toFixed(6))] },
			properties: {
				id: r.id as string,
				k: r.kind as Kind,
				n: displayName(r.kind, r.name, r.region_name),
				// nur „ja“-Merkmale, kommagetrennt
				f: Object.entries((r.features ?? {}) as Record<string, unknown>)
					.filter(([k, v]) => v === true && k in FEATURES)
					.map(([k]) => k)
					.join(',')
			}
		}))
	};
}

/** Rastergröße der Deutschland-Übersicht (Grad) je Zoomstufe. */
export function gridCell(zoom: number): number {
	return zoom < 5.5 ? 0.6 : zoom < 6.5 ? 0.3 : zoom < 7.5 ? 0.15 : 0.08;
}

// Übersicht ganz Deutschland (Jan 24.10.): weit herausgezoomt Kreise mit Anzahl statt Einzelpunkten – gleiche Filter wie
// die Karte. Ergebnis je Filter und Raster 10 Minuten im Speicher (das ganze Land, keine Personen, nur Zählungen von Orten).
const gridCache = new Map<string, { at: number; v: { cells: [number, number, number][]; total: number } }>();
export async function placesGrid(sql: Sql, filterKeys: string[], requireFeatures: string[], cell: number) {
	const keys = [...filterKeys].sort();
	const feats = requireFeatures.filter((f) => f in FEATURES).sort();
	const ck = `${keys.join(',')}|${feats.join(',')}|${cell}`;
	const hit = gridCache.get(ck);
	if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.v;
	const { kinds, orFeature } = resolveFilters(keys.length ? keys : KIND_FILTERS.map((f) => f.key));
	const rows = await sql`
		select avg(ST_X(p.location))::float8 as lon, avg(ST_Y(p.location))::float8 as lat, count(*)::int as n
		from places p
		where p.status = 'aktiv'
			and (p.kind = any(${kinds}::text[]) ${orFeature.length ? sql`or (${sql.unsafe(orFeature.map((f) => `(p.features->>'${f.replace(/[^a-z_]/g, '')}') = 'true'`).join(' or '))})` : sql``})
			${feats.length ? sql`and p.features @> ${sql.json(Object.fromEntries(feats.map((f) => [f, true])) as never)}::jsonb` : sql``}
		group by ST_SnapToGrid(p.location, ${cell}::float8)`;
	const v = {
		cells: rows.map((r) => [Math.round(r.lon * 1e4) / 1e4, Math.round(r.lat * 1e4) / 1e4, r.n as number] as [number, number, number]),
		total: rows.reduce((a, r) => a + (r.n as number), 0)
	};
	if (gridCache.size > 200) gridCache.clear();
	gridCache.set(ck, { at: Date.now(), v });
	return v;
}

export async function searchPlaces(sql: Sql, q: string) {
	const term = q.trim().slice(0, 80);
	if (term.length < 2) return { places: [], regions: [] };
	const like = `%${term.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
	const [places, regions] = await Promise.all([
		sql`select p.id, p.kind, p.name, r.name as region_name, ST_X(p.location) as lon, ST_Y(p.location) as lat
			from places p left join regions r on r.code = p.region_code
			where p.status = 'aktiv' and p.name ilike ${like}
			order by (p.name ilike ${term + '%'}) desc, length(p.name) limit 8`,
		sql`select code, name, level, ST_XMin(geom) as w, ST_YMin(geom) as s, ST_XMax(geom) as e, ST_YMax(geom) as n
			from regions where geom is not null and level <> 'staat' and name ilike ${like}
			order by (name ilike ${term + '%'}) desc, case level when 'stadtteil' then 1 when 'gemeinde' then 2 when 'kreis' then 3 else 4 end, length(name) limit 6`
	]);
	return {
		places: places.map((p) => ({ id: p.id as string, kind: p.kind as Kind, name: displayName(p.kind, p.name, p.region_name), region: p.region_name as string | null, lon: p.lon as number, lat: p.lat as number })),
		regions: regions.map((r) => ({ code: r.code as string, name: r.name as string, level: r.level as string, bbox: [r.w, r.s, r.e, r.n] as [number, number, number, number] }))
	};
}

export async function getPlace(sql: Sql, id: string, viewerId: string | null) {
	const [p] = await sql`
		select p.*, ST_X(p.location) as lon, ST_Y(p.location) as lat, r.name as region_name, pr.name as parent_region_name,
			(p.area is not null) as has_area
		from places p left join regions r on r.code = p.region_code left join regions pr on pr.code = r.parent_code
		where p.id = ${id}`;
	if (!p) return null;
	const [sources, notices, nearToilet, fav, favCount] = await Promise.all([
		sql`select s.external_url, s.first_seen_at, s.last_seen_at, s.changed_at, s.gone_at, d.name, d.operator, d.attribution, d.license, d.license_url
			from place_sources s join data_sources d on d.key = s.source_key where s.place_id = ${id} order by s.first_seen_at`,
		sql`select kind, origin, text, source_url, created_at, valid_until from place_notices
			where place_id = ${id} and ended_at is null and (valid_until is null or valid_until > now()) order by created_at desc`,
		p.kind === 'spielplatz'
			? sql`select t.id, t.name, round(ST_Distance(t.location::geography, ${sql`(select location from places where id = ${id})`}::geography))::int as m,
					(t.features->>'wickeltisch') = 'true' as wickeln
				from places t where t.kind = 'toilette' and t.status = 'aktiv'
				and ST_DWithin(t.location::geography, (select location from places where id = ${id})::geography, 300)
				order by m limit 3`
			: Promise.resolve([]),
		viewerId ? sql`select notify from place_favorites where user_id = ${viewerId} and place_id = ${id}` : Promise.resolve([]),
		sql`select count(*)::int as n from place_favorites where place_id = ${id}`
	]);
	return {
		id: p.id as string,
		kind: p.kind as Kind,
		kindLabel: KINDS[p.kind as Kind]?.label ?? 'Ort',
		name: displayName(p.kind, p.name, p.region_name),
		hasOwnName: !!p.name,
		description: p.description as string | null,
		lon: p.lon as number,
		lat: p.lat as number,
		address: p.address as Record<string, string>,
		region: p.region_name as string | null,
		parentRegion: p.parent_region_name as string | null,
		features: p.features as Record<string, unknown>,
		openingHours: p.opening_hours as string | null,
		website: p.website as string | null,
		status: p.status as string,
		confirmation: p.confirmation as string,
		createdBy: p.created_by as string | null,
		checkedAt: p.checked_at as Date | null,
		updatedAt: p.updated_at as Date,
		sources: sources.map((s) => ({
			name: s.name as string,
			operator: s.operator as string,
			attribution: s.attribution as string,
			license: s.license as string,
			licenseUrl: s.license_url as string | null,
			url: s.external_url as string | null,
			firstSeen: s.first_seen_at as Date,
			lastSeen: s.last_seen_at as Date,
			changed: s.changed_at as Date,
			gone: s.gone_at as Date | null
		})),
		notices: notices.map((n) => ({ kind: n.kind as string, origin: n.origin as string, text: n.text as string | null, sourceUrl: n.source_url as string | null, at: n.created_at as Date, until: n.valid_until as Date | null })),
		nearToilets: (nearToilet as { id: string; name: string | null; m: number; wickeln: boolean }[]).map((t) => ({ id: t.id, name: t.name ?? 'Toilette', m: t.m, wickeln: t.wickeln })),
		favorite: (fav as unknown[]).length > 0,
		notify: !!(fav as { notify: boolean }[])[0]?.notify,
		favoriteCount: favCount[0].n as number
	};
}

export async function toggleFavorite(sql: Sql, userId: string, placeId: string): Promise<boolean> {
	const del = await sql`delete from place_favorites where user_id = ${userId} and place_id = ${placeId}`;
	if (del.count) return false;
	await sql`insert into place_favorites (user_id, place_id) select ${userId}, id from places where id = ${placeId} and status = 'aktiv'
		on conflict do nothing`;
	return true;
}

export async function favorites(sql: Sql, userId: string) {
	const rows = await sql`select p.id, p.kind, p.name, r.name as region_name, f.created_at
		from place_favorites f join places p on p.id = f.place_id left join regions r on r.code = p.region_code
		where f.user_id = ${userId} order by f.created_at desc`;
	return rows.map((r) => ({ id: r.id as string, kind: r.kind as Kind, name: displayName(r.kind, r.name, r.region_name), region: r.region_name as string | null }));
}

export async function reportPlace(sql: Sql, userId: string, placeId: string, kind: string, message: string | null) {
	const [r] = await sql`insert into place_reports (place_id, user_id, kind, message)
		select id, ${userId}, ${kind}, ${message} from places where id = ${placeId} returning id`;
	if (!r) return null;
	// F-028: Orte, die nur aus Overture stammen (Firmenverzeichnisse, teils veraltet), bei „gibt es nicht mehr“ sofort
	// ausblenden, bis die Redaktion entscheidet. OSM-Orte und bestätigte Orte bleiben sichtbar.
	if (kind === 'existiert_nicht') await hideIfOnlyOverture(sql, placeId);
	// Defekt/Sperrung sofort als unbestätigter Nutzerhinweis sichtbar – ohne Freitext (der geht nur an die Redaktion)
	if (kind === 'defekt' || kind === 'gesperrt') {
		const [open] = await sql`select 1 from place_notices where place_id = ${placeId} and kind = ${kind} and ended_at is null`;
		if (!open) {
			await sql`insert into place_notices (place_id, kind, origin, report_id, created_by, valid_until)
				values (${placeId}, ${kind}, 'nutzer', ${r.id}, ${userId}, now() + interval '30 days')`;
			await notifyPlaceFollowers(sql, placeId, `{ort}: ${kind === 'gesperrt' ? 'gesperrt' : 'etwas ist defekt'} (Hinweis eines Mitglieds, unbestätigt)`, null, userId);
		}
	}
	return r.id as string;
}

/** Nur aus Overture, unbestätigt, sichtbar → in Prüfung (unsichtbar). Gibt zurück, ob ausgeblendet wurde. */
export async function hideIfOnlyOverture(sql: Sql, placeId: string): Promise<boolean> {
	const r = await sql`update places p set status = 'pruefung', updated_at = now()
		where p.id = ${placeId} and p.status = 'aktiv' and p.confirmation = 'importiert'
		and exists (select 1 from place_sources s where s.place_id = p.id and s.gone_at is null and s.source_key in (select key from data_sources where config->>'type' = 'overture'))
		and not exists (select 1 from place_sources s where s.place_id = p.id and s.gone_at is null and s.source_key not in (select key from data_sources where config->>'type' = 'overture'))`;
	return r.count > 0;
}

export async function nearbySameKind(sql: Sql, kind: Kind, lon: number, lat: number, meters = 80) {
	const rows = await sql`select p.id, p.name, r.name as region_name, p.status,
			round(ST_Distance(p.location::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography))::int as m
		from places p left join regions r on r.code = p.region_code
		where p.kind = ${kind} and p.status in ('aktiv', 'pruefung')
			and ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${meters})
		order by m limit 5`;
	return rows.map((r) => ({ id: r.id as string, name: displayName(kind, r.name, r.region_name), m: r.m as number, pending: r.status === 'pruefung' }));
}

export interface Suggestion {
	kind: Kind;
	name: string | null;
	lon: number;
	lat: number;
	description: string | null;
	features: Record<string, boolean>;
	openingHours: string | null;
}

/** Vorschlag eines Mitglieds: Status „Prüfung“, sichtbar erst nach Freigabe durch die Redaktion. */
export async function suggestPlace(sql: Sql, userId: string, s: Suggestion): Promise<string> {
	if (!isKind(s.kind)) throw new Error('Ungültige Art.');
	const [p] = await sql`insert into places (kind, name, description, location, features, opening_hours, status, confirmation, created_by)
		values (${s.kind}, ${s.name}, ${s.description}, ST_SetSRID(ST_MakePoint(${s.lon}, ${s.lat}), 4326), ${sql.json(s.features as never)},
			${s.openingHours}, 'pruefung', 'community', ${userId})
		returning id`;
	await sql`update places p set region_code = (select r.code from regions r where r.geom is not null and ST_Covers(r.geom, p.location)
		order by case r.level when 'stadtteil' then 1 when 'gemeinde' then 2 when 'kreis' then 3 else 4 end limit 1) where p.id = ${p.id}`;
	return p.id as string;
}

export async function mySuggestions(sql: Sql, userId: string) {
	const rows = await sql`select p.id, p.kind, p.name, p.status, p.created_at, r.name as region_name from places p
		left join regions r on r.code = p.region_code where p.created_by = ${userId} order by p.created_at desc limit 50`;
	return rows.map((r) => ({ id: r.id as string, kind: r.kind as Kind, name: displayName(r.kind, r.name, r.region_name), status: r.status as string, at: r.created_at as Date }));
}

/** Kennzahlen für die öffentliche Kartenseite: nur echte Zählungen, keine Schätzungen. */
export async function placeCounts(sql: Sql) {
	const rows = await sql`select kind, count(*)::int as n from places where status = 'aktiv' group by kind`;
	return Object.fromEntries(rows.map((r) => [r.kind, r.n])) as Partial<Record<Kind, number>>;
}
