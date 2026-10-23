// F-028: kompletter Overture-Lauf gegen einen lokalen Nachbau des AWS-Speichers (Liste + HTTP-Teilabruf), dann Abgleich
// mit dem Bestand, Meldung „gibt es nicht mehr“ blendet aus, Entscheidung der Redaktion bleibt beim nächsten Lauf bestehen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { runSource } from '../src/lib/server/import/jobs';
import { reportPlace } from '../src/lib/server/places';
import { handleReport } from '../src/lib/server/datacenter';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const bytes = readFileSync('tests/fixtures/overture-places.parquet');
const KEY = 'release/2026-10-21.0/theme=places/type=place/part-00000-test.zstd.parquet';

d('Overture-Quelle (F-028)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	let server: Server;
	let user: string;
	let ranges = 0;
	const env = { ...process.env };

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		server = createServer((req, res) => {
			const u = new URL(req.url ?? '/', 'http://x');
			if (u.searchParams.get('list-type') === '2') {
				res.setHeader('content-type', 'application/xml');
				if (u.searchParams.get('delimiter')) return res.end('<ListBucketResult><CommonPrefixes><Prefix>release/2026-10-21.0/</Prefix></CommonPrefixes></ListBucketResult>');
				return res.end(`<ListBucketResult><Contents><Key>${KEY}</Key><Size>${bytes.length}</Size></Contents></ListBucketResult>`);
			}
			const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? '');
			if (!m || decodeURIComponent(u.pathname) !== '/' + KEY) return (res.statusCode = 404), res.end();
			ranges++;
			res.statusCode = 206;
			res.end(bytes.subarray(Number(m[1]), Number(m[2]) + 1));
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
		const port = (server.address() as { port: number }).port;
		process.env.OVERTURE_URL = `http://127.0.0.1:${port}`;
		process.env.OVERTURE_DIR = '/tmp/kd-test-overture';
		rmSync('/tmp/kd-test-overture', { recursive: true, force: true });
		[{ id: user }] = await sql`insert into users (email, password_hash, email_verified_at) values ('ov@example.org', 'x', now()) returning id`;
		// Schon da (aus OSM): „Abenteuerland“ ca. 90 m neben dem Overture-Eintrag, andere Art → über den Namen erkannt
		await sql`insert into places (kind, name, location, status, confirmation) values ('ausflugsort', 'Abenteuerland', ST_SetSRID(ST_MakePoint(8.7513, 53.1001), 4326), 'aktiv', 'importiert')`;
	});
	afterAll(async () => {
		Object.assign(process.env, { OVERTURE_URL: env.OVERTURE_URL ?? '', OVERTURE_DIR: env.OVERTURE_DIR ?? '' });
		server?.close();
		await sql.end();
	});

	const live = () => sql`select p.name, p.kind, p.status, p.features, p.address, p.website from places p
		join place_sources s on s.place_id = p.id where s.source_key = 'overture-orte' order by p.name`;

	it('lädt per Teilabruf, übernimmt nur Passendes und nichts doppelt', async () => {
		const runId = await runSource(sql, 'overture-orte', 'manuell');
		const [r] = await sql`select status, counts, message from import_runs where id = ${runId}`;
		expect(r.message ?? '').toBe('');
		expect(r.status).toBe('uebernommen');
		const rows = await live();
		expect(rows.map((x) => x.name as string).sort()).toEqual([
			'Erlebniswelt Kiddo Bremen',
			'Indoorspielplatz Bremen Neustadt',
			'JUMP House Bremen',
			"Leo's Abenteuerpark",
			'Spiel Coolisse im Weserpark GmbH',
			'Superfly Hamburg',
			'kek-Kindermuseum für Bremen',
			'Kinderbauernhof Tenever St. Petri'
		].sort());
		const leo = rows.find((x) => x.name === "Leo's Abenteuerpark")!;
		expect(leo).toMatchObject({ kind: 'indoorspielplatz', status: 'aktiv', website: 'https://leosabenteuerpark.de/' });
		expect(leo.address).toEqual({ street: 'Löwenhof', housenumber: '4', postcode: '28217', city: 'Bremen' });
		expect(rows.find((x) => x.name === 'Superfly Hamburg')!.features).toEqual({ einrichtung: 'Trampolinhalle' });
		expect(rows.find((x) => x.name.startsWith('kek'))!).toMatchObject({ kind: 'ausflugsort', features: { einrichtung: 'Kindermuseum' } });
		expect(ranges).toBeGreaterThan(1);
	});

	it('„gibt es nicht mehr“ blendet sofort aus; abgelehnt → wieder da; bestätigt → bleibt weg, auch nach dem nächsten Lauf', async () => {
		const id = async (n: string) => (await sql`select id from places where name = ${n}`)[0].id as string;
		const leo = await id("Leo's Abenteuerpark");
		const jump = await id('JUMP House Bremen');
		const r1 = await reportPlace(sql, user, leo, 'existiert_nicht', null);
		const r2 = await reportPlace(sql, user, jump, 'existiert_nicht', null);
		const st = async (pid: string) => (await sql`select status from places where id = ${pid}`)[0].status;
		expect(await st(leo)).toBe('pruefung');
		expect(await st(jump)).toBe('pruefung');
		// nicht als „Vorschlag von Mitgliedern“ gezählt
		const [{ n }] = await sql`select count(*)::int as n from places where status = 'pruefung' and created_by is not null`;
		expect(n).toBe(0);
		await handleReport(sql, r1!, 'erledigt', null, 'geschlossen', null, user);
		await handleReport(sql, r2!, 'abgelehnt', null, null, null, user);
		expect(await st(leo)).toBe('archiviert');
		expect(await st(jump)).toBe('aktiv');
		const before = ranges;
		await runSource(sql, 'overture-orte', 'zeitplan');
		expect(ranges).toBe(before); // gleiche Ausgabe → aus dem Zwischenspeicher, nichts neu geladen
		expect(await st(leo)).toBe('archiviert');
		expect(await st(jump)).toBe('aktiv');
	});

	it('Orte aus OSM werden durch eine Meldung nicht ausgeblendet', async () => {
		const [{ id }] = await sql`select id from places where name = 'Abenteuerland'`;
		await reportPlace(sql, user, id, 'existiert_nicht', null);
		expect((await sql`select status from places where id = ${id}`)[0].status).toBe('aktiv');
	});
});
