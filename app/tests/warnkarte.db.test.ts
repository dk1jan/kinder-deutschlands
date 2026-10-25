// F-053: Warnkarte und Überblick – nur Wetterwarnungen (DWD), Stufe 1 bleibt aus der Karte.
// Seit F-054 (D-093) gibt es keine Warnungen des Bevölkerungsschutzes mehr; die Tabelle lässt nur noch „dwd“ zu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Warnkarte (F-053, F-054)', async () => {
	const W = await import('../src/lib/server/warnings/store');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const poly = (x: number, y: number) => `ST_Multi(ST_GeomFromText('POLYGON((${x} ${y}, ${x + 0.1} ${y}, ${x + 0.1} ${y + 0.1}, ${x} ${y}))', 4326))`;

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Karte zeigt Wetterwarnungen ab Stufe 2 als Fläche, Stufe 1 und Warnungen ohne Fläche nicht', async () => {
		await sql.unsafe(`insert into warnings (id, provider, msg_type, severity, level, headline, sent, geom) values
			('dwd.1', 'dwd', 'Alert', 'Minor', 1, 'FROST', now(), ${poly(10.6, 54.0)}),
			('dwd.2', 'dwd', 'Alert', 'Moderate', 2, 'STURMBÖEN', now(), ${poly(10.6, 54.0)}),
			('dwd.3', 'dwd', 'Alert', 'Severe', 3, 'ORKANBÖEN', now(), ${poly(9.3, 54.7)}),
			('dwd.4', 'dwd', 'Alert', 'Moderate', 2, 'OHNE FLÄCHE', now(), null)`);
		const m = await W.mapData(sql);
		expect(m.features.map((f) => [f.properties.id, f.properties.l, f.properties.k]).sort()).toEqual([
			['dwd.2', 2, 'Markante Wetterwarnung'],
			['dwd.3', 3, 'Unwetterwarnung']
		]);
		expect(Object.keys(m.features[0].properties).sort()).toEqual(['a', 'b', 'id', 'k', 'l', 't']);
		expect((m.features[0].geometry as { type: string }).type).toBe('MultiPolygon');
	});

	it('beendete oder abgelaufene Warnungen stehen nicht auf der Karte', async () => {
		await sql`update warnings set ended_at = now() where id = 'dwd.2'`;
		await sql`update warnings set expires = now() - interval '1 minute' where id = 'dwd.3'`;
		expect((await W.mapData(sql)).features).toHaveLength(0);
	});

	it('Überblick zählt nur Wetterwarnungen', async () => {
		await sql`update warnings set ended_at = null where id = 'dwd.2'`;
		const ov = await W.overview(sql);
		expect(ov.byLevel[2]).toEqual({ n: 2, kreise: 0 });
		expect('nina' in ov).toBe(false);
	});

	it('andere Anbieter als „dwd“ sind in der Tabelle nicht mehr möglich', async () => {
		await expect(sql`insert into warnings (id, provider, msg_type, severity, level, headline, sent) values ('x.1', 'nina', 'Alert', 'Minor', 1, 'x', now())`).rejects.toThrow();
	});
});
