// F-022 + F-021: Orte aus dem Deutschland-Auszug (osmium) statt Overpass; breitere Indoorsuche.
// Künstlicher Mini-Auszug mit klar erkennbaren Testnamen. Ohne installiertes osmium wird der Datei-Teil übersprungen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildQuery, matches, toRecords, type OsmElement, type Selector } from '../src/lib/server/import/osm';
import { fromFeature } from '../src/lib/server/import/osmfile';

const hasOsmium = (() => {
	try {
		execFileSync('osmium', ['--version']);
		return true;
	} catch {
		return false;
	}
})();

let nid = 100;
const node = (lat: number, lon: number, tags: Record<string, string> = {}, id = nid++) =>
	`<node id="${id}" version="1" lat="${lat}" lon="${lon}">${Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('')}</node>`;
const tagXml = (tags: Record<string, string>) => Object.entries(tags).map(([k, v]) => `<tag k="${k}" v="${v}"/>`).join('');

const XML = `<?xml version="1.0" encoding="UTF-8"?><osm version="0.6" generator="test">
${node(53.0, 8.8, {}, 1)}${node(53.0, 8.801, {}, 2)}${node(53.001, 8.801, {}, 3)}${node(53.001, 8.8, {}, 4)}
${node(53.0005, 8.8005, { playground: 'swing' }, 5)}
${node(53.1, 8.9, {}, 11)}${node(53.1, 8.902, {}, 12)}${node(53.102, 8.902, {}, 13)}${node(53.102, 8.9, {}, 14)}
${node(53.01, 8.81, { leisure: 'playground', indoor: 'yes', name: 'Testhalle drinnen' }, 20)}
${node(53.02, 8.82, { leisure: 'indoor_play', name: 'Test-Indoorspielplatz' }, 21)}
${node(53.03, 8.83, { leisure: 'trampoline_park', name: 'Testsprung' }, 22)}
${node(53.04, 8.84, { leisure: 'sports_centre', name: 'Tobeland Testdorf' }, 23)}
${node(53.05, 8.85, { leisure: 'sports_centre', sport: 'climbing', name: 'Testkletterhalle' }, 24)}
${node(53.06, 8.86, { leisure: 'sports_centre', sport: 'swimming', name: 'Testbad' }, 25)}
${node(53.07, 8.87, { amenity: 'kindergarten', name: 'Kita Kinderland Test' }, 26)}
${node(53.08, 8.88, { shop: 'toys', name: 'Spielparadies Testladen' }, 27)}
${node(53.09, 8.89, { amenity: 'cafe', kids_area: 'yes', name: 'Testcafé mit Spielecke' }, 28)}
${node(53.091, 8.891, { amenity: 'cafe', name: 'Testcafé ohne' }, 29)}
${node(53.092, 8.892, { amenity: 'toilets', access: 'private' }, 30)}
${node(53.093, 8.893, { amenity: 'toilets', changing_table: 'yes' }, 31)}
${node(53.094, 8.894, { amenity: 'library', name: 'Teststadtbibliothek' }, 32)}
${node(53.095, 8.895, { amenity: 'library', name: 'Universitätsbibliothek Test' }, 33)}
${node(53.096, 8.896, { shop: 'department_store', baby_feeding: 'room', name: 'Testkaufhaus' }, 34)}
${node(53.097, 8.897, { amenity: 'community_centre', community_centre: 'family_centre', name: 'Testfamilienzentrum' }, 35)}
${node(53.098, 8.898, { tourism: 'attraction', name: 'Testturm' }, 36)}
${node(53.099, 8.899, { highway: 'bus_stop', name: 'Kinderland (Haltestelle)' }, 37)}
${node(53.2, 8.7, { amenity: 'cafe', name: 'Elterncafé Testviertel' }, 60)}
${node(53.201, 8.701, { amenity: 'cafe', name: 'Brettspielcafé Testwürfel' }, 61)}
${node(53.202, 8.702, { amenity: 'kindergarten', name: 'Elterncafé Kita Test' }, 62)}
${node(53.203, 8.703, { shop: 'chemist', diaper: 'yes', name: 'Testdrogerie' }, 63)}
${node(53.204, 8.704, { tourism: 'camp_site', name: 'Campingplatz Testsee' }, 64)}
${node(53.205, 8.705, { tourism: 'camp_site', name: 'FKK-Camp Test', nudism: 'yes' }, 65)}
${node(53.206, 8.706, { tourism: 'hostel', name: 'Jugendherberge Teststadt' }, 66)}
${node(53.207, 8.707, { tourism: 'hotel', name: 'Hotel Testhof' }, 67)}
${node(53.208, 8.708, { tourism: 'hotel', name: 'Familienhotel Testberg' }, 68)}
${node(53.209, 8.709, { leisure: 'sports_hall', name: 'Spielparadies Testhalle' }, 69)}
<way id="40" version="1"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>${tagXml({ leisure: 'playground', name: 'Testspielplatz' })}</way>
<way id="41" version="1"><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="14"/><nd ref="11"/></way>
<relation id="50" version="1"><member type="way" ref="41" role="outer"/>${tagXml({ type: 'multipolygon', tourism: 'zoo', name: 'Testtierpark' })}</relation>
</osm>`;

const SELECTORS: Selector[] = ['spielplatz', 'toilette', 'wickeln', 'indoor', 'ausflug', 'familiencafe', 'stillen', 'bibliothek', 'familienzentrum', 'unterkunft'];

describe('Auswahlregeln (Overpass und Datei gleich)', () => {
	it('Indoor (F-021): drinnen, Trampolin, typische Namen – keine Kitas, Läden, Haltestellen', () => {
		const t = (tags: Record<string, string>) => matches('indoor', tags, 'node');
		expect(t({ leisure: 'indoor_play' })).toBe(true);
		expect(t({ leisure: 'playground', indoor: 'yes' })).toBe(true);
		expect(t({ leisure: 'trampoline_park' })).toBe(true);
		expect(t({ leisure: 'sports_centre', name: 'Tobeland Testdorf' })).toBe(true);
		expect(t({ tourism: 'attraction', name: 'Indoor-Spielpark' })).toBe(true);
		expect(t({ tourism: 'attraction', name: 'Testturm' })).toBe(false);
		expect(t({ tourism: 'attraction', name: 'Indoorspielplatz Test' })).toBe(true);
		expect(t({ amenity: 'kindergarten', name: 'Kinderland' })).toBe(false);
		expect(t({ shop: 'toys', name: 'Spielparadies' })).toBe(false);
		expect(t({ leisure: 'playground', name: 'Kinderland' })).toBe(false);
		expect(t({ leisure: 'indoor_play', access: 'private' })).toBe(false);
		expect(matches('spielplatz', { leisure: 'playground', indoor: 'yes' }, 'way')).toBe(false);
		const q = buildQuery('indoor', 'DE-NI');
		expect(q).toContain('"leisure"="playground"]["indoor"="yes"]');
		expect(q).toContain('"leisure"="trampoline_park"');
		expect(buildQuery('spielplatz', 'DE-NI')).toContain('["indoor"!="yes"]');
	});

	it('Datei-Umwandlung: Knoten, Weg-Fläche, Relation', () => {
		expect(fromFeature({ id: 'n5', geometry: { type: 'Point', coordinates: [8.8, 53] }, properties: { a: 'b', n: 1 } })).toEqual({ type: 'node', id: 5, lon: 8.8, lat: 53, tags: { a: 'b' } });
		const w = fromFeature({ id: 'a80', geometry: { type: 'MultiPolygon', coordinates: [[[[8, 53], [8.002, 53], [8.002, 53.001], [8, 53]]]] }, properties: { leisure: 'playground' } })!;
		expect([w.type, w.id, w.geometry?.length]).toEqual(['way', 40, 4]);
		expect(w.center!.lon).toBeCloseTo(8.001, 9);
		expect(w.center!.lat).toBeCloseTo(53.0005, 9);
		const r = fromFeature({ id: 'a101', geometry: { type: 'MultiPolygon', coordinates: [[[[8, 53], [8.2, 53], [8.2, 53.2], [8, 53]]]] }, properties: {} })!;
		expect([r.type, r.id, r.geometry]).toEqual(['relation', 50, undefined]);
		expect(fromFeature({ id: 'w40', geometry: { type: 'LineString', coordinates: [] } })).toBeNull();
	});
});

(hasOsmium ? describe : describe.skip)('Deutschland-Auszug mit osmium (F-022)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'kd-osm-'));
	let srv: http.Server;
	let hits = 0;
	let corrupt = false;
	const env = { ...process.env };

	beforeAll(async () => {
		writeFileSync(join(dir, 'src.osm'), XML);
		execFileSync('osmium', ['cat', join(dir, 'src.osm'), '-o', join(dir, 'de.osm.pbf'), '-O']);
		const pbf = readFileSync(join(dir, 'de.osm.pbf'));
		const md5 = createHash('md5').update(pbf).digest('hex');
		srv = http.createServer((req, res) => {
			if (req.url === '/de.osm.pbf.md5') return res.end(`${corrupt ? '0'.repeat(32) : md5}  de.osm.pbf\n`);
			if (req.url === '/de.osm.pbf') {
				hits++;
				return res.end(pbf);
			}
			res.statusCode = 404;
			res.end();
		});
		await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
		process.env.OSM_DIR = join(dir, 'daten');
		process.env.OSM_EXTRACT_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/de.osm.pbf`;
	});
	afterAll(() => {
		srv.close();
		process.env.OSM_DIR = env.OSM_DIR;
		process.env.OSM_EXTRACT_URL = env.OSM_EXTRACT_URL;
		rmSync(dir, { recursive: true, force: true });
	});

	it('lädt einmal, filtert, und jede Quelle bekommt genau ihre Orte', async () => {
		const { fetchFromExtract } = await import('../src/lib/server/import/osmfile');
		const got: Record<string, string[]> = {};
		for (const s of SELECTORS) {
			const els: OsmElement[] = await fetchFromExtract(s, 'test').catch(() => []);
			got[s] = toRecords(s, els)
				.map((r) => `${r.kind}:${r.name ?? r.externalId}`)
				.sort();
		}
		expect(hits).toBe(1); // ein Download für alle Quellen
		expect(got.spielplatz).toEqual(['spielplatz:Testspielplatz']);
		// „Spielparadies Testhalle“ kommt nur über den Namen in den Auszug (osmium-Platzhalter je Ausdruck einzeln, D-084)
		expect(got.indoor).toEqual(['indoorspielplatz:Spielparadies Testhalle', 'indoorspielplatz:Test-Indoorspielplatz', 'indoorspielplatz:Testhalle drinnen', 'indoorspielplatz:Testsprung', 'indoorspielplatz:Tobeland Testdorf']);
		expect(got.ausflug).toEqual(['ausflugsort:Testkletterhalle', 'ausflugsort:Testtierpark', 'schwimmbad:Testbad']);
		// D-084: Elterncafé über den Namen; Brettspielcafé und Kita bleiben draußen
		expect(got.familiencafe).toEqual(['familiencafe:Elterncafé Testviertel', 'familiencafe:Testcafé mit Spielecke']);
		expect(got.toilette).toEqual(['toilette:node/31']);
		// Wickeltisch an der Toilette zählt bei Toiletten; die Drogerie kommt über das alte Merkmal diaper
		expect(got.wickeln).toEqual(['wickelraum:Testdrogerie']);
		expect(got.unterkunft).toEqual(['unterkunft:Campingplatz Testsee', 'unterkunft:Familienhotel Testberg', 'unterkunft:Jugendherberge Teststadt']);
		expect(got.stillen).toEqual(['stillraum:Testkaufhaus']);
		expect(got.bibliothek).toEqual(['bibliothek:Teststadtbibliothek']);
		expect(got.familienzentrum).toEqual(['familienzentrum:Testfamilienzentrum']);
	});

	it('Spielplatzfläche mit Umriss und Spielgerät, Tierpark als Relation mit Mittelpunkt', async () => {
		const { fetchFromExtract } = await import('../src/lib/server/import/osmfile');
		const [sp] = toRecords('spielplatz', await fetchFromExtract('spielplatz', 'test'));
		expect(sp.externalId).toBe('way/40');
		expect(sp.area?.type).toBe('Polygon');
		expect(sp.features.schaukel).toBe(true);
		expect(sp.url).toBe('https://www.openstreetmap.org/way/40');
		const zoo = toRecords('ausflug', await fetchFromExtract('ausflug', 'test')).find((r) => r.name === 'Testtierpark')!;
		expect(zoo.externalId).toBe('relation/50');
		expect([zoo.lon, zoo.lat]).toEqual([8.901, 53.101]);
	});

	it('veralteter Auszug wird neu geladen; falsche Prüfsumme bricht ab und lässt die alte Datei stehen', async () => {
		const { ensureExtract } = await import('../src/lib/server/import/osmfile');
		const file = join(dir, 'daten', 'deutschland.osm.pbf');
		const old = new Date(Date.now() - 8 * 24 * 3600 * 1000);
		utimesSync(file, old, old);
		corrupt = true;
		await expect(ensureExtract('test')).rejects.toThrow(/Prüfsumme/);
		expect(existsSync(file)).toBe(true);
		expect(existsSync(file + '.part')).toBe(false);
		corrupt = false;
		await ensureExtract('test');
		expect(hits).toBe(3);
	});
});

describe('Geofabrik: Datei mit Prüfsumme finden (F-022)', () => {
	let srv: http.Server;
	const seen: string[] = [];
	const before = process.env.OSM_EXTRACT_URL;
	beforeAll(async () => {
		srv = http.createServer((req, res) => {
			seen.push(req.url ?? '');
			// wie bei Geofabrik: „latest“ ohne .md5, datierte Stände mit .md5 (hier nur der von vor 2 Tagen)
			if (req.url === '/europe/germany-261019.osm.pbf.md5') return res.end('0123456789abcdef0123456789abcdef  germany-261019.osm.pbf\n');
			res.statusCode = 404;
			res.end('not found');
		});
		await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
		process.env.OSM_EXTRACT_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/europe/germany-latest.osm.pbf`;
	});
	afterAll(() => {
		srv.close();
		process.env.OSM_EXTRACT_URL = before;
	});

	it('ohne latest.md5 → neuester datierter Stand der letzten Tage', async () => {
		const { resolveExtract } = await import('../src/lib/server/import/osmfile');
		const r = await resolveExtract('test', new Date('2026-10-21T10:00:00Z'));
		expect(r.url).toMatch(/\/europe\/germany-261019\.osm\.pbf$/);
		expect(r.want).toBe('0123456789abcdef0123456789abcdef');
		expect(seen.slice(0, 4)).toEqual(['/europe/germany-latest.osm.pbf.md5', '/europe/germany-261021.osm.pbf.md5', '/europe/germany-261020.osm.pbf.md5', '/europe/germany-261019.osm.pbf.md5']);
	});

	it('nichts gefunden → verständlicher Fehler', async () => {
		const { resolveExtract } = await import('../src/lib/server/import/osmfile');
		await expect(resolveExtract('test', new Date('2027-06-01T10:00:00Z'))).rejects.toThrow(/letzten 14 Tage/);
	});
});
