// F-019: Große Übernahmen (ganz Deutschland) müssen in Minuten statt Stunden laufen.
// Künstliche Testorte mit klar erkennbaren Namen, keine echten Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { runPlaceSource, type SourceRow } from '../src/lib/server/import/engine';
import type { ImportRecord } from '../src/lib/server/import/types';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const N = 6000;
// Raster über Deutschland: 6.000 Orte, je ca. 1 km auseinander – keine Dubletten untereinander
const grid = (i: number) => ({ lon: 6.5 + (i % 100) * 0.015, lat: 47.6 + Math.floor(i / 100) * 0.01 });
const rec = (id: string, lon: number, lat: number, extra: Partial<ImportRecord> = {}): ImportRecord => ({
	externalId: id,
	kind: 'spielplatz',
	name: `Massentest ${id}`,
	lon,
	lat,
	area: null,
	address: { ort: 'Teststadt' },
	features: { schaukel: true },
	openingHours: null,
	website: null,
	url: `https://www.openstreetmap.org/${id}`,
	raw: { leisure: 'playground' },
	...extra
});

d('Massenübernahme (F-019)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	let src: SourceRow;

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		[src] = (await sql`select * from data_sources where key = 'osm-spielplaetze'`) as unknown as SourceRow[];
	});
	afterAll(async () => {
		await sql.end();
	});

	it(`${N} neue Orte + Flächen + Dubletten in wenigen Sekunden, alles vollständig`, async () => {
		const feed: ImportRecord[] = [];
		for (let i = 0; i < N; i++) feed.push(rec(`node/${i}`, grid(i).lon, grid(i).lat));
		// 3 echte Dubletten: zweiter Eintrag ca. 10 m neben einem Rasterpunkt (gleiche Art)
		for (const i of [5, 1234, 5999]) feed.push(rec(`node/d${i}`, grid(i).lon + 0.0001, grid(i).lat + 0.00005));
		// knapp außerhalb von 30 m (ca. 45 m Ost-West bei 48° Nord) → keine Dublette
		feed.push(rec('node/weit', grid(10).lon + 0.0006, grid(10).lat));
		// Fläche statt Punkt (Weg mit Geometrie)
		const [w, s] = [grid(20).lon + 0.004, grid(20).lat + 0.004];
		feed.push(rec('way/flaeche', 0, 0, { area: { type: 'Polygon', coordinates: [[[w, s], [w + 0.001, s], [w + 0.001, s + 0.001], [w, s + 0.001], [w, s]]] } as never }));

		const t0 = Date.now();
		const runId = await runPlaceSource(sql, src, { trigger: 'manuell', fetchRecords: async () => feed });
		const ms = Date.now() - t0;
		const [r] = await sql`select status, counts, message from import_runs where id = ${runId}`;
		expect(r.message ?? '').toBe('');
		expect(r.status).toBe('uebernommen');
		expect(r.counts.neu).toBe(feed.length);
		expect(r.counts.dubletten).toBe(3);
		const [c] = await sql`select count(*)::int as n from places p join place_sources s on s.place_id = p.id where s.source_key = 'osm-spielplaetze' and p.status = 'aktiv'`;
		expect(c.n).toBe(feed.length);
		const [f] = await sql`select ST_GeometryType(p.area) as t, ST_Covers(p.area, p.location) as inside from places p join place_sources s on s.place_id = p.id where s.external_id = 'way/flaeche'`;
		expect(f.t).toBe('ST_Polygon');
		expect(f.inside).toBe(true);
		const [o] = await sql`select p.name, p.address, p.features, s.hash, s.external_url from places p join place_sources s on s.place_id = p.id where s.external_id = 'node/42'`;
		expect(o.name).toBe('Massentest node/42');
		expect(o.address).toEqual({ ort: 'Teststadt' });
		expect(o.features).toEqual({ schaukel: true });
		expect(o.hash).toHaveLength(32);
		expect(o.external_url).toBe('https://www.openstreetmap.org/node/42');
		// Vorher: jeder gegen jeden (Stunden bei 100.000). Grenze großzügig für langsame Testrechner.
		expect(ms).toBeLessThan(25_000);
	}, 60_000);

	it('Dublettenprüfung nutzt den Geometrie-Index', async () => {
		await sql`analyze places`;
		const plan = await sql.unsafe(`explain
			select 1 from unnest(array(select id from places limit 50)) as t(id)
			join places a on a.id = t.id
			join places b on b.kind = a.kind and b.id <> a.id
				and ST_DWithin(a.location, b.location, 0.0005::float8)
				and ST_DWithin(a.location::geography, b.location::geography, 30)
			where a.status in ('aktiv', 'pruefung') and b.status in ('aktiv', 'pruefung')`);
		const text = plan.map((x) => Object.values(x)[0]).join('\n');
		expect(text).toMatch(/places_location_idx/);
	});

	it('zweiter Lauf ohne Änderung: nichts neu, schnell', async () => {
		const [{ n }] = await sql`select count(*)::int as n from place_sources where source_key = 'osm-spielplaetze'`;
		const feed: ImportRecord[] = [];
		for (let i = 0; i < N; i++) feed.push(rec(`node/${i}`, grid(i).lon, grid(i).lat));
		const runId = await runPlaceSource(sql, { ...src, max_removal_pct: 100 }, { trigger: 'manuell', fetchRecords: async () => feed });
		const [r] = await sql`select status, counts from import_runs where id = ${runId}`;
		expect(r.status).toBe('uebernommen');
		expect(r.counts.neu).toBe(0);
		expect(r.counts.unveraendert).toBe(N);
		expect(n).toBe(N + 5);
	}, 60_000);
});
