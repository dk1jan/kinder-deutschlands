import { describe, expect, it } from 'vitest';
import { buildQuery, equipmentFeature, toRecords, overpass, type OsmElement } from '../src/lib/server/import/osm';
import { recordHash } from '../src/lib/server/import/engine';
import { parseBbox, resolveFilters } from '../src/lib/server/places';
import { validBbox } from '../src/lib/server/import/tiles';
import { ageText, displayName, distanceM, distanceText, featuresFor } from '../src/lib/places';

const square = (lon: number, lat: number, d = 0.001) => [
	{ lat, lon },
	{ lat, lon: lon + d },
	{ lat: lat + d, lon: lon + d },
	{ lat: lat + d, lon },
	{ lat, lon }
];

describe('OSM-Abfragen', () => {
	it('baut je Auswahl eine Abfrage für ein Land, private Orte ausgeschlossen', () => {
		const q = buildQuery('spielplatz', 'DE-HB');
		expect(q).toContain('"ISO3166-2"="DE-HB"');
		expect(q).toContain('"leisure"="playground"');
		expect(q).toContain('"access"!~"^(private|no)$"');
		expect(q).toContain('node["playground"]');
		expect(buildQuery('toilette', 'DE-NI')).toContain('"amenity"="toilets"');
	});
	it('lehnt ungültige Gebiete ab (keine Abfrage-Injektion)', () => {
		expect(() => buildQuery('spielplatz', 'DE-HB"];out;')).toThrow();
		expect(() => buildQuery('spielplatz', 'XX')).toThrow();
	});
});

describe('OSM → Ortsmodell', () => {
	const elements: OsmElement[] = [
		{
			type: 'way',
			id: 1,
			bounds: { minlat: 53.0, minlon: 8.8, maxlat: 53.001, maxlon: 8.801 },
			geometry: square(8.8, 53.0),
			tags: { leisure: 'playground', name: 'Spielplatz Am Deich', surface: 'sand', min_age: '1', max_age: '6', barrier: 'fence', wheelchair: 'yes', phone: '+49 421 000' }
		},
		{ type: 'node', id: 10, lat: 53.0005, lon: 8.8005, tags: { playground: 'swing' } },
		{ type: 'node', id: 11, lat: 53.0006, lon: 8.8004, tags: { playground: 'splash_pad' } },
		{ type: 'node', id: 12, lat: 53.0004, lon: 8.8006, tags: { playground: 'slide', wheelchair: 'yes' } },
		// Gerät außerhalb des Umrisses (aber im Gitter) – darf nicht zugeordnet werden
		{ type: 'node', id: 13, lat: 53.0015, lon: 8.8015, tags: { playground: 'sandpit' } },
		{ type: 'node', id: 2, lat: 53.1, lon: 8.9, tags: { leisure: 'playground', 'playground:climbingframe': 'yes' } }
	];
	const recs = toRecords('spielplatz', elements);

	it('nimmt nur Spielplätze, nicht die Spielgeräte selbst', () => {
		expect(recs.map((r) => r.externalId).sort()).toEqual(['node/2', 'way/1']);
	});
	it('ordnet Spielgeräte im Umriss zu und übersetzt Merkmale', () => {
		const w = recs.find((r) => r.externalId === 'way/1')!;
		expect(w.name).toBe('Spielplatz Am Deich');
		expect(w.features).toMatchObject({ schaukel: true, wasserspiel: true, rutsche: true, inklusiv: true, eingezaeunt: true, rollstuhl: true, untergrund: 'Sand', alter_min: 1, alter_max: 6, kleinkind: true });
		expect(w.features.sandkasten).toBeUndefined();
		expect(w.area?.type).toBe('Polygon');
		expect(w.url).toBe('https://www.openstreetmap.org/way/1');
	});
	it('speichert keine Telefonnummern aus den Rohdaten', () => {
		expect(recs.find((r) => r.externalId === 'way/1')!.raw.phone).toBeUndefined();
	});
	it('wertet playground:*-Merkmale am Spielplatz aus', () => {
		expect(recs.find((r) => r.externalId === 'node/2')!.features.klettern).toBe(true);
	});
	it('Toiletten: Wickeltisch, Gebühr, Kundschaft', () => {
		const t = toRecords('toilette', [{ type: 'node', id: 5, lat: 53, lon: 8.8, tags: { amenity: 'toilets', changing_table: 'yes', 'changing_table:location': 'wheelchair_toilet', fee: 'no', access: 'customers' } }])[0];
		expect(t.kind).toBe('toilette');
		expect(t.features).toMatchObject({ wickeltisch: true, kostenlos: true, zugang: 'kundschaft', wickeltisch_ort: 'in der barrierefreien Toilette' });
	});
	it('Wickelmöglichkeit in Einrichtungen bekommt die Art der Einrichtung', () => {
		const t = toRecords('wickeln', [{ type: 'way', id: 6, center: { lat: 53, lon: 8.8 }, tags: { amenity: 'cafe', name: 'Café X', changing_table: 'yes' } }])[0];
		expect(t).toMatchObject({ kind: 'wickelraum', name: 'Café X' });
		expect(t.features.einrichtung).toBe('Café');
	});
	it('Ausflug: Bäder und Zoos getrennt', () => {
		const r = toRecords('ausflug', [
			{ type: 'node', id: 7, lat: 53, lon: 8.8, tags: { tourism: 'zoo', name: 'Tierpark' } },
			{ type: 'node', id: 8, lat: 53, lon: 8.8, tags: { leisure: 'water_park', name: 'Spaßbad' } }
		]);
		expect(r.map((x) => x.kind)).toEqual(['ausflugsort', 'schwimmbad']);
	});
	it('Webseiten nur http(s)', () => {
		const r = toRecords('indoor', [
			{ type: 'node', id: 9, lat: 53, lon: 8.8, tags: { leisure: 'indoor_play', website: 'javascript:alert(1)' } },
			{ type: 'node', id: 10, lat: 53, lon: 8.8, tags: { leisure: 'indoor_play', website: 'www.beispiel.de' } }
		]);
		expect(r[0].website).toBeNull();
		expect(r[1].website).toBe('https://www.beispiel.de/');
	});
	it('Spielgeräte-Schlüssel', () => {
		expect(equipmentFeature('basketswing')).toContain('schaukel');
		expect(equipmentFeature('baby_swing')).toEqual(expect.arrayContaining(['schaukel', 'kleinkind']));
		expect(equipmentFeature('water_pump')).toContain('wasserspiel');
		expect(equipmentFeature('bench')).toEqual([]);
	});
	it('Änderungserkennung: gleicher Inhalt → gleicher Hash', () => {
		const again = toRecords('spielplatz', elements);
		expect(again.map(recordHash)).toEqual(recs.map(recordHash));
		const changed = toRecords('spielplatz', elements.map((e) => (e.id === 1 ? { ...e, tags: { ...e.tags, name: 'Neu' } } : e)));
		expect(recordHash(changed.find((r) => r.externalId === 'way/1')!)).not.toBe(recordHash(recs.find((r) => r.externalId === 'way/1')!));
	});
});

describe('Overpass-Abruf', () => {
	it('weicht bei Überlastung auf den nächsten Server aus', async () => {
		const calls: string[] = [];
		const f = (async (url: string) => {
			calls.push(url);
			if (url.includes('eins')) return new Response('busy', { status: 504 });
			return new Response(JSON.stringify({ elements: [{ type: 'node', id: 1 }] }), { status: 200 });
		}) as unknown as typeof fetch;
		const els = await overpass('[out:json];', { endpoints: ['https://eins.example/api', 'https://zwei.example/api'], userAgent: 't', fetchImpl: f, waitMs: () => 0 });
		expect(els.length).toBe(1);
		expect(calls).toEqual(['https://eins.example/api', 'https://zwei.example/api']);
	});
	it('meldet nach allen Versuchen einen verständlichen Fehler', async () => {
		const f = (async () => new Response('x', { status: 429 })) as unknown as typeof fetch;
		await expect(overpass('q', { endpoints: ['https://a.example/'], userAgent: 't', fetchImpl: f, retries: 2, waitMs: () => 0 })).rejects.toThrow(/Overpass nicht erreichbar.*429/);
	});
	it('behandelt Laufzeitfehler in der Antwort als Fehler', async () => {
		const f = (async () => new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' }), { status: 200 })) as unknown as typeof fetch;
		await expect(overpass('q', { endpoints: ['https://a.example/'], userAgent: 't', fetchImpl: f, retries: 1, waitMs: () => 0 })).rejects.toThrow(/timed out/);
	});
});

describe('Hilfsfunktionen Karte', () => {
	it('Kartenausschnitt wird geprüft und begrenzt', () => {
		expect(parseBbox('8.7,53.0,8.9,53.1')).toEqual({ w: 8.7, s: 53.0, e: 8.9, n: 53.1 });
		expect(parseBbox('8.9,53.0,8.7,53.1')).toBeNull();
		expect(parseBbox('0,40,20,60')).toBeNull();
		expect(parseBbox('a,b,c,d')).toBeNull();
		expect(parseBbox(null)).toBeNull();
	});
	it('Filter-Chips → Arten; „Wickeln“ schließt Toiletten mit Wickeltisch ein', () => {
		const r = resolveFilters(['wickeln', 'spielplatz', 'gibtsnicht']);
		expect(r.kinds.sort()).toEqual(['spielplatz', 'wickelraum']);
		expect(r.orFeature).toEqual(['wickeltisch']);
	});
	it('Gebiet für Kartenkacheln', () => {
		expect(validBbox('6.6,51.29,11.62,53.9')).toBe(true);
		expect(validBbox('11,51,6,53')).toBe(false);
		expect(validBbox('6.6,51.29,11.62,53.9;rm -rf')).toBe(false);
	});
	it('Anzeigename, Alter, Entfernung', () => {
		expect(displayName('spielplatz', null, 'Findorff')).toBe('Spielplatz in Findorff');
		expect(displayName('spielplatz', '  Am Deich ', 'Findorff')).toBe('Am Deich');
		expect(ageText({ alter_min: 2, alter_max: 12 })).toBe('2–12 Jahre');
		expect(ageText({})).toBeNull();
		const m = distanceM([8.8, 53.0], [8.8, 53.01]);
		expect(Math.round(m)).toBe(1112);
		expect(distanceText(1112)).toBe('1,1 km');
		expect(distanceText(83)).toBe('80 m');
		expect(featuresFor('toilette').map(([k]) => k)).toContain('wickeltisch');
	});
});

describe('Echter OSM-Ausschnitt Bremen-Findorff (tests/fixtures)', async () => {
	const { readFileSync } = await import('node:fs');
	const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8')).elements as OsmElement[];
	it('alle Spielplätze werden übernommen, Spielgeräte zugeordnet, keine Geräte als eigene Orte', () => {
		const els = load('osm-spielplatz.json');
		const recs = toRecords('spielplatz', els);
		const playgrounds = els.filter((e) => e.tags?.leisure === 'playground').length;
		expect(recs.length).toBe(playgrounds);
		expect(recs.every((r) => r.lon > 8.7 && r.lon < 8.9 && r.lat > 53.0 && r.lat < 53.2)).toBe(true);
		const withEquipment = recs.filter((r) => ['schaukel', 'rutsche', 'sandkasten', 'klettern', 'wippe', 'wasserspiel'].some((k) => r.features[k] === true));
		expect(withEquipment.length).toBeGreaterThan(0);
		expect(recs.filter((r) => r.area).length).toBeGreaterThan(0);
	});
	it('Toiletten-Ausschnitt', () => {
		const recs = toRecords('toilette', load('osm-toilette.json'));
		expect(recs.length).toBeGreaterThan(3);
		expect(recs.every((r) => r.kind === 'toilette')).toBe(true);
	});
});

describe('Luftbild und Navigation', async () => {
	const { tileInArea, tileBbox3857, aerialTile } = await import('../src/lib/server/aerial');
	const { navUrl } = await import('../src/lib/components/NavChooser.svelte');
	it('nur Kacheln in Deutschland (F-011) und Zoom 10–19', () => {
		expect(tileInArea(14, 8592, 5331)).toBe(true); // Bremen
		expect(tileInArea(14, 8718, 5685)).toBe(true); // München
		expect(tileInArea(14, 8802, 5373)).toBe(true); // Berlin
		expect(tileInArea(14, 8000, 5637)).toBe(false); // westlich von Deutschland (Frankreich)
		expect(tileInArea(14, 0, 0)).toBe(false);
		expect(tileInArea(9, 268, 166)).toBe(false);
		expect(tileInArea(20, 1, 1)).toBe(false);
		expect(tileInArea(14, -1, 5)).toBe(false);
		const b = tileBbox3857(0, 0, 0);
		expect(Math.round(b[0])).toBe(-20037508);
	});
	it('leere LGLN-Kachel (außerhalb Niedersachsens) gilt als „kein Luftbild“, echte wird gespeichert', async () => {
		process.env.TILES_DIR = '/tmp/kd-aerial-test';
		const { rmSync } = await import('node:fs');
		rmSync('/tmp/kd-aerial-test', { recursive: true, force: true });
		let calls = 0;
		const f = (async () => {
			calls++;
			return new Response(new Uint8Array(calls === 1 ? 600 : 5000), { headers: { 'content-type': 'image/jpeg' } });
		}) as unknown as typeof fetch;
		expect(await aerialTile(15, 17184, 10663, f)).toBeNull();
		expect(await aerialTile(15, 17184, 10663, f)).toBeNull(); // aus dem Speicher, kein neuer Abruf
		expect(calls).toBe(1);
		const t = await aerialTile(15, 17200, 10700, f);
		expect(t?.cache).toBe('neu');
		expect((await aerialTile(15, 17200, 10700, f))?.cache).toBe('speicher');
		expect(await aerialTile(15, 1, 1, f)).toBeNull();
	});
	it('Navigation: Ziel-Links für Google, Apple, Waze, OSM, andere App', () => {
		expect(navUrl('google', 53.08, 8.8, 'X')).toBe('https://www.google.com/maps/dir/?api=1&destination=53.080000,8.800000');
		expect(navUrl('apple', 53.08, 8.8, 'Spielplatz A&B')).toBe('https://maps.apple.com/?daddr=53.080000,8.800000&q=Spielplatz%20A%26B');
		expect(navUrl('waze', 53.08, 8.8, 'X')).toBe('https://waze.com/ul?ll=53.080000,8.800000&navigate=yes');
		expect(navUrl('geo', 53.08, 8.8, 'X')).toBe('geo:53.080000,8.800000?q=53.080000,8.800000(X)');
		expect(navUrl('osm', 53.08, 8.8, 'X')).toContain('openstreetmap.org/directions?route=%3B53.080000%2C8.800000');
	});
});
