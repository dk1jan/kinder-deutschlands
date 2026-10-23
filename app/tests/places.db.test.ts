// Ortsmodell, Importe und Datenzentrale gegen echte Datenbank. Testdaten sind künstlich (klar erkennbare Namen).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { runPlaceSource, applyRun, type SourceRow } from '../src/lib/server/import/engine';
import { importVg250 } from '../src/lib/server/import/regions';
import type { ImportRecord } from '../src/lib/server/import/types';
import { getPlace, placesInBbox, reportPlace, suggestPlace, toggleFavorite, nearbySameKind, searchPlaces } from '../src/lib/server/places';
import { decideSuggestion, editPlace, handleReport, mergePlaces, reviewQueue } from '../src/lib/server/datacenter';
import { deleteAccount, exportAccount } from '../src/lib/server/account';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const rec = (id: number, lon: number, lat: number, extra: Partial<ImportRecord> = {}): ImportRecord => ({
	externalId: `node/${id}`,
	kind: 'spielplatz',
	name: `Testspielplatz ${id}`,
	lon,
	lat,
	area: null,
	address: {},
	features: { schaukel: true },
	openingHours: null,
	website: null,
	url: `https://www.openstreetmap.org/node/${id}`,
	raw: { leisure: 'playground' },
	...extra
});

const sq = (w: number, s: number, e: number, n: number) => ({ type: 'MultiPolygon', coordinates: [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]] });

d('Orte und Importe (Datenbank)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	let src: SourceRow;
	let user = '';
	let editor = '';
	let feed: ImportRecord[] = [];
	const run = () => runPlaceSource(sql, src, { trigger: 'manuell', fetchRecords: async () => feed });

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		[src] = (await sql`select * from data_sources where key = 'osm-spielplaetze'`) as unknown as SourceRow[];
		const [u] = await sql`insert into users (email, password_hash, email_verified_at) values ('mama@example.org', 'x', now()) returning id`;
		const [e] = await sql`insert into users (email, password_hash, email_verified_at) values ('redaktion@example.org', 'x', now()) returning id`;
		user = u.id;
		editor = e.id;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Quellenkatalog ist befüllt: Lizenz, Namensnennung, Rhythmus', async () => {
		const rows = await sql`select key, license, attribution, interval_hours from data_sources order by key`;
		expect(rows.length).toBe(14); // + Stadt-/Ortsteile Niedersachsen (Sammel-Update), + 4 Ortsarten (F-018), + Overture (F-028)
		for (const r of rows) {
			expect(r.license).toBeTruthy();
			expect(r.attribution).toBeTruthy();
		}
	});

	it('Regionen-Import (VG250-Format): Land, Kreise, kreisfreie Städte nicht doppelt als Gemeinde', async () => {
		const fake = (async (u: URL) => {
			const t = u.searchParams.get('typeNames');
			const f = (props: Record<string, unknown>, g: unknown) => ({ type: 'Feature', properties: { gf: 4, sn_l: '04', ...props }, geometry: g });
			const body =
				t === 'vg250:vg250_lan' ? [f({ ars: '04', gen: 'Bremen', bez: 'Freie Hansestadt' }, sq(8.4, 52.9, 9.0, 53.6))]
				: t === 'vg250:vg250_krs' ? [f({ ars: '04011', gen: 'Bremen', bez: 'Kreisfreie Stadt' }, sq(8.5, 52.95, 9.0, 53.25)), f({ ars: '04012', gen: 'Bremerhaven', bez: 'Kreisfreie Stadt' }, sq(8.45, 53.45, 8.7, 53.6))]
				: [f({ ars: '040110000000', gen: 'Bremen', bez: 'Stadt', bem: 'kreisfrei' }, sq(8.5, 52.95, 9.0, 53.25))];
			return new Response(JSON.stringify({ type: 'FeatureCollection', features: body }));
		}) as unknown as typeof fetch;
		const r = await importVg250(sql, { laender: ['04'] }, fake);
		expect(r.counts).toEqual({ laender: 1, kreise: 2, gemeinden: 0 });
		const [b] = await sql`select name, source, (geom is not null) as g from regions where code = '04011'`;
		expect(b).toMatchObject({ name: 'Bremen (Stadt)', source: 'BKG VG250', g: true });
		// Stadtteil (Testgeometrie) für die Zuordnung
		await sql`insert into regions (code, name, level, parent_code, geom, center, source)
			values ('04011:st:test', 'Teststadtteil', 'stadtteil', '04011', ST_GeomFromGeoJSON(${JSON.stringify(sq(8.78, 53.08, 8.83, 53.11))}), ST_SetSRID(ST_MakePoint(8.8, 53.09), 4326), 'Test')`;
	});

	it('Erster Abruf: alles neu, Region zugeordnet, Herkunft gespeichert', async () => {
		feed = [rec(1, 8.80, 53.09), rec(2, 8.81, 53.095), rec(3, 8.70, 53.0), rec(4, 8.8001, 53.0901, { name: 'Testspielplatz Doppelt' })];
		const id = await run();
		const [r] = await sql`select status, counts from import_runs where id = ${id}`;
		expect(r.status).toBe('uebernommen');
		expect(r.counts).toMatchObject({ gelesen: 4, neu: 4, dubletten: 1 });
		const [p] = await sql`select p.region_code, p.status, p.confirmation from places p join place_sources s on s.place_id = p.id where s.external_id = 'node/1'`;
		expect(p).toMatchObject({ region_code: '04011:st:test', status: 'aktiv', confirmation: 'importiert' });
		const [p3] = await sql`select p.region_code from places p join place_sources s on s.place_id = p.id where s.external_id = 'node/3'`;
		expect(p3.region_code).toBe('04011');
	});

	it('Zweiter Abruf ohne Änderung: nichts neu, nur „gesehen“', async () => {
		const id = await run();
		const [r] = await sql`select counts from import_runs where id = ${id}`;
		expect(r.counts).toMatchObject({ neu: 0, geaendert: 0, entfernt: 0, unveraendert: 4 });
	});

	it('Redaktionelle Änderung wird gesperrt und vom Import nicht überschrieben', async () => {
		const [p] = await sql`select place_id from place_sources where external_id = 'node/2'`;
		const f = new FormData();
		f.set('kind', 'spielplatz');
		f.set('name', 'Spielplatz Redaktion');
		f.set('status', 'aktiv');
		f.set('confirmation', 'redaktion');
		f.set('f_wasserspiel', 'ja');
		f.set('f_schaukel', 'ja');
		await editPlace(sql, p.place_id, f, editor);
		feed = feed.map((r) => (r.externalId === 'node/2' ? { ...r, name: 'Name aus OSM', features: { schaukel: true, rutsche: true } } : r));
		const id = await run();
		const [c] = await sql`select counts from import_runs where id = ${id}`;
		expect(c.counts.geaendert).toBe(1);
		const [after] = await sql`select name, features, locked_fields from places where id = ${p.place_id}`;
		expect(after.name).toBe('Spielplatz Redaktion');
		expect(after.features).toMatchObject({ wasserspiel: true, rutsche: true, schaukel: true });
		expect(after.locked_fields).toEqual(expect.arrayContaining(['name', 'features.wasserspiel']));
	});

	it('Zu viele verschwundene Einträge: Abruf wartet als Vorschau, Freigabe archiviert (löscht nicht)', async () => {
		const extra = Array.from({ length: 20 }, (_, i) => rec(100 + i, 8.6 + i * 0.002, 53.0));
		feed = [...feed, ...extra];
		await run();
		feed = feed.filter((r) => !r.externalId.startsWith('node/1') || r.externalId === 'node/1');
		const id = await run();
		const [r] = await sql`select status, message, counts from import_runs where id = ${id}`;
		expect(r.status).toBe('vorschau');
		expect(r.message).toMatch(/entfernt/);
		const [{ n: before }] = await sql`select count(*)::int as n from places where status = 'archiviert'`;
		expect(before).toBe(0);
		await applyRun(sql, id, editor);
		const [{ n }] = await sql`select count(*)::int as n from places where status = 'archiviert'`;
		expect(n).toBe(20);
		const [{ total }] = await sql`select count(*)::int as total from places`;
		expect(total).toBe(24);
	});

	it('Wieder aufgetauchter Eintrag wird reaktiviert', async () => {
		feed = [...feed, rec(105, 8.61, 53.0)];
		await run();
		const [p] = await sql`select p.status from places p join place_sources s on s.place_id = p.id where s.external_id = 'node/105'`;
		expect(p.status).toBe('aktiv');
	});

	it('Fehlerhafte Quelle: Lauf „Fehler“, Bestand bleibt, Wiederholung geplant', async () => {
		const id = await runPlaceSource(sql, src, { trigger: 'zeitplan', fetchRecords: async () => { throw new Error('Overpass nicht erreichbar (Test)'); } });
		const [r] = await sql`select status, message from import_runs where id = ${id}`;
		expect(r.status).toBe('fehler');
		const [s] = await sql`select last_error, runs_failed, next_run_at < now() + interval '3 hours' as soon from data_sources where key = 'osm-spielplaetze'`;
		expect(s.runs_failed).toBe(1);
		expect(s.soon).toBe(true);
		const leer = await runPlaceSource(sql, src, { trigger: 'zeitplan', fetchRecords: async () => [] });
		const [l] = await sql`select status from import_runs where id = ${leer}`;
		expect(l.status).toBe('fehler');
		const [{ n }] = await sql`select count(*)::int as n from places where status = 'aktiv'`;
		expect(n).toBeGreaterThan(3);
	});

	it('Karte: Punkte im Ausschnitt, Filter nach Art und Merkmal', async () => {
		const all = await placesInBbox(sql, { w: 8.7, s: 53.05, e: 8.9, n: 53.12 }, [], []);
		expect(all.features.length).toBe(3);
		const water = await placesInBbox(sql, { w: 8.7, s: 53.05, e: 8.9, n: 53.12 }, ['spielplatz'], ['wasserspiel']);
		expect(water.features.map((f) => f.properties.n)).toEqual(['Spielplatz Redaktion']);
		const toilets = await placesInBbox(sql, { w: 8.7, s: 53.05, e: 8.9, n: 53.12 }, ['toilette'], []);
		expect(toilets.features.length).toBe(0);
		const s = await searchPlaces(sql, 'Redaktion');
		expect(s.places[0].name).toBe('Spielplatz Redaktion');
		const r = await searchPlaces(sql, 'Teststadt');
		expect(r.regions[0].name).toBe('Teststadtteil');
	});

	it('Dubletten: Prüffall, Zusammenführen nimmt Quellen und Merkliste mit', async () => {
		const q = await reviewQueue(sql);
		expect(q.duplicates.length).toBe(1);
		const dup = q.duplicates[0];
		await toggleFavorite(sql, user, dup.place_b);
		await mergePlaces(sql, dup.place_a, dup.place_b, editor);
		const [b] = await sql`select status, merged_into from places where id = ${dup.place_b}`;
		expect(b).toMatchObject({ status: 'zusammengefuehrt', merged_into: dup.place_a });
		const [{ n }] = await sql`select count(*)::int as n from place_sources where place_id = ${dup.place_a}`;
		expect(n).toBe(2);
		const [fav] = await sql`select 1 as x from place_favorites where user_id = ${user} and place_id = ${dup.place_a}`;
		expect(fav.x).toBe(1);
		expect((await reviewQueue(sql)).duplicates.length).toBe(0);
		// Nächster Abruf: zwei Quellen am selben Ort – nur die ältere pflegt die Angaben, nichts wird doppelt angelegt
		await run();
		const [{ m }] = await sql`select count(*)::int as m from places where status = 'aktiv' and kind = 'spielplatz' and ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(8.8, 53.09), 4326)::geography, 30)`;
		expect(m).toBe(1);
	});

	it('Meldung „defekt“: sofort unbestätigter Hinweis ohne Freitext, Redaktion bestätigt', async () => {
		const [p] = await sql`select place_id from place_sources where external_id = 'node/1'`;
		const rid = await reportPlace(sql, user, p.place_id, 'defekt', 'Schaukelkette gerissen, Name Max');
		let pl = (await getPlace(sql, p.place_id, null))!;
		expect(pl.notices).toEqual([expect.objectContaining({ kind: 'defekt', origin: 'nutzer', text: null })]);
		await handleReport(sql, rid!, 'erledigt', 'bestaetigen', 'Schaukel defekt, Reparatur beauftragt', null, editor);
		pl = (await getPlace(sql, p.place_id, null))!;
		expect(pl.notices).toEqual([expect.objectContaining({ origin: 'redaktion', text: 'Schaukel defekt, Reparatur beauftragt' })]);
	});

	it('F-036: Melder bekommt nach Erledigt/Ablehnen eine Mitteilung (Standarddank oder eigener Text), nichts Internes', async () => {
		const [p] = await sql`select place_id from place_sources where external_id = 'node/1'`;
		const msgs = async () => (await sql`select text, link, kind from notifications where user_id = ${user} and kind = 'meldung' order by created_at, id`) as unknown as { text: string; link: string | null; kind: string }[];
		const before = (await msgs()).length;
		// Erledigt, Standarddank, interne Notiz bleibt intern
		const r1 = await reportPlace(sql, user, p.place_id, 'sonstiges', 'Bitte prüfen');
		await handleReport(sql, r1!, 'erledigt', null, null, null, editor, { note: 'INTERN: Rückruf nötig' });
		let m = await msgs();
		expect(m.length).toBe(before + 1);
		expect(m[m.length - 1].text).toContain('Danke für deine Meldung – wir haben sie bearbeitet.');
		const [pn] = await sql`select name from places where id = ${p.place_id}`;
		expect(m[m.length - 1].text).toContain(pn.name as string);
		expect(m[m.length - 1].text).not.toContain('INTERN');
		expect(m[m.length - 1].link).toBe(`/orte/${p.place_id}`);
		const [res] = await sql`select resolution from place_reports where id = ${r1!}`;
		expect(res.resolution).toBe('INTERN: Rückruf nötig');
		// Abgelehnt, eigener Text
		const r2 = await reportPlace(sql, user, p.place_id, 'falsche_angabe', 'Öffnungszeit falsch');
		await handleReport(sql, r2!, 'abgelehnt', null, null, null, editor, { toReporter: 'Super aufgepasst, bitte weiter so!' });
		m = await msgs();
		expect(m.length).toBe(before + 2);
		expect(m[m.length - 1].text).toContain('Super aufgepasst, bitte weiter so!');
		expect(m[m.length - 1].text).not.toContain('Danke für deine Meldung');
		// Öffentlicher Hinweis geht nur in den Hinweis am Ort, nicht an den Melder
		const r3 = await reportPlace(sql, user, p.place_id, 'gesperrt', null);
		await handleReport(sql, r3!, 'erledigt', 'bestaetigen', 'Bauzaun bis Freitag', null, editor);
		m = await msgs();
		expect(m.length).toBe(before + 3);
		expect(m[m.length - 1].text).not.toContain('Bauzaun');
		await handleReport(sql, (await reportPlace(sql, user, p.place_id, 'sonstiges', null))!, 'abgelehnt', null, null, null, editor);
	});

	it('Vorschlag: Dublettenprüfung, erst nach Freigabe sichtbar', async () => {
		const near = await nearbySameKind(sql, 'spielplatz', 8.8002, 53.0902);
		expect(near.length).toBeGreaterThan(0);
		const id = await suggestPlace(sql, user, { kind: 'indoorspielplatz', name: 'Testhalle', lon: 8.79, lat: 53.1, description: null, features: { wickeltisch: true }, openingHours: null });
		expect((await placesInBbox(sql, { w: 8.7, s: 53.05, e: 8.9, n: 53.12 }, ['drinnen'], [])).features.length).toBe(0);
		await decideSuggestion(sql, id, true, editor, null);
		const [ms] = await sql`select text, link from notifications where user_id = ${user} and kind = 'meldung' and text like 'Zu deinem Vorschlag%' order by created_at desc limit 1`;
		expect(ms.text).toContain('Testhalle');
		expect(ms.text).toContain('Danke für deinen Vorschlag – wir haben ihn bearbeitet.');
		expect(ms.link).toBe(`/orte/${id}`);
		const after = await placesInBbox(sql, { w: 8.7, s: 53.05, e: 8.9, n: 53.12 }, ['drinnen'], []);
		expect(after.features.map((f) => f.properties.n)).toEqual(['Testhalle']);
		const [p] = await sql`select confirmation, region_code from places where id = ${id}`;
		expect(p).toMatchObject({ confirmation: 'community', region_code: '04011:st:test' });
	});

	it('Export enthält Merkliste und Vorschläge; Löschung entfernt Personenbezug', async () => {
		const data = await exportAccount(sql, user);
		expect(data.orte_merkliste.length).toBe(1);
		expect(data.orte_vorschlaege.length).toBe(1);
		const pending = await suggestPlace(sql, user, { kind: 'spielplatz', name: 'Noch offen', lon: 8.7, lat: 53.0, description: null, features: {}, openingHours: null });
		await deleteAccount(sql, user);
		const [{ f }] = await sql`select count(*)::int as f from place_favorites where user_id = ${user}`;
		expect(f).toBe(0);
		const [{ r }] = await sql`select count(*)::int as r from place_reports where user_id = ${user} or message like '%Max%'`;
		expect(r).toBe(0);
		const [gone] = await sql`select count(*)::int as n from places where id = ${pending}`;
		expect(gone.n).toBe(0);
		const [{ c }] = await sql`select count(*)::int as c from places where created_by = ${user}`;
		expect(c).toBe(0);
		const [{ kept }] = await sql`select count(*)::int as kept from places where name = 'Testhalle' and status = 'aktiv'`;
		expect(kept).toBe(1);
	});
});
