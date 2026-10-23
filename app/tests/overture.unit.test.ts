// F-028: Overture als zweite Quelle. Testdatei = Nachbildung echter Overture-Zeilen aus Jans Stichprobe Bremen (23.10.2026),
// erzeugt mit scripts/overture-fixture.py.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { asyncBufferFromFile, parquetMetadataAsync } from 'hyparquet';
import { classify, fetchOverture, groupOutside, isKnown, latestRelease, rangeBuffer, sameName, toRecord, type OvPlace } from '../src/lib/server/import/overture';

const FIX = 'tests/fixtures/overture-places.parquet';
const ov = (name: string, cat: string, conf: number, extra: Partial<OvPlace> = {}): OvPlace => ({
	id: name,
	names: { primary: name },
	taxonomy: { primary: cat, hierarchy: [cat === 'park' ? 'sports_and_recreation' : 'arts_and_entertainment', cat] },
	confidence: conf,
	bbox: { xmin: 8.8, xmax: 8.8, ymin: 53.08, ymax: 53.08 },
	addresses: [{ country: 'DE' }],
	operating_status: 'open',
	...extra
});

describe('Overture-Regeln (F-028)', () => {
	it('übernimmt die echten Indoorplätze aus der Bremer Stichprobe', () => {
		expect(classify(ov("Leo's Abenteuerpark", 'amusement_park', 1))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('Erlebniswelt Kiddo Bremen', 'amusement_park', 0.92))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('Bremer Abenteuerland', 'kids_recreation_and_party', 1))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('Spiel Coolisse im Weserpark GmbH', 'kids_recreation_and_party', 0.99))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('Indoorspielplatz Bremen Neustadt', 'park', 0.7))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('JUMP House Bremen', 'event_venue', 0.98))).toEqual({ kind: 'indoorspielplatz', einrichtung: null });
		expect(classify(ov('Superfly', 'trampoline_park', 0.9))).toEqual({ kind: 'indoorspielplatz', einrichtung: 'Trampolinhalle' });
		expect(classify(ov('kek-Kindermuseum für Bremen', 'childrens_museum', 0.91))).toEqual({ kind: 'ausflugsort', einrichtung: 'Kindermuseum' });
		expect(classify(ov('Kinderbauernhof Tenever', 'petting_zoo', 0.99))).toEqual({ kind: 'ausflugsort', einrichtung: 'Kinderbauernhof' });
	});

	it('lässt den Unsinn aus der Stichprobe weg', () => {
		for (const [n, c, k] of [
			['Reitclub Buchenhof e.V', 'amusement_park', 1],
			['SV Tell Delmenhorst', 'amusement_park', 0.99],
			['Schutzenverein Bremen von 1843', 'amusement_park', 0.93],
			['Turn- und Rasensport- verein Bremen', 'amusement_park', 0.97],
			['Freimarkt Bremen', 'amusement_park', 0.88],
			['Osterwiese', 'amusement_park', 0.92],
			['Space Center Bremen', 'amusement_park', 0.98],
			['Spielplatzinitiative Vasmerstraße', 'amusement_park', 0.77],
			['Abenteuerspielplatz/Königshof', 'playground', 0.64],
			['Mega Hüpfburgenland', 'kids_recreation_and_party', 0.62], // zu unsicher
			['Familienzentrum Villa', 'kids_recreation_and_party', 0.85],
			['PROGAS GmbH & Co. KG', 'kids_recreation_and_party', 0.97],
			['Småland', 'indoor_playcenter', 0.8], // IKEA-Kinderbetreuung
			['HafenTraum Indoor Hostel Camp', 'hostel', 1],
			['Henry‘s Indoor Golf', 'golf_instructor', 0.7],
			['Tiergarten Ludwigslust', 'zoo', 1], // Zoos aus OSM; hier sogar falsch verortet
			['Westbad', 'water_park', 0.77],
			['Laser Heroes', 'laser_tag', 1],
			['Spielhalle Merkur', 'amusement_park', 0.99], // Glücksspiel
			['Kopenhagener Spielplatz', 'playground', 0.32]
		] as const)
			expect(classify(ov(n, c, k)), n).toBeNull();
	});

	it('geschlossen, Ausland, ohne Namen → weg; Kinderspielhalle bleibt', () => {
		expect(classify(ov('Indoorspielplatz Zu', 'indoor_playcenter', 0.95, { operating_status: 'permanently_closed' }))).toBeNull();
		expect(classify(ov('Ballorig Enschede', 'indoor_playcenter', 0.95, { addresses: [{ country: 'NL' }] }))).toBeNull();
		expect(classify(ov('', 'indoor_playcenter', 0.95))).toBeNull();
		expect(classify(ov('Kinderspielhalle Sonnenschein', 'event_venue', 0.9))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('Spielwiese Indoor', 'indoor_playcenter', 0.9))?.kind).toBe('indoorspielplatz');
		expect(classify(ov('Osterwiese', 'amusement_park', 0.95))).toBeNull();
	});

	it('Datensatz: Mitte, Adresse, Webseite, stabile Angaben', () => {
		const r = toRecord(
			ov("Leo's Abenteuerpark", 'amusement_park', 1, {
				id: 'abc',
				bbox: { xmin: 8.83, xmax: 8.8302, ymin: 53.09, ymax: 53.0902 },
				addresses: [{ freeform: 'Löwenhof 4', postcode: '28217', locality: 'Bremen', country: 'DE' }],
				websites: ['leosabenteuerpark.de']
			})
		)!;
		expect(r).toMatchObject({ externalId: 'abc', kind: 'indoorspielplatz', name: "Leo's Abenteuerpark", lon: 8.8301, lat: 53.0901, website: 'https://leosabenteuerpark.de/' });
		expect(r.address).toEqual({ street: 'Löwenhof', housenumber: '4', postcode: '28217', city: 'Bremen' });
		expect(r.raw).toEqual({ kategorie: 'amusement_park' }); // keine Zuverlässigkeit → kein „geändert“ bei jeder Ausgabe
		expect(toRecord(ov('Indoorspielplatz Paris', 'indoor_playcenter', 0.99, { addresses: [], bbox: { xmin: 2.35, xmax: 2.35, ymin: 48.85, ymax: 48.85 } }))).toBeNull();
	});

	it('gleicher Name, anders geschrieben', () => {
		expect(sameName("Leo's Abenteuerpark", 'Leos Abenteuerpark')).toBe(true);
		expect(sameName('Bremer Abenteuerland', 'Abenteuerland Bremen GmbH')).toBe(true);
		expect(sameName('JUMP House Bremen', 'Jump House')).toBe(true);
		expect(sameName('Indoorspielplatz Bremen Neustadt', 'Indoorspielplatz Huchting')).toBe(false);
		expect(sameName('Kiddo', null)).toBe(false);
		const r = toRecord(ov('Bremer Abenteuerland', 'kids_recreation_and_party', 1))!;
		expect(isKnown(r, [{ ext: r.externalId, kind: 'ausflugsort', name: 'Abenteuerland', m: 150 }])).toBe(true);
		expect(isKnown(r, [{ ext: r.externalId, kind: 'indoorspielplatz', name: 'Ganz anders', m: 40 }])).toBe(true);
		expect(isKnown(r, [{ ext: r.externalId, kind: 'ausflugsort', name: 'Ganz anders', m: 40 }])).toBe(false);
		expect(isKnown(r, [{ ext: r.externalId, kind: 'indoorspielplatz', name: 'Abenteuerland', m: 250 }])).toBe(false);
	});
});

describe('Overture-Dateien lesen (F-028)', () => {
	it('liest nur Zeilengruppen in Deutschland und davon nur passende Orte', async () => {
		const file = await asyncBufferFromFile(FIX);
		const md = await parquetMetadataAsync(file);
		expect(md.row_groups.length).toBe(6);
		expect(groupOutside(md, md.row_groups.length - 1)).toBe(true); // Paris
		expect(groupOutside(md, 0)).toBe(false);
		const r = await fetchOverture({ files: [file] });
		expect(r.places.map((p) => p.id).sort()).toEqual(['ov-abl', 'ov-coolisse', 'ov-hof', 'ov-jump', 'ov-kek', 'ov-kiddo', 'ov-leo', 'ov-neustadt', 'ov-trampo']);
		expect(r.stats.gruppen_gelesen).toBe(5);
	});

	it('Teilabruf über HTTP und Auswahl der neuesten Ausgabe', async () => {
		const bytes = readFileSync(FIX);
		const calls: string[] = [];
		const fake = (async (u: string | URL, init?: RequestInit) => {
			const url = String(u);
			calls.push(url);
			if (url.includes('delimiter=')) return new Response('<R><CommonPrefixes><Prefix>release/2026-09-24.0/</Prefix></CommonPrefixes><CommonPrefixes><Prefix>release/2026-10-21.0/</Prefix></CommonPrefixes></R>');
			if (url.includes('list-type'))
				return new Response(url.includes('2026-10-21.0') ? `<R><Contents><Key>release/2026-10-21.0/theme=places/type=place/part-00000.zstd.parquet</Key><Size>${bytes.length}</Size></Contents></R>` : '<R></R>');
			const m = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('range') ?? '')!;
			return new Response(bytes.subarray(Number(m[1]), Number(m[2]) + 1), { status: 206 });
		}) as typeof fetch;
		const rel = await latestRelease(fake);
		expect(rel.release).toBe('2026-10-21.0');
		expect(rel.files[0].url).toMatch(/release\/2026-10-21\.0\/theme%3Dplaces\/type%3Dplace\/part-00000/);
		const r = await fetchOverture({ files: [rangeBuffer(rel.files[0].url, rel.files[0].size, fake)] });
		expect(r.places).toHaveLength(9);
		// Paris-Gruppe wird nicht geladen: weniger Teilabrufe als bei vollständigem Lesen
		expect(calls.filter((c) => c.includes('part-00000')).length).toBeGreaterThan(1);
	});
});
