// Jan 24.10.2026 (D-084): ganz Deutschland – neue Ortsregeln (Unterkünfte, alte Wickel-Angaben, Elterncafés),
// Overture-Erweiterung, Unwetterwarnungen des DWD (CAP, ZIP, Warnzellen), Übersichtsraster, Länderliste.
import { describe, expect, it } from 'vitest';
import { buildQuery, matches, stayType, toRecords } from '../src/lib/server/import/osm';
import { classify, PRE_FILTER, type OvPlace } from '../src/lib/server/import/overture';
import { FILTERS } from '../src/lib/server/import/osmfile';
import { kreisFromWarncell, levelOf, parseCap, parsePolygon, decode } from '../src/lib/server/warnings/cap';
import { unzip } from '../src/lib/server/warnings/zip';
import { latestFile, parseSnapshot } from '../src/lib/server/warnings/dwd';
import { gridCell } from '../src/lib/server/places';
import { LAENDER, LAND_CODES, LAND_ISOS } from '../src/lib/laender';
import { KINDS, KIND_FILTERS } from '../src/lib/places';
import { fuzzyCount } from '../src/lib/server/broadcasts';
import { cap, makeZip } from './helpers/dwd';

describe('OSM-Regeln für ganz Deutschland (D-084)', () => {
	it('Unterkünfte: Camping, Jugendherbergen, Familienhotels, Ferienhöfe – kein FKK, keine normalen Hotels', () => {
		expect(stayType({ tourism: 'camp_site', name: 'Campingplatz am See' })).toBe('Campingplatz');
		expect(stayType({ tourism: 'camp_site', name: 'FKK Sonnenland', nudism: 'yes' })).toBeNull();
		expect(stayType({ tourism: 'camp_site', name: 'Dauercamping Nord' })).toBeNull();
		expect(stayType({ tourism: 'camp_site', group_only: 'yes' })).toBeNull();
		expect(stayType({ tourism: 'camp_site', access: 'private' })).toBeNull();
		expect(stayType({ tourism: 'hostel', name: 'Jugendherberge Bremen' })).toBe('Jugendherberge');
		expect(stayType({ tourism: 'hostel', name: 'Haus am Meer', operator: 'DJH Landesverband Nordmark' })).toBe('Jugendherberge');
		expect(stayType({ tourism: 'hostel', name: 'Meininger Hostel' })).toBeNull();
		expect(stayType({ tourism: 'hotel', name: 'Familienhotel Seeblick' })).toBe('Familienhotel');
		expect(stayType({ tourism: 'hotel', name: 'Kinderhotel Oberjoch' })).toBe('Familienhotel');
		expect(stayType({ tourism: 'apartment', name: 'Ferienhof Petersen' })).toBe('Ferienhof');
		expect(stayType({ tourism: 'hotel', name: 'Hotel Krone' })).toBeNull();
		expect(stayType({ tourism: 'hotel', name: 'Hotel Krone', kids_area: 'yes' })).toBe('Familienfreundliches Hotel');
		expect(stayType({ amenity: 'restaurant', name: 'Familienhotel-Restaurant' })).toBeNull();
		const [r] = toRecords('unterkunft', [{ type: 'node', id: 1, lat: 54, lon: 10, tags: { tourism: 'camp_site', name: 'Camping Ostsee', playground: 'yes', changing_table: 'yes' } }]);
		expect(r).toMatchObject({ kind: 'unterkunft', name: 'Camping Ostsee' });
		expect(r.features).toMatchObject({ einrichtung: 'Campingplatz', spielplatz_vorort: true, wickeltisch: true });
		expect(buildQuery('unterkunft', 'DE-SH')).toContain('"tourism"="camp_site"');
	});

	it('Wickeln: auch das alte Merkmal diaper; Toiletten bekommen Wickeltisch daraus', () => {
		expect(matches('wickeln', { shop: 'chemist', diaper: 'yes' }, 'node')).toBe(true);
		expect(matches('wickeln', { amenity: 'restaurant', diaper: '2' }, 'node')).toBe(true);
		expect(matches('wickeln', { amenity: 'restaurant', diaper: 'no' }, 'node')).toBe(false);
		expect(matches('wickeln', { amenity: 'toilets', diaper: 'yes' }, 'node')).toBe(false);
		const [t] = toRecords('toilette', [{ type: 'node', id: 2, lat: 53, lon: 8, tags: { amenity: 'toilets', diaper: 'room' } }]);
		expect(t.features.wickeltisch).toBe(true);
		const [w] = toRecords('wickeln', [{ type: 'node', id: 3, lat: 53, lon: 8, tags: { shop: 'chemist', diaper: 'yes', name: 'Drogerie Test' } }]);
		expect(w).toMatchObject({ kind: 'wickelraum' });
		expect(w.features).toMatchObject({ wickeltisch: true, einrichtung: 'Drogerie' });
		expect(buildQuery('wickeln', 'DE-BY')).toContain('"diaper"');
	});

	it('Elterncafés über den Namen – nicht an Kitas/Schulen, keine Brettspiel- oder Internetcafés', () => {
		const c = (tags: Record<string, string>) => matches('familiencafe', tags, 'node');
		for (const n of ['Elterncafé Sonnenschein', 'Eltern-Kind-Café Wirbelwind', 'Kindercafé Krümel', 'Familien Café', 'Spielcafé Kunterbunt', 'Krabbelcafé', 'Kids Cafe', 'Mama-Café'])
			expect(c({ amenity: 'cafe', name: n }), n).toBe(true);
		expect(c({ amenity: 'community_centre', name: 'Elterncafé im Familienzentrum' })).toBe(true);
		expect(c({ name: 'Elterncafé' })).toBe(true);
		expect(c({ amenity: 'cafe', name: 'Brettspielcafé Würfelglück' })).toBe(false);
		expect(c({ amenity: 'cafe', name: 'Internet-Café Spielwelt' })).toBe(false);
		expect(c({ amenity: 'kindergarten', name: 'Elterncafé Kita Sonnenblume' })).toBe(false);
		expect(c({ shop: 'bakery', name: 'Kindercafé Backstube' })).toBe(false);
		expect(c({ amenity: 'cafe', name: 'Café Central' })).toBe(false);
		// Über den Namen gefunden heißt nicht „Spielecke vorhanden“
		const [r] = toRecords('familiencafe', [{ type: 'node', id: 4, lat: 53, lon: 8, tags: { amenity: 'cafe', name: 'Elterncafé Test' } }]);
		expect(r.kind).toBe('familiencafe');
		expect(r.features.spielecke).toBeUndefined();
	});

	it('osmium-Filter enthält die neuen Merkmale (sonst fehlen sie im Auszug)', () => {
		const f = FILTERS.join(' ');
		expect(f).toContain('nwr/diaper');
		expect(f).toMatch(/tourism=[^ ]*camp_site/);
		expect(f).toMatch(/tourism=[^ ]*hostel/);
		expect(FILTERS).toContain('nwr/name=*lterncaf*');
		expect(FILTERS.filter((x) => x.includes('*')).every((x) => !x.includes(','))).toBe(true); // Platzhalter nie in Komma-Listen
		expect(FILTERS).toContain('nwr/name=*indercaf*');
	});
});

describe('Overture: Elterncafés und Unterkünfte (D-084)', () => {
	const ov = (name: string, cat: string, conf: number): OvPlace => ({
		id: name,
		names: { primary: name },
		taxonomy: { primary: cat, hierarchy: ['food_and_drink', cat] },
		confidence: conf,
		bbox: { xmin: 9, xmax: 9, ymin: 52, ymax: 52 },
		addresses: [{ country: 'DE' }],
		operating_status: 'open'
	});
	it('übernimmt eindeutige Namen ab 0,7', () => {
		expect(classify(ov('Elterncafé Wirbelwind', 'cafe', 0.75))).toEqual({ kind: 'familiencafe', einrichtung: null });
		expect(classify(ov('Kindercafé Krümelkiste', 'coffee_shop', 0.9))?.kind).toBe('familiencafe');
		expect(classify(ov('Jugendherberge Hamburg Stintfang', 'hostel', 0.8))).toEqual({ kind: 'unterkunft', einrichtung: 'Jugendherberge' });
		expect(classify(ov('Familienhotel Ebbinghof', 'hotel', 0.72))).toEqual({ kind: 'unterkunft', einrichtung: 'Familienhotel' });
		expect(classify(ov('Ferienhof Hansen', 'farm', 0.85))).toEqual({ kind: 'unterkunft', einrichtung: 'Ferienhof' });
	});
	it('lässt Unsicheres und Falsches weg', () => {
		expect(classify(ov('Elterncafé Wirbelwind', 'cafe', 0.5))).toBeNull();
		expect(classify(ov('Ferienhof Hansen', 'farm', 0.75))).toBeNull(); // Ferienhof erst ab 0,8
		expect(classify(ov('Brettspielcafé Würfel', 'cafe', 0.95))).toBeNull();
		expect(classify(ov('Elterncafé der Grundschule', 'cafe', 0.95))).toBeNull();
		expect(classify(ov('Hotel Krone', 'hotel', 0.99))).toBeNull();
		expect(classify(ov('HafenTraum Indoor Hostel Camp', 'hostel', 1))).toBeNull();
	});
	it('Grobfilter des Leseprozesses lässt die neuen Namen durch', () => {
		for (const n of ['Elterncafé X', 'Familien-Café', 'Jugendherberge Y', 'Familotel Z', 'Ferienhof A', 'Krabbelcafé']) expect(PRE_FILTER.test(n), n).toBe(true);
	});
});

describe('Unwetterwarnungen: CAP, ZIP, Warnzellen (DWD)', () => {
	it('liest eine DWD-Meldung mit Entitäten, Stufe und Gebieten', () => {
		const a = parseCap(cap({ id: '2.49.0.0.276.0.DWD.PVW.1.TEST', refs: ['2.49.0.0.276.0.DWD.PVW.0.ALT'], cells: ['101055000', '111000000'] }))!;
		expect(a.identifier).toBe('2.49.0.0.276.0.DWD.PVW.1.TEST');
		expect(a.severity).toBe('Severe');
		expect(levelOf(a.severity)).toBe(3);
		expect(a.headline).toBe('Amtliche UNWETTERWARNUNG vor ORKANBÖEN');
		expect(a.description).toBe('Es treten Orkanböen mit Geschwindigkeiten um 120 km/h & mehr auf.');
		expect(a.instruction).toBe('Bleiben Sie in Gebäuden <nicht im Wald>.');
		expect(a.eventGroup).toBe('WIND');
		expect(a.references).toEqual(['2.49.0.0.276.0.DWD.PVW.0.ALT']);
		expect(a.areas.map((x) => x.geocodes.WARNCELLID[0])).toEqual(['101055000', '111000000']);
		expect(parseCap('<alert><sent>x</sent></alert>')).toBeNull();
	});
	it('Warnzelle → Kreis, Polygon, Entitäten', () => {
		expect(kreisFromWarncell('101055000')).toBe('01055');
		expect(kreisFromWarncell('111000000')).toBe('11000');
		expect(kreisFromWarncell('801055001')).toBeNull();
		expect(kreisFromWarncell('10105500')).toBeNull();
		expect(parsePolygon('54.1,10.5 54.2,10.6 54.1,10.7')).toEqual([
			[10.5, 54.1],
			[10.6, 54.2],
			[10.7, 54.1],
			[10.5, 54.1]
		]);
		expect(parsePolygon('54.1,10.5')).toBeNull();
		expect(decode('A &amp; B &#252; &#x00e4;')).toBe('A & B ü ä');
	});
	it('ZIP mit deflate und stored; Momentaufnahme nur mit echten Meldungen', () => {
		const z = makeZip([
			{ name: 'a.xml', text: cap({ id: 'A' }) },
			{ name: 'b.xml', text: cap({ id: 'B', status: 'Test' }), store: true },
			{ name: 'c.txt', text: 'kein CAP' }
		]);
		expect(unzip(z).map((e) => e.name)).toEqual(['a.xml', 'b.xml', 'c.txt']);
		expect(parseSnapshot(z).map((a) => a.identifier)).toEqual(['A']);
		expect(() => unzip(Buffer.from('kein zip'))).toThrow(/ZIP/);
	});
	it('neueste deutsche Momentaufnahme aus der Verzeichnisliste', () => {
		const html = `<a href="Z_CAP_C_EDZW_20261024093040_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip">x</a>
			<a href="Z_CAP_C_EDZW_20261024094125_PVW_STATUS_PREMIUMDWD_DISTRICT_EN.zip">x</a>
			<a href="Z_CAP_C_EDZW_20261024094125_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip">x</a>
			<a href="Z_CAP_C_EDZW_20261023235959_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip">x</a>`;
		expect(latestFile(html)).toBe('Z_CAP_C_EDZW_20261024094125_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip');
		expect(latestFile('<html></html>')).toBeNull();
	});
});

describe('Querschnitt (D-084)', () => {
	it('alle 16 Länder mit Schlüssel und ISO-Kürzel', () => {
		expect(LAENDER).toHaveLength(16);
		expect(new Set(LAND_CODES).size).toBe(16);
		expect(LAND_ISOS).toContain('DE-SH');
		expect(LAND_CODES).toContain('16');
	});
	it('Ortsart Unterkunft mit eigenem Kartenfilter', () => {
		expect(KINDS.unterkunft.plural).toBe('Unterkünfte');
		expect(KIND_FILTERS.find((f) => f.key === 'unterkunft')?.kinds).toEqual(['unterkunft']);
	});
	it('Raster der Deutschland-Übersicht wird beim Heranzoomen feiner', () => {
		expect(gridCell(5)).toBeGreaterThan(gridCell(6));
		expect(gridCell(6)).toBeGreaterThan(gridCell(7));
		expect(gridCell(7)).toBeGreaterThan(gridCell(7.9));
	});
	it('Empfängerzahl unter 5 nur ungefähr', () => {
		expect(fuzzyCount(0)).toBe('niemand');
		expect(fuzzyCount(3)).toBe('weniger als 5');
		expect(fuzzyCount(1234)).toBe('1.234');
	});
});
