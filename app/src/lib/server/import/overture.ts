// Overture Maps Places als zweite Quelle neben OSM (F-028, D-078). Overture enthält Firmeneinträge u. a. von Meta und
// Microsoft (keine OSM-Daten) – gerade kommerzielle Indoorspielplätze fehlen in OSM oft. Lizenz CDLA-Permissive-2.0 bzw.
// Apache-2.0 je Quelle, Namensnennung nötig. Kategorien sind unzuverlässig (Jans Test 23.10.2026: Reitverein und
// Schützenverein als „Freizeitpark“, Indoorspielplatz als „Park“) – darum strenge Regeln in classify().
//
// Abruf ohne Zusatzprogramm: Die Parquet-Dateien liegen öffentlich bei AWS; wir lesen per HTTP-Range nur die
// Zeilengruppen, deren Ausdehnung (bbox-Statistik) Deutschland berührt, und nur die nötigen Spalten.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parquetMetadataAsync, parquetReadObjects, type AsyncBuffer, type FileMetaData } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import type { Features, Kind } from '$lib/places';
import type { ImportRecord } from './types';
import { fetchRetry } from './net';
import type { Sql } from '../db';

export const OVERTURE_BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';
const overtureBase = () => (process.env.OVERTURE_URL || OVERTURE_BASE).replace(/\/$/, '');
/** Deutschland mit etwas Rand; was knapp außerhalb liegt, fliegt über das Land in der Adresse bzw. die Regionszuordnung raus. */
export const DE_BBOX = { xmin: 5.86, xmax: 15.05, ymin: 47.27, ymax: 55.06 };
const COLUMNS = ['id', 'bbox', 'names', 'taxonomy', 'basic_category', 'confidence', 'websites', 'addresses', 'operating_status'];

export interface OvPlace {
	id: string;
	bbox?: { xmin: number; xmax: number; ymin: number; ymax: number } | null;
	names?: { primary?: string | null } | null;
	taxonomy?: { primary?: string | null; hierarchy?: string[] | null } | null;
	basic_category?: string | null;
	confidence?: number | null;
	websites?: string[] | null;
	addresses?: { freeform?: string | null; locality?: string | null; postcode?: string | null; country?: string | null }[] | null;
	operating_status?: string | null;
}

// ---------- Regeln (geprüft an Jans Stichprobe Bremen, 23.10.2026) ----------

/** Name sagt eindeutig „Indoorspielplatz“ – dann zählt die (oft falsche) Kategorie nicht, nur Freizeit-Oberbereiche. */
const STRONG = /indoor.?spiel|spielparadies|trampolin.?(park|halle)|jump.?house|kinderspielhalle|indoor.?park|spielarena|tobeland|hüpfburg.?(halle|land|welt|park)/i;
/** Kinderwort im Namen – Pflicht bei unscharfen Kategorien (Kinderfreizeit, Freizeitpark). */
const KID = /indoor|abenteuer|spiel|kiddo|kinder|kids|hüpf|jump|trampolin|tobe|play/i;
/** Nie übernehmen: Vereine, Märkte, Spielhallen (Glücksspiel!), Spielplätze draußen, Unterkünfte, IKEA-Småland … */
const BAD =
	/verein|\be\.\s?v\b|schütz|schuetz|(oster|sommer|herbst|fr(ü|ue)hlings)wiese|markt|\breit|sportverein|turn|schausteller|hostel|hotel|golf|zahn|praxis|schule|\bkita\b|kindergarten|tagespflege|(?<!kinder)spielhalle|spielothek|casino|spielwaren|småland|smaland/i;
/** Spielplätze draußen hat OSM besser; „Indoorspielplatz“ bleibt. */
const OUTDOOR = (n: string) => /spielplatz/i.test(n) && !/indoor/i.test(n);
const FREIZEIT = new Set(['arts_and_entertainment', 'sports_and_recreation', 'active_life', 'attractions_and_activities', 'services_and_business']);
const INDOOR_TRUSTED = new Set(['indoor_playcenter', 'trampoline_park']);
const INDOOR_FUZZY = new Set(['kids_recreation_and_party', 'amusement_park']);
const AUSFLUG: Record<string, string> = { childrens_museum: 'Kindermuseum', petting_zoo: 'Kinderbauernhof' };

export interface Rule {
	kind: Kind;
	einrichtung: string | null;
}

/** Entscheidet, ob und als was ein Overture-Ort übernommen wird. null = weglassen. */
export function classify(p: OvPlace, minConf = 0.8): Rule | null {
	const name = p.names?.primary?.trim();
	if (!name) return null;
	if (p.operating_status && p.operating_status !== 'open') return null;
	const country = p.addresses?.find((a) => a?.country)?.country;
	if (country && country !== 'DE') return null;
	if (BAD.test(name) || OUTDOOR(name)) return null;
	const conf = p.confidence ?? 0;
	const cat = p.taxonomy?.primary ?? p.basic_category ?? '';
	const root = p.taxonomy?.hierarchy?.[0] ?? '';
	const trampoline = cat === 'trampoline_park' || /trampolin/i.test(name);
	const indoor = { kind: 'indoorspielplatz' as Kind, einrichtung: trampoline ? 'Trampolinhalle' : null };
	if (INDOOR_TRUSTED.has(cat) && conf >= minConf) return indoor;
	if (INDOOR_FUZZY.has(cat) && conf >= minConf && KID.test(name)) return indoor;
	if (STRONG.test(name) && conf >= Math.min(minConf, 0.7) && (FREIZEIT.has(root) || INDOOR_FUZZY.has(cat))) return indoor;
	if (AUSFLUG[cat] && conf >= minConf) return { kind: 'ausflugsort', einrichtung: AUSFLUG[cat] };
	return null;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function webUrl(ws: string[] | null | undefined): string | null {
	for (const w of ws ?? []) {
		try {
			const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
			if ((u.protocol === 'http:' || u.protocol === 'https:') && u.toString().length <= 500) return u.toString();
		} catch {
			/* nächste */
		}
	}
	return null;
}

/** „Löwenhof 4“ → Straße + Hausnummer; sonst alles als Straße. */
function addressOf(p: OvPlace): Record<string, string> {
	const a = p.addresses?.[0];
	const out: Record<string, string> = {};
	if (!a) return out;
	if (a.freeform) {
		const m = /^(.*?\S)\s+(\d+\s?[a-zA-Z]?(?:\s?[-/]\s?\d+\s?[a-zA-Z]?)?)$/.exec(a.freeform.trim());
		if (m) {
			out.street = m[1];
			out.housenumber = m[2];
		} else out.street = a.freeform.trim();
	}
	if (a.postcode) out.postcode = a.postcode;
	if (a.locality) out.city = a.locality;
	return out;
}

export function toRecord(p: OvPlace, minConf = 0.8): ImportRecord | null {
	const rule = classify(p, minConf);
	const b = p.bbox;
	if (!rule || !b || !Number.isFinite(b.xmin) || !Number.isFinite(b.ymin)) return null;
	const lon = (b.xmin + (b.xmax ?? b.xmin)) / 2;
	const lat = (b.ymin + (b.ymax ?? b.ymin)) / 2;
	if (lon < DE_BBOX.xmin || lon > DE_BBOX.xmax || lat < DE_BBOX.ymin || lat > DE_BBOX.ymax) return null;
	const features: Features = {};
	if (rule.einrichtung) features.einrichtung = rule.einrichtung;
	const name = p.names!.primary!.trim();
	return {
		externalId: p.id,
		kind: rule.kind,
		name: name.length <= 200 ? name : name.slice(0, 200),
		lon: round(lon),
		lat: round(lat),
		area: null,
		address: addressOf(p),
		features,
		openingHours: null,
		website: webUrl(p.websites),
		url: null,
		// Nur stabile Angaben – die Zuverlässigkeit schwankt von Ausgabe zu Ausgabe und würde jeden Ort „geändert“ melden
		raw: { kategorie: p.taxonomy?.primary ?? p.basic_category ?? '' }
	};
}

// ---------- Parquet lesen ----------

type Stat = { min_value?: unknown; max_value?: unknown; min?: unknown; max?: unknown } | undefined;
const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : NaN);

/** Liegt die Zeilengruppe (laut Statistik) ganz außerhalb des Gebiets? Ohne Statistik: lieber lesen. */
export function groupOutside(md: FileMetaData, g: number, box = DE_BBOX): boolean {
	const stat = (path: string): Stat => md.row_groups[g].columns.find((c) => c.meta_data?.path_in_schema.join('.') === path)?.meta_data?.statistics as Stat;
	const lo = (s: Stat) => num(s?.min_value ?? s?.min);
	const hi = (s: Stat) => num(s?.max_value ?? s?.max);
	const xmin = stat('bbox.xmin'), xmax = stat('bbox.xmax'), ymin = stat('bbox.ymin'), ymax = stat('bbox.ymax');
	if (hi(xmin) < box.xmin || lo(xmax) > box.xmax) return true; // Vergleiche mit NaN sind false → im Zweifel lesen
	if (hi(ymin) < box.ymin || lo(ymax) > box.ymax) return true;
	return false;
}

export interface ReadStats {
	dateien: number;
	gruppen: number;
	gruppen_gelesen: number;
	zeilen_gelesen: number;
}

/** Liest aus einer Parquet-Datei alle Orte im Deutschland-Rechteck, die classify() übernimmt. */
export async function readParquet(file: AsyncBuffer, minConf: number, stats: ReadStats, signal?: AbortSignal): Promise<OvPlace[]> {
	const md = await parquetMetadataAsync(file);
	const have = new Set(md.schema.map((s) => s.name));
	const columns = COLUMNS.filter((c) => have.has(c));
	const out: OvPlace[] = [];
	let start = 0;
	stats.dateien++;
	for (let g = 0; g < md.row_groups.length; g++) {
		const n = Number(md.row_groups[g].num_rows);
		const from = start;
		start += n;
		stats.gruppen++;
		if (groupOutside(md, g)) continue;
		if (signal?.aborted) throw new Error('Abruf abgebrochen (Zeitlimit).');
		stats.gruppen_gelesen++;
		stats.zeilen_gelesen += n;
		const rows = (await parquetReadObjects({ file, metadata: md, columns, rowStart: from, rowEnd: from + n, compressors })) as OvPlace[];
		for (const r of rows) {
			const b = r.bbox;
			if (!b || b.xmin > DE_BBOX.xmax || b.xmax < DE_BBOX.xmin || b.ymin > DE_BBOX.ymax || b.ymax < DE_BBOX.ymin) continue;
			if (classify(r, minConf)) out.push(r);
		}
	}
	return out;
}

/** Datei per HTTP-Range lesen (S3 erlaubt das ohne Anmeldung). */
export function rangeBuffer(url: string, byteLength: number, fetchImpl: typeof fetch = fetch): AsyncBuffer {
	return {
		byteLength,
		async slice(start: number, end?: number) {
			const last = (end ?? byteLength) - 1;
			const res = await fetchRetry(url, { headers: { range: `bytes=${start}-${last}` }, timeoutMs: 300000 }, 4, 15000, fetchImpl);
			if (res.status !== 206 && !(start === 0 && last === byteLength - 1)) throw new Error(`Overture: Server liefert keine Teilabrufe (HTTP ${res.status}).`);
			return res.arrayBuffer();
		}
	};
}

const xmlAll = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]);

async function s3List(params: Record<string, string>, fetchImpl: typeof fetch): Promise<string> {
	const u = new URL(overtureBase() + '/');
	u.search = new URLSearchParams({ 'list-type': '2', ...params }).toString();
	return (await fetchRetry(u, { timeoutMs: 60000 }, 3, 10000, fetchImpl)).text();
}

/** Neueste Ausgabe mit Places-Dateien, z. B. „2026-10-21.0“, samt Dateiliste. */
export async function latestRelease(fetchImpl: typeof fetch = fetch, pinned?: string): Promise<{ release: string; files: { url: string; size: number }[] }> {
	const releases = pinned
		? [pinned]
		: xmlAll(await s3List({ prefix: 'release/', delimiter: '/' }, fetchImpl), 'Prefix')
				.map((p) => /^release\/([^/]+)\/$/.exec(p)?.[1])
				.filter((r): r is string => !!r && /^\d{4}-\d{2}-\d{2}/.test(r))
				.sort()
				.reverse();
	for (const release of releases.slice(0, 3)) {
		const xml = await s3List({ prefix: `release/${release}/theme=places/type=place/` }, fetchImpl);
		const keys = xmlAll(xml, 'Key');
		const sizes = xmlAll(xml, 'Size').map(Number);
		const files = keys
			.map((k, i) => ({ url: `${overtureBase()}/${k.split('/').map(encodeURIComponent).join('/')}`, size: sizes[i], key: k }))
			.filter((f) => f.key.endsWith('.parquet') || /part-\d+/.test(f.key))
			.map(({ url, size }) => ({ url, size }));
		if (files.length) return { release, files };
	}
	throw new Error('Overture: keine Ausgabe mit Orten gefunden.');
}

export function overtureDir(): string {
	return process.env.OVERTURE_DIR || join(process.env.TILES_DIR || '/data/tiles', 'overture');
}

export interface OvertureOptions {
	minConfidence?: number;
	release?: string;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
	/** Für Tests: statt S3 diese Dateien lesen */
	files?: AsyncBuffer[];
}

/**
 * Alle passenden Overture-Orte in Deutschland. Das Ergebnis je Ausgabe wird zwischengespeichert (klein, wenige MB):
 * Overture erscheint etwa monatlich, der wöchentliche Lauf lädt dann nichts neu.
 */
export async function fetchOverture(o: OvertureOptions = {}): Promise<{ places: OvPlace[]; release: string; stats: ReadStats; cached: boolean }> {
	const minConf = o.minConfidence ?? 0.8;
	const stats: ReadStats = { dateien: 0, gruppen: 0, gruppen_gelesen: 0, zeilen_gelesen: 0 };
	if (o.files) {
		const places: OvPlace[] = [];
		for (const f of o.files) places.push(...(await readParquet(f, minConf, stats, o.signal)));
		return { places, release: 'test', stats, cached: false };
	}
	const { release, files } = await latestRelease(o.fetchImpl, o.release);
	const dir = overtureDir();
	await mkdir(dir, { recursive: true });
	const cache = join(dir, `places-${release}-${minConf}.json`);
	try {
		const c = JSON.parse(await readFile(cache, 'utf8')) as { places: OvPlace[]; stats: ReadStats };
		return { places: c.places, release, stats: c.stats, cached: true };
	} catch {
		/* noch nicht da */
	}
	const places: OvPlace[] = [];
	for (const f of files) places.push(...(await readParquet(rangeBuffer(f.url, f.size, o.fetchImpl), minConf, stats, o.signal)));
	await writeFile(cache + '.tmp', JSON.stringify({ places, stats }, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
	await rename(cache + '.tmp', cache);
	for (const old of await readdir(dir)) if (old.startsWith('places-') && join(dir, old) !== cache) await rm(join(dir, old), { force: true });
	return { places, release, stats, cached: false };
}

// ---------- Doppelte mit dem Bestand vermeiden ----------

const STOP = new Set(['gmbh', 'co', 'kg', 'ug', 'ev', 'e', 'v', 'der', 'die', 'das', 'im', 'am', 'in', 'und', 'the', 'fuer', 'indoorspielplatz', 'indoor', 'spielplatz']);
function tokens(s: string): string[] {
	return s
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, ' ')
		.split(' ')
		.filter((t) => t.length > 1 && !STOP.has(t));
}

/** Gleicher Ort, anders geschrieben? („Leo's Abenteuerpark“ ≈ „Leos Abenteuerpark Bremen“) */
export function sameName(a: string | null, b: string | null): boolean {
	if (!a || !b) return false;
	const x = tokens(a), y = tokens(b);
	if (!x.length || !y.length) return false;
	const jx = x.join(''), jy = y.join('');
	if (jx.length >= 4 && jy.length >= 4 && (jx.includes(jy) || jy.includes(jx))) return true;
	const sy = new Set(y);
	const common = x.filter((t) => sy.has(t)).length;
	// ein langes gemeinsames Wort reicht („Bremer Abenteuerland“ ≈ „Abenteuerland Bremen“) – es geht um ≤ 200 m Abstand
	if (x.some((t) => t.length >= 8 && sy.has(t))) return true;
	return common / new Set([...x, ...y]).size >= 0.5;
}

export interface Nearby {
	ext: string;
	kind: string;
	name: string | null;
	m: number;
}

/** Ist der Overture-Ort schon (aus OSM oder von Mitgliedern) da? Gleiche Art ≤ 60 m oder ähnlicher Name ≤ 200 m. */
export function isKnown(r: ImportRecord, near: Nearby[]): boolean {
	return near.some((n) => (n.kind === r.kind && n.m <= 60) || (n.m <= 200 && sameName(r.name, n.name)));
}

/** Entfernt Overture-Orte, die es schon gibt (OSM, Mitglieder, Redaktion). Orte, die aus Overture selbst stammen, zählen nicht. */
export async function dropKnown(sql: Sql, sourceKey: string, recs: ImportRecord[]): Promise<ImportRecord[]> {
	const near = new Map<string, Nearby[]>();
	for (let i = 0; i < recs.length; i += 1000) {
		const pts = recs.slice(i, i + 1000).map((r) => ({ ext: r.externalId, lon: r.lon, lat: r.lat }));
		const rows = await sql`
			select x.ext, p.kind, p.name,
				ST_Distance(p.location::geography, ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326)::geography) as m
			from jsonb_to_recordset(${sql.json(pts as never)}) as x(ext text, lon float8, lat float8)
			join places p on p.kind in ('indoorspielplatz', 'ausflugsort', 'schwimmbad', 'familienzentrum')
				and p.status in ('aktiv', 'pruefung')
				and ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326), 0.003)
				and ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(x.lon, x.lat), 4326)::geography, 200)
			where not exists (select 1 from place_sources s where s.place_id = p.id and s.source_key = ${sourceKey})`;
		for (const r of rows) {
			const l = near.get(r.ext as string) ?? [];
			l.push({ ext: r.ext as string, kind: r.kind as string, name: r.name as string | null, m: Number(r.m) });
			near.set(r.ext as string, l);
		}
	}
	return recs.filter((r) => !isKnown(r, near.get(r.externalId) ?? []));
}
