// F-029: eindeutige Dubletten aus Importen selbst zusammenführen; unklare Fälle bleiben zur Prüfung.
// Künstliche Testorte, keine echten Daten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { detectDuplicates } from '../src/lib/server/import/engine';
import { autoMergeDuplicates, markDistinct, namesCompatible } from '../src/lib/server/datacenter';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

describe('Namen passen? (F-029)', () => {
	it('beide leer, gleich oder ähnlich → ja; einer leer nur bis 15 m', () => {
		expect(namesCompatible(null, null, 25)).toBe(true);
		expect(namesCompatible('Spielplatz Mühlenweg', 'spielplatz mühlenweg', 25)).toBe(true);
		expect(namesCompatible('Spielplatz Mühlenweg', 'Spielplatz Bahnhofstraße', 3)).toBe(false);
		expect(namesCompatible('Spielplatz Mühlenweg', null, 10)).toBe(true);
		expect(namesCompatible('Spielplatz Mühlenweg', '', 20)).toBe(false);
	});
});

d('Dubletten automatisch zusammenführen (F-029)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const ids: Record<string, string> = {};
	let user = '';

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		[{ id: user }] = await sql`insert into users (email, password_hash, email_verified_at) values ('dub@example.org', 'x', now()) returning id`;
		// [Name, Art, Lon-Versatz in m, Lat-Basis, Bestätigung, Merkmale, Fläche]
		const add = async (key: string, kind: string, name: string | null, lon: number, lat: number, conf = 'importiert', features = {}) => {
			const [p] = await sql`insert into places (kind, name, location, status, confirmation, features)
				values (${kind}, ${name}, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326), 'aktiv', ${conf}, ${sql.json(features)}) returning id`;
			ids[key] = p.id;
			await sql`insert into place_sources (source_key, external_id, place_id, hash, raw) values ('osm-toiletten', ${key}, ${p.id}, 'h', '{}')`;
		};
		const m = 1 / 67000; // ca. 1 m Ost-West bei 53,5° Nord
		// 1) Drei Toiletten am selben Punkt (wie Jans Karlsruhe-Beispiel) → eine bleibt
		await add('t1', 'toilette', null, 8.4, 53.5);
		await add('t2', 'toilette', null, 8.4, 53.5, 'importiert', { wickeltisch: true }); // mehr Angaben → bleibt
		await add('t3', 'toilette', null, 8.4, 53.5);
		// 2) Zwei verschieden benannte Spielplätze nebeneinander → bleiben beide, Prüffall
		await add('s1', 'spielplatz', 'Spielplatz Mühlenweg', 8.5, 53.5);
		await add('s2', 'spielplatz', 'Spielplatz Bahnhofstraße', 8.5 + 3 * m, 53.5);
		// 3) Name und Punkt ohne Namen: 5 m → zusammen, 25 m → Prüffall
		await add('n1', 'spielplatz', 'Spielplatz Lindenhof', 8.6, 53.5);
		await add('n2', 'spielplatz', null, 8.6 + 5 * m, 53.5);
		await add('f1', 'spielplatz', 'Spielplatz Eichenweg', 8.7, 53.5);
		await add('f2', 'spielplatz', null, 8.7 + 25 * m, 53.5);
		// 4) Von Mitgliedern bestätigt → nie automatisch
		await add('c1', 'wickelraum', null, 8.8, 53.5, 'community');
		await add('c2', 'wickelraum', null, 8.8, 53.5);
		// 5) Schon als „verschiedene Orte“ entschieden → bleibt
		await add('v1', 'toilette', null, 8.9, 53.5);
		await add('v2', 'toilette', null, 8.9, 53.5);
		await detectDuplicates(sql, Object.values(ids));
		await markDistinct(sql, ids.v1, ids.v2, user);
		// Bewertung am Ort, der verschwindet, zieht mit um
		await sql`insert into place_reviews (place_id, user_id, stars) values (${ids.t1}, ${user}, 4)`;
		await sql`insert into place_favorites (user_id, place_id) values (${user}, ${ids.t3})`;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('führt Eindeutiges zusammen, lässt Unklares stehen', async () => {
		// Reihenfolge erzwingen, die vorher eine Kette ergab: t1+t3 zuerst (beide ohne Angaben), dann gegen t2
		await sql`update place_duplicates set distance_m = 0 where (place_a, place_b) in ((least(${ids.t1}::uuid, ${ids.t3}::uuid), greatest(${ids.t1}::uuid, ${ids.t3}::uuid)))`;
		await sql`update place_duplicates set distance_m = 0.5 where status = 'offen' and not ((place_a, place_b) in ((least(${ids.t1}::uuid, ${ids.t3}::uuid), greatest(${ids.t1}::uuid, ${ids.t3}::uuid)))) and distance_m < 0.5`;
		const [{ open }] = await sql`select count(*)::int as open from place_duplicates where status = 'offen'`;
		expect(open).toBe(7); // t: 3 Paare, s, n, f, c (v ist entschieden)
		const r = await autoMergeDuplicates(sql);
		expect(r.zusammengefuehrt).toBe(3); // t1+t3 in t2, n2 in n1
		expect(r.offen).toBe(3); // s, f, c
		const st = async (k: string) => (await sql`select status, merged_into from places where id = ${ids[k]}`)[0];
		expect((await st('t2')).status).toBe('aktiv');
		expect(await st('t1')).toMatchObject({ status: 'zusammengefuehrt', merged_into: ids.t2 });
		expect(await st('t3')).toMatchObject({ status: 'zusammengefuehrt', merged_into: ids.t2 });
		expect((await st('n1')).status).toBe('aktiv');
		expect((await st('n2')).status).toBe('zusammengefuehrt');
		for (const k of ['s1', 's2', 'f1', 'f2', 'c1', 'c2', 'v1', 'v2']) expect((await st(k)).status, k).toBe('aktiv');
		// Quellen, Bewertung, Merkliste hängen am bleibenden Ort; Protokoll vermerkt „automatisch“
		const [{ n }] = await sql`select count(*)::int as n from place_sources where place_id = ${ids.t2}`;
		expect(n).toBe(3);
		expect((await sql`select place_id from place_reviews where user_id = ${user}`)[0].place_id).toBe(ids.t2);
		expect((await sql`select place_id from place_favorites where user_id = ${user}`)[0].place_id).toBe(ids.t2);
		const [{ a }] = await sql`select count(*)::int as a from audit_log where action = 'place.merged' and meta->>'automatisch' = 'true'`;
		expect(a).toBe(3);
		// Zweiter Lauf ändert nichts mehr
		expect((await autoMergeDuplicates(sql)).zusammengefuehrt).toBe(0);
	});
});
