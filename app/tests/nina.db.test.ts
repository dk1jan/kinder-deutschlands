// F-053 (D-092): Warnungen des Bevölkerungsschutzes aus NINA (warnung.bund.de/api31). Nachgebaute Antworten im Format
// der echten Schnittstelle (geprüft 25.10.2026 an einer MoWaS-Meldung „Trinkwasserversorgung – Böbrach“), Testregionen erfunden.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plain, ringsOf, toAlert } from '../src/lib/server/warnings/nina';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const outbox = mkdtempSync(join(tmpdir(), 'kd-push-nina-'));
process.env.PUSH_OUTBOX_DIR = outbox;
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

const capJson = (o: { headline: string; severity?: string; ars?: string; desc?: string; event?: string }) => ({
	identifier: 'x',
	sender: 'DE-XX',
	sent: '2026-10-25T10:00:00+01:00',
	status: 'Actual',
	msgType: 'Alert',
	info: [
		{
			language: 'de',
			event: o.event ?? 'Gefahreninformation',
			urgency: 'Immediate',
			severity: o.severity ?? 'Minor',
			headline: o.headline,
			description: o.desc ?? '&quot;Wichtige Information&quot;<br/><br/>Bitte Wasser abkochen.',
			instruction: 'Trinken Sie kein Leitungswasser.<br/>Kochen Sie das Wasser ab.<br/>',
			web: 'www.example.org',
			contact: 'Gemeinde Test<br/>0123 456',
			parameter: [
				{ valueName: 'sender_langname', value: 'Leitstelle Test' },
				...(o.ars ? [{ valueName: 'warnVerwaltungsbereiche', value: o.ars }] : [])
			],
			area: [{ areaDesc: 'Testgemeinde' }]
		},
		{ language: 'en', headline: 'English', severity: 'Minor', area: [{ areaDesc: 'x' }] }
	]
});
const square = (x: number, y: number, s = 0.05) => ({
	type: 'FeatureCollection',
	features: [{ type: 'Feature', properties: { warnId: 'x' }, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]] } }]
});

describe('NINA lesen (F-053)', () => {
	it('HTML-Reste werden zu Text', () => {
		expect(plain('&quot;Achtung&quot;<br/><br/>Wasser abkochen.<br/>')).toBe('"Achtung"\n\nWasser abkochen.');
		expect(plain('<b>fett</b> &amp; gut')).toBe('fett & gut');
		expect(plain('   ')).toBeNull();
	});
	it('deutscher Block, Regionalschlüssel, Gebiet', () => {
		const a = toAlert('mowas', { id: 'mow.1', version: 3, severity: 'Minor', type: 'Alert', startDate: null, title: 't' }, capJson({ headline: 'Trinkwasser', ars: '010550001001' }), square(9.4, 54.8))!;
		expect(a).toMatchObject({ identifier: 'mow.1', source: 'mowas', version: 3, headline: 'Trinkwasser', event: 'Gefahreninformation', senderName: 'Leitstelle Test', contact: 'Gemeinde Test\n0123 456' });
		expect(a.instruction).toBe('Trinken Sie kein Leitungswasser.\nKochen Sie das Wasser ab.');
		expect(a.areas[0].geocodes.ARS).toEqual(['010550001001']);
		expect(a.areas[0].polygons).toHaveLength(1);
		expect(ringsOf({ type: 'MultiPolygon', coordinates: [[[[1, 1], [2, 1], [2, 2], [1, 1]]], [[[3, 3], [4, 3], [4, 4], [3, 3]]]] })).toHaveLength(2);
	});
});

d('NINA-Warnungen in der Datenbank (F-053)', async () => {
	const W = await import('../src/lib/server/warnings/store');
	const J = await import('../src/lib/server/warnings/jobs');
	const { ensureProfile } = await import('../src/lib/server/profiles');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	// Was die nachgebaute Schnittstelle gerade liefert
	let lists: Record<string, unknown[] | 'fehler'> = {};
	const caps = new Map<string, unknown>();
	const geos = new Map<string, unknown>();
	const fake = (async (input: string | URL) => {
		const s = String(input);
		const m = /\/api31\/(\w+)\/mapData\.json$/.exec(s);
		if (m) {
			const l = lists[m[1]] ?? [];
			return l === 'fehler' ? new Response('kaputt', { status: 500 }) : Response.json(l);
		}
		const w = /\/warnings\/(.+)\.(json|geojson)$/.exec(s);
		if (w) {
			const id = decodeURIComponent(w[1]);
			const v = (w[2] === 'json' ? caps : geos).get(id);
			return v ? Response.json(v) : new Response('nicht da', { status: 404 });
		}
		return new Response('?', { status: 404 });
	}) as typeof fetch;
	const item = (id: string, version: number, severity = 'Minor') => ({ id, version, severity, type: 'Alert', startDate: '2026-10-25T10:00:00+01:00', i18nTitle: { de: id } });
	const notes = (uid: string) => sql`select text, link from notifications where kind = 'warnung' and user_id = ${uid} order by id`;

	beforeAll(async () => {
		process.env.NINA_URL = 'https://nina.test/api31';
		process.env.NINA_WAIT_MS = '1';
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		await sql`insert into regions (code, name, level, parent_code, source, geom, center) values
			('01055', 'Kreis Ostholstein', 'kreis', '01', 'Test', ST_Multi(ST_GeomFromText('POLYGON((10.6 54.0, 11.2 54.0, 11.2 54.5, 10.6 54.5, 10.6 54.0))', 4326)), ST_SetSRID(ST_MakePoint(10.9, 54.2), 4326)),
			('01001', 'Flensburg', 'kreis', '01', 'Test', ST_Multi(ST_GeomFromText('POLYGON((9.3 54.7, 9.6 54.7, 9.6 54.9, 9.3 54.9, 9.3 54.7))', 4326)), ST_SetSRID(ST_MakePoint(9.45, 54.8), 4326))`;
		for (const n of ['oh', 'fl']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@nina.example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
		}
		await W.subscribe(sql, u.oh, '01055', 2, true, 'Oma');
		await W.subscribe(sql, u.fl, '01001', 4, false, null); // nur extremes Unwetter – Bevölkerungsschutz kommt trotzdem
		await sql`insert into push_subscriptions (id, user_id, endpoint, p256dh, auth) values ('ps-oh', ${u.oh}, 'https://push.example.org/oh', 'k', 'a')`;
	});
	afterAll(async () => {
		delete process.env.NINA_URL;
		await sql.end();
		rmSync(outbox, { recursive: true, force: true });
	});

	it('erster Lauf übernimmt still; Kreis über Regionalschlüssel, Fläche aus dem Gebiet', async () => {
		lists = { mowas: [item('mow.A', 1)] };
		caps.set('mow.A', capJson({ headline: 'Trinkwasserversorgung - Testgemeinde', ars: '010550001001' }));
		geos.set('mow.A', square(10.8, 54.2));
		const r = await J.tickNina(sql, fake);
		expect(r).toMatchObject({ neu: 1, aktiv: 1, mitteilungen: 0 });
		const w = await W.getWarning(sql, 'mow.A');
		expect(w).toMatchObject({ provider: 'nina', source: 'mowas', levelLabel: 'Gefahreninformation', sourceLabel: 'Bevölkerungsschutz (MoWaS)', senderName: 'Leitstelle Test', web: 'https://www.example.org/' });
		expect(w?.kreise).toEqual([{ code: '01055', name: 'Kreis Ostholstein' }]);
		const [g] = await sql`select ST_GeometryType(geom) as t, round(ST_Area(geom)::numeric, 4) as a from warnings where id = 'mow.A'`;
		expect(g).toMatchObject({ t: 'ST_MultiPolygon', a: '0.0025' });
		expect(await notes(u.oh)).toHaveLength(0);
	});

	it('neue Meldung: an alle Abonnenten des Kreises (auch „nur Stufe 4“), mit Push nach Wahl; Kreis notfalls über die Fläche', async () => {
		lists = { mowas: [item('mow.A', 1)], katwarn: [item('kat.B', 1)] };
		caps.set('kat.B', capJson({ headline: 'Großbrand in Flensburg – Fenster schließen', event: 'Gefahrenmitteilung', severity: 'Moderate' }));
		geos.set('kat.B', square(9.4, 54.75));
		const p0 = readdirSync(outbox).length;
		const r = await J.tickNina(sql, fake);
		expect(r).toMatchObject({ neu: 1, aktiv: 2, mitteilungen: 1 });
		expect(await notes(u.fl)).toEqual([{ text: 'Gefahrenmitteilung für Flensburg: Großbrand in Flensburg – Fenster schließen', link: '/warnungen/kat.B' }]);
		expect(readdirSync(outbox).length - p0).toBe(0); // fl ohne Push
		expect((await W.activeFor(sql, '01001')).map((x) => x.id)).toEqual(['kat.B']);
	});

	it('neue Fassung: gleiche Stufe still aktualisiert, höhere Stufe meldet erneut', async () => {
		lists = { mowas: [item('mow.A', 2)], katwarn: [item('kat.B', 1)] };
		caps.set('mow.A', capJson({ headline: '1. AKTUALISIERUNG: Trinkwasserversorgung - Testgemeinde', ars: '010550001001' }));
		await J.tickNina(sql, fake);
		expect((await W.getWarning(sql, 'mow.A'))?.headline).toBe('1. AKTUALISIERUNG: Trinkwasserversorgung - Testgemeinde');
		expect(await notes(u.oh)).toHaveLength(0); // Stufe gleich (1) → still
		lists = { mowas: [item('mow.A', 3)], katwarn: [item('kat.B', 1)] };
		caps.set('mow.A', capJson({ headline: 'Evakuierung Testgemeinde', ars: '010550001001', severity: 'Severe', event: 'Gefahrendurchsage' }));
		const p0 = readdirSync(outbox).length;
		await J.tickNina(sql, fake);
		expect(await notes(u.oh)).toEqual([{ text: 'Gefahrendurchsage für Oma: Evakuierung Testgemeinde', link: '/warnungen/mow.A' }]);
		expect(readdirSync(outbox).length - p0).toBe(1);
	});

	it('ausgefallene Quelle beendet nichts; verschwundene Meldung einer erreichbaren Quelle ist beendet', async () => {
		lists = { mowas: [], katwarn: 'fehler' };
		const r = await J.tickNina(sql, fake);
		expect(r).toMatchObject({ aktiv: 0, beendet: 1 });
		const st = await sql`select id, ended_at is not null as ended from warnings order by id`;
		expect(st.map((x) => [x.id, x.ended])).toEqual([['kat.B', false], ['mow.A', true]]);
		expect((await J.ninaState(sql)).last_error).toMatch(/katwarn/);
		lists = { mowas: [], katwarn: [], biwapp: 'fehler', lhp: 'fehler', police: 'fehler' };
		await J.tickNina(sql, fake);
		expect((await sql`select ended_at is not null as e from warnings where id = 'kat.B'`)[0].e).toBe(true);
	});

	it('alles ausgefallen → Fehler, nichts beendet', async () => {
		lists = { mowas: 'fehler', katwarn: 'fehler', biwapp: 'fehler', lhp: 'fehler', police: 'fehler' };
		await expect(J.tickNina(sql, fake)).rejects.toThrow(/NINA nicht erreichbar/);
	});

	it('Karte: Bevölkerungsschutz immer, Wetter erst ab Stufe 2; Zählung getrennt', async () => {
		lists = { mowas: [item('mow.C', 1)] };
		caps.set('mow.C', capJson({ headline: 'Gefahrstoff-Austritt', ars: '010010000000' }));
		geos.set('mow.C', square(9.35, 54.72));
		await J.tickNina(sql, fake);
		await sql`insert into warnings (id, provider, source, msg_type, severity, level, headline, sent, geom) values
			('dwd.1', 'dwd', 'dwd', 'Alert', 'Minor', 1, 'FROST', now(), ST_Multi(ST_GeomFromText('POLYGON((10.6 54.0, 10.7 54.0, 10.7 54.1, 10.6 54.0))', 4326))),
			('dwd.2', 'dwd', 'dwd', 'Alert', 'Moderate', 2, 'STURMBÖEN', now(), ST_Multi(ST_GeomFromText('POLYGON((10.6 54.0, 10.7 54.0, 10.7 54.1, 10.6 54.0))', 4326)))`;
		const m = await W.mapData(sql);
		expect(m.features.map((f) => [f.properties.id, f.properties.p, f.properties.k]).sort()).toEqual([
			['dwd.2', 'dwd', 'Markante Wetterwarnung'],
			['mow.C', 'nina', 'Gefahreninformation']
		]);
		expect((m.features.find((f) => f.properties.id === 'mow.C')!.geometry as { type: string }).type).toBe('MultiPolygon');
		const ov = await W.overview(sql);
		expect(ov.nina).toBe(1);
		expect(ov.byLevel[2]).toEqual({ n: 1, kreise: 0 });
	});
});
