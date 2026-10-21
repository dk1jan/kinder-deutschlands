// OSM-Orte aus dem Deutschland-Auszug von Geofabrik statt über Overpass (F-022).
// Ablauf: Datei wöchentlich laden (MD5 geprüft) → osmium filtert einmal alle benötigten Merkmale heraus → Export als
// GeoJSON-Zeilen → jede Quelle liest daraus nur ihre Auswahl (matches) und übersetzt wie bisher (toRecords).
// Kein Abruf bei fremden Servern während der Auswertung; Overpass bleibt nur Rückfall.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fetchRetry } from './net';
import { matches, type OsmElement, type Selector } from './osm';

export const EXTRACT_URL_DEFAULT = 'https://download.geofabrik.de/europe/germany-latest.osm.pbf';
const MAX_AGE_MS = 6 * 24 * 3600 * 1000; // wöchentlich neu, mit etwas Luft
const MIN_FREE_BYTES = 12 * 1024 ** 3; // Download + Zwischenstände

/**
 * Alles, was irgendeine Quelle braucht – ein einziger Filterlauf über ganz Deutschland.
 * Namen (F-021) als Teilwort-Suche; osmium unterscheidet Groß-/Kleinschreibung, daher beide Schreibweisen.
 */
export const FILTERS = [
	'n/playground',
	'nwr/leisure=playground,indoor_play,water_park,miniature_golf,sports_centre,trampoline_park,amusement_arcade',
	'nwr/amenity=toilets,public_bath,library',
	'nwr/kids_area',
	'nwr/changing_table=yes',
	'nwr/tourism=zoo,theme_park,attraction',
	'nwr/baby_feeding',
	'nwr/community_centre=family_centre',
	'nwr/name=*ndoor*,*NDOOR*,*paradies*,*Paradies*,*inderland*,*obeland*,*inderwelt*,*pielscheune*,*pielhalle*,*ndoorpark*,*pielarena*'
];

export function osmDir(): string {
	return process.env.OSM_DIR || join(process.env.TILES_DIR || '/data/tiles', 'osm-auszug');
}
const osmiumBin = () => process.env.OSMIUM_BIN || 'osmium';
const extractUrl = () => process.env.OSM_EXTRACT_URL || EXTRACT_URL_DEFAULT;

/** Datei-Modus: 'datei' (immer), 'overpass' (nie), 'auto' (Datei, wenn osmium da ist). */
export function osmSource(): 'datei' | 'overpass' | 'auto' {
	const v = (process.env.OSM_SOURCE || 'auto').toLowerCase();
	return v === 'datei' || v === 'overpass' ? v : 'auto';
}

function run(cmd: string, args: string[], signal?: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
		let out = '';
		let err = '';
		p.stdout.on('data', (d) => (out += d));
		p.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
		p.on('error', (e) => reject(new Error(`${cmd}: ${(e as NodeJS.ErrnoException).code === 'ENOENT' ? 'nicht installiert' : e.message}`)));
		p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${args[0]}: ${err.trim().split('\n').pop() || `Fehlercode ${code}`}`))));
	});
}

let osmiumOk: boolean | null = null;
export async function osmiumAvailable(): Promise<boolean> {
	if (osmiumOk === null) osmiumOk = await run(osmiumBin(), ['--version']).then(() => true, () => false);
	return osmiumOk;
}

const mtime = (f: string) => stat(f).then((s) => s.mtimeMs, () => 0);

/** Lädt den Auszug, wenn er fehlt oder älter als 6 Tage ist. Prüft die MD5-Summe von Geofabrik. */
export async function ensureExtract(userAgent: string, signal?: AbortSignal): Promise<string> {
	const dir = osmDir();
	await mkdir(dir, { recursive: true });
	const file = join(dir, 'deutschland.osm.pbf');
	if (Date.now() - (await mtime(file)) < MAX_AGE_MS) return file;
	const fs = await statfs(dir);
	if (fs.bavail * fs.bsize < MIN_FREE_BYTES) throw new Error(`Zu wenig Speicherplatz für den OSM-Auszug (frei ${Math.round((fs.bavail * fs.bsize) / 1024 ** 3)} GB, nötig 12 GB).`);
	const url = extractUrl();
	const md5res = await fetchRetry(url + '.md5', { headers: { 'user-agent': userAgent }, timeoutMs: 60_000 });
	const want = (await md5res.text()).trim().split(/\s+/)[0]?.toLowerCase();
	if (!/^[0-9a-f]{32}$/.test(want ?? '')) throw new Error('Prüfsumme des OSM-Auszugs nicht lesbar.');
	const res = await fetchRetry(url, { headers: { 'user-agent': userAgent }, timeoutMs: 90 * 60_000 });
	if (!res.body) throw new Error('OSM-Auszug: leere Antwort.');
	const part = file + '.part';
	const h = createHash('md5');
	const hasher = new Transform({
		transform(chunk, _e, cb) {
			h.update(chunk);
			cb(null, chunk);
		}
	});
	try {
		await pipeline(Readable.fromWeb(res.body as never), hasher, createWriteStream(part), { signal });
		const got = h.digest('hex');
		if (got !== want) throw new Error(`OSM-Auszug beschädigt (Prüfsumme ${got.slice(0, 8)}… statt ${want!.slice(0, 8)}…).`);
		await rename(part, file);
	} catch (e) {
		await rm(part, { force: true });
		throw e;
	}
	return file;
}

let preparing: Promise<string> | null = null;

/** Filtert und exportiert einmal je Auszug (alle Quellen teilen sich das Ergebnis). */
export function ensurePrepared(userAgent: string, signal?: AbortSignal): Promise<string> {
	return (preparing ??= prepare(userAgent, signal).finally(() => (preparing = null)));
}

async function prepare(userAgent: string, signal?: AbortSignal): Promise<string> {
	const pbf = await ensureExtract(userAgent, signal);
	const dir = osmDir();
	const out = join(dir, 'auswahl.geojsonseq');
	const marker = join(dir, 'auswahl.filter');
	const want = createHash('sha256').update(FILTERS.join('\n')).digest('hex').slice(0, 16);
	const fresh = (await mtime(out)) > (await mtime(pbf)) && (await readFile(marker, 'utf8').catch(() => '')) === want;
	if (fresh) return out;
	const filtered = join(dir, 'auswahl.osm.pbf');
	await run(osmiumBin(), ['tags-filter', pbf, ...FILTERS, '-o', filtered, '-O', '--no-progress'], signal);
	await run(osmiumBin(), ['export', filtered, '-f', 'geojsonseq', '-u', 'type_id', '--geometry-types=point,polygon', '-o', out + '.part', '-O', '--no-progress'], signal);
	await rename(out + '.part', out);
	await rm(filtered, { force: true });
	await writeFile(marker, want);
	return out;
}

type Feature = { id?: string; geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> };

/** Eine Exportzeile → dieselbe Form wie eine Overpass-Antwort (Punkt bzw. Umriss mit Begrenzung). */
export function fromFeature(f: Feature): OsmElement | null {
	const m = /^([nwa])(\d+)$/.exec(f.id ?? '');
	if (!m || !f.geometry) return null;
	const tags: Record<string, string> = {};
	for (const [k, v] of Object.entries(f.properties ?? {})) if (typeof v === 'string') tags[k] = v;
	const n = Number(m[2]);
	if (m[1] === 'n' && f.geometry.type === 'Point') {
		const [lon, lat] = f.geometry.coordinates as [number, number];
		return { type: 'node', id: n, lon, lat, tags };
	}
	if (m[1] !== 'a' || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) return null;
	// osmium: Flächen-ID = Weg-ID × 2 bzw. Relations-ID × 2 + 1
	const isWay = n % 2 === 0;
	const id = isWay ? n / 2 : (n - 1) / 2;
	const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as [number, number][][][];
	let minlon = Infinity, minlat = Infinity, maxlon = -Infinity, maxlat = -Infinity;
	for (const poly of polys)
		for (const [lon, lat] of poly[0] ?? []) {
			if (lon < minlon) minlon = lon;
			if (lon > maxlon) maxlon = lon;
			if (lat < minlat) minlat = lat;
			if (lat > maxlat) maxlat = lat;
		}
	if (!Number.isFinite(minlon)) return null;
	const bounds = { minlon, minlat, maxlon, maxlat };
	const center = { lon: (minlon + maxlon) / 2, lat: (minlat + maxlat) / 2 };
	const el: OsmElement = { type: isWay ? 'way' : 'relation', id, bounds, center, tags };
	// Einfacher Umriss eines Wegs: wie „out geom“ bei Overpass (für Spielplatzflächen und Spielgeräte-Zuordnung)
	if (isWay && polys.length === 1 && polys[0].length === 1) el.geometry = polys[0][0].map(([lon, lat]) => ({ lon, lat }));
	return el;
}

/** Liest die Auswahl einer Quelle aus dem vorbereiteten Export. */
export async function readSelector(file: string, selector: Selector, signal?: AbortSignal): Promise<OsmElement[]> {
	const out: OsmElement[] = [];
	const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8', signal }), crlfDelay: Infinity });
	for await (const line of rl) {
		if (!line) continue;
		const el = fromFeature(JSON.parse(line.charCodeAt(0) === 0x1e ? line.slice(1) : line));
		if (el && matches(selector, el.tags ?? {}, el.type)) out.push(el);
	}
	return out;
}

/** Komplett: Auszug sicherstellen, Auswahl lesen. */
export async function fetchFromExtract(selector: Selector, userAgent: string, signal?: AbortSignal): Promise<OsmElement[]> {
	const file = await ensurePrepared(userAgent, signal);
	const els = await readSelector(file, selector, signal);
	if (!els.length) throw new Error('OSM-Auszug enthält für diese Quelle nichts – nichts übernommen.');
	return els;
}
