// Regionen mit Geometrie:
// - Länder, Kreise, Gemeinden amtlich aus BKG VG250 (WFS, © BKG, dl-de/by-2-0)
// - Stadtteile Bremen/Bremerhaven aus OpenStreetMap (ODbL), solange keine offene amtliche Geometrie angebunden ist (D-020)
import type { Sql } from '../db';
import { overpass, type FetchOptions } from './osm';
import { fetchRetry } from './net';

export const VG250_WFS = 'https://sgx.geodatenzentrum.de/wfs_vg250';

interface Vg250Feature {
	properties: { ars: string; gen: string; bez: string; gf: number; sn_l: string; bem?: string; beginn?: string };
	geometry: unknown;
}

async function wfs(type: string, land: string, fetchImpl: typeof fetch, base = process.env.VG250_URL || VG250_WFS): Promise<Vg250Feature[]> {
	if (!/^\d{2}$/.test(land)) throw new Error(`Ungültiger Landesschlüssel: ${land}`);
	const u = new URL(base);
	u.search = new URLSearchParams({
		service: 'WFS',
		version: '2.0.0',
		request: 'GetFeature',
		typeNames: `vg250:${type}`,
		srsName: 'EPSG:4326',
		outputFormat: 'application/json',
		cql_filter: `sn_l='${land}' AND gf=4`
	}).toString();
	let res: Response;
	try {
		res = await fetchRetry(u, { headers: { accept: 'application/json' }, timeoutMs: 10 * 60 * 1000 }, 3, Number(process.env.RETRY_WAIT_MS ?? 30000), fetchImpl);
	} catch (e) {
		throw new Error(`VG250 ${type}: ${(e as Error).message}`);
	}
	const text = await res.text();
	if (!text.startsWith('{')) throw new Error(`VG250 ${type}: keine GeoJSON-Antwort (${text.slice(0, 160)})`);
	const d = JSON.parse(text) as { features?: Vg250Feature[] };
	if (!Array.isArray(d.features)) throw new Error(`VG250 ${type}: unerwartete Antwort`);
	return d.features;
}

const LEVEL_NAME = (f: Vg250Feature['properties'], level: 'land' | 'kreis' | 'gemeinde') => {
	if (level === 'kreis' && /kreis/i.test(f.bez) && !/kreisfreie/i.test(f.bez)) return `${f.bez} ${f.gen}`;
	return f.gen;
};

async function upsertRegion(sql: Sql, code: string, name: string, level: string, parent: string, geomJson: string, source: string, version: string | null) {
	const g = sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)), 3))`;
	await sql`
		insert into regions (code, name, level, parent_code, geom, center, source, source_version, updated_at)
		values (${code}, ${name}, ${level}, ${parent}, ${g}, ST_PointOnSurface(${g}), ${source}, ${version}, now())
		on conflict (code) do update set
			-- Vorab angelegte Namen (z. B. „Bremen (Stadt)“) bleiben, damit Land und Stadt unterscheidbar sind
			name = case when regions.source = 'manuell' or regions.name like '%(%' then regions.name else excluded.name end,
			geom = excluded.geom, center = excluded.center, parent_code = coalesce(regions.parent_code, excluded.parent_code),
			source = excluded.source, source_version = excluded.source_version, updated_at = now()`;
}

/** Länder, Kreise, Gemeinden der eingestellten Länder. Kreisfreie Städte erscheinen nur als Kreis, nicht doppelt als Gemeinde. */
export async function importVg250(sql: Sql, cfg: { laender?: string[]; url?: string }, fetchImpl: typeof fetch = fetch) {
	const laender = cfg.laender?.length ? cfg.laender : ['03', '04'];
	const counts = { laender: 0, kreise: 0, gemeinden: 0 };
	let version: string | null = null;
	for (const land of laender) {
		const [lan, krs, gem] = [
			await wfs('vg250_lan', land, fetchImpl, cfg.url || undefined),
			await wfs('vg250_krs', land, fetchImpl, cfg.url || undefined),
			await wfs('vg250_gem', land, fetchImpl, cfg.url || undefined)
		];
		if (!lan.length || !krs.length) throw new Error(`VG250: keine Daten für Land ${land}`);
		version = `abgerufen ${new Date().toISOString().slice(0, 10)}`;
		await sql.begin(async (tx) => {
			const t = tx as unknown as Sql;
			for (const f of lan) {
				await upsertRegion(t, f.properties.ars, LEVEL_NAME(f.properties, 'land'), 'land', 'de', JSON.stringify(f.geometry), 'BKG VG250', version);
				counts.laender++;
			}
			for (const f of krs) {
				await upsertRegion(t, f.properties.ars, LEVEL_NAME(f.properties, 'kreis'), 'kreis', f.properties.ars.slice(0, 2), JSON.stringify(f.geometry), 'BKG VG250', version);
				counts.kreise++;
			}
			for (const f of gem) {
				if (f.properties.bem === 'kreisfrei') continue;
				await upsertRegion(t, f.properties.ars, LEVEL_NAME(f.properties, 'gemeinde'), 'gemeinde', f.properties.ars.slice(0, 5), JSON.stringify(f.geometry), 'BKG VG250', version);
				counts.gemeinden++;
			}
		});
	}
	return { counts, message: `VG250 (${version ?? ''}): ${counts.laender} Länder, ${counts.kreise} Kreise, ${counts.gemeinden} Gemeinden.` };
}

const ISO_LAND: Record<string, string> = {
	'DE-SH': '01', 'DE-HH': '02', 'DE-NI': '03', 'DE-HB': '04', 'DE-NW': '05', 'DE-HE': '06', 'DE-RP': '07', 'DE-BW': '08',
	'DE-BY': '09', 'DE-SL': '10', 'DE-BE': '11', 'DE-BB': '12', 'DE-MV': '13', 'DE-SN': '14', 'DE-ST': '15', 'DE-TH': '16'
};

interface OsmRel {
	type: 'relation';
	id: number;
	tags?: Record<string, string>;
	members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** Stadtteile (admin_level 10) eines Landes aus OSM. Zuordnung zur Stadt über die Lage in der Kreisgeometrie. */
export async function importOsmDistricts(sql: Sql, cfg: { iso?: string; admin_level?: number }, o: FetchOptions) {
	const iso = cfg.iso ?? 'DE-HB';
	const land = ISO_LAND[iso];
	if (!land) throw new Error(`Unbekanntes Land: ${iso}`);
	const lvl = cfg.admin_level ?? 10;
	if (!/^DE-[A-Z]{2}$/.test(iso) || !Number.isInteger(lvl)) throw new Error('Ungültige Einstellung für Stadtteile.');
	const q = `[out:json][timeout:300];area["ISO3166-2"="${iso}"]["admin_level"="4"]->.a;rel["boundary"="administrative"]["admin_level"="${lvl}"](area.a);out geom;`;
	const els = (await overpass(q, o)) as unknown as OsmRel[];
	const rels = els.filter((e) => e.type === 'relation' && e.tags?.name);
	if (!rels.length) throw new Error('OSM: keine Stadtteile gefunden.');
	const [{ n: parents }] = await sql`select count(*)::int as n from regions where level in ('kreis', 'gemeinde') and geom is not null and code like ${land + '%'}`;
	if (!parents) throw new Error('Noch keine Stadt-/Kreisgrenzen vorhanden – zuerst „Verwaltungsgebiete (VG250)“ abrufen. Wird danach automatisch wiederholt.');
	let n = 0;
	let skipped = 0;
	await sql.begin(async (tx) => {
		for (const r of rels) {
			const lines = (r.members ?? [])
				.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === 'inner' || m.role === '') && m.geometry && m.geometry.length > 1)
				.map((m) => m.geometry!.map((p) => [p.lon, p.lat]));
			if (!lines.length) {
				skipped++;
				continue;
			}
			const mls = JSON.stringify({ type: 'MultiLineString', coordinates: lines });
			const [g] = await tx`select ST_AsGeoJSON(ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_BuildArea(ST_LineMerge(ST_SetSRID(ST_GeomFromGeoJSON(${mls}), 4326)))), 3))) as geom`;
			if (!g?.geom) {
				skipped++;
				continue;
			}
			// Nur Städte/Gemeinden dieses Landes – Randstücke der Nachbarländer werden übersprungen
			const [parent] = await tx`select code from regions where level in ('kreis', 'gemeinde') and geom is not null and code like ${land + '%'}
				and ST_Covers(geom, ST_PointOnSurface(ST_GeomFromGeoJSON(${g.geom})))
				order by case level when 'gemeinde' then 1 else 2 end limit 1`;
			if (!parent) {
				skipped++;
				continue;
			}
			await upsertRegion(tx as unknown as Sql, `${parent.code}:st:${r.id}`, r.tags!.name, 'stadtteil', parent.code, g.geom, 'OpenStreetMap', null);
			n++;
		}
	});
	if (!n) throw new Error(`Kein Stadtteil zugeordnet (${skipped} übersprungen).`);
	return { counts: { stadtteile: n, uebersprungen: skipped }, message: `${n} Stadtteile aus OpenStreetMap${skipped ? `, ${skipped} übersprungen (außerhalb des Landes oder ohne Grenze)` : ''}.` };
}
