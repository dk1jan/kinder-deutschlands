// Jan 24.10.2026 (D-084): Moderatoren-Forum, Rundnachrichten, Unwetterwarnungen (DWD), Deutschland-Übersicht der Karte,
// Migration (Unterkünfte, Grundkarte ganz Deutschland). Künstliche Testkonten und erfundene Testregionen.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cap, makeZip } from './helpers/dwd';

process.env.MEDIA_DIR = '/tmp/kd-media-test';
process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const outbox = mkdtempSync(join(tmpdir(), 'kd-push-'));
process.env.PUSH_OUTBOX_DIR = outbox;

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;
const pushes = () => readdirSync(outbox).length;

d('Ganz Deutschland (D-084)', async () => {
	const P = await import('../src/lib/server/community/posts');
	const B = await import('../src/lib/server/broadcasts');
	const W = await import('../src/lib/server/warnings/store');
	const J = await import('../src/lib/server/warnings/jobs');
	const { placesGrid } = await import('../src/lib/server/places');
	const { ensureProfile } = await import('../src/lib/server/profiles');
	const { deleteAccount } = await import('../src/lib/server/account');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const post = (by: string, extra: Partial<Parameters<typeof P.createPost>[2]> = {}) =>
		P.createPost(sql, by, { kind: 'beitrag', title: 'Nutzer XY nervt im Forum', body: 'Wie gehen wir damit um?', topicKey: null, regionCode: null, groupId: null, placeId: null, labels: [], tags: [], linkUrl: null, poll: null, images: [], ...extra });
	const subPush = async (uid: string) => {
		await sql`insert into push_subscriptions (id, user_id, endpoint, p256dh, auth) values (${'ps-' + uid.slice(0, 8)}, ${uid}, ${'https://push.example.org/' + uid}, 'k', 'a')`;
	};

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		// Testregionen: Kreis Ostholstein mit Gemeinde, Berlin (Land und Kreis), Flensburg mit Fläche (für die Flächenzuordnung)
		await sql`insert into regions (code, name, level, parent_code, source) values
			('01055', 'Kreis Ostholstein', 'kreis', '01', 'Test'), ('010550001001', 'Testgemeinde', 'gemeinde', '01055', 'Test'),
			('11000', 'Berlin', 'kreis', '11', 'Test'), ('13071', 'Mecklenburgische Seenplatte', 'kreis', '13', 'Test')`;
		await sql`insert into regions (code, name, level, parent_code, source, geom, center) values
			('01001', 'Flensburg', 'kreis', '01', 'Test', ST_Multi(ST_GeomFromText('POLYGON((9.3 54.7, 9.6 54.7, 9.6 54.9, 9.3 54.9, 9.3 54.7))', 4326)), ST_SetSRID(ST_MakePoint(9.45, 54.8), 4326))`;
		for (const [n, region] of [['admin', '09'], ['mod', '04'], ['funk', '01055'], ['sh', '010550001001'], ['berlin', '11'], ['bayer', '09'], ['ohne', null]] as const) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
			await sql`update user_profiles set display_name = ${n}, region_code = ${region} where user_id = ${x.id}`;
		}
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values
			(${u.admin}, 'superadmin', 'global', null), (${u.mod}, 'moderator_regional', 'region', '04'), (${u.funk}, 'broadcaster', 'region', '01')`;
	});
	afterAll(async () => {
		await sql.end();
		rmSync(outbox, { recursive: true, force: true });
	});

	it('Migration: Unterkünfte als Ortsart und Quelle, Grundkarte ganz Deutschland', async () => {
		const [k] = await sql`select config->>'bbox' as b from data_sources where key = 'protomaps-karte'`;
		expect(k.b).toBe('5.8,47.2,15.1,55.1');
		const [q] = await sql`select config->>'selector' as s from data_sources where key = 'osm-unterkuenfte'`;
		expect(q.s).toBe('unterkunft');
		await sql`insert into places (kind, name, location, status) values ('unterkunft', 'Jugendherberge Test', ST_SetSRID(ST_MakePoint(10.7, 54.1), 4326), 'aktiv')`;
		const [ov] = await sql`select name from data_sources where key = 'overture-orte'`;
		expect(ov.name).toMatch(/Elterncafés/);
	});

	describe('Moderatoren-Forum', () => {
		let tp = '';
		it('Team (auch regional) darf schreiben, Mitglieder nicht; das übrige Team bekommt eine Mitteilung', async () => {
			expect(await P.isTeam(sql, u.mod)).toBe(true);
			expect(await P.isTeam(sql, u.admin)).toBe(true);
			expect(await P.isTeam(sql, u.bayer)).toBe(false);
			expect(await P.isTeam(sql, u.funk)).toBe(false); // Rundnachrichten allein ist kein Moderationsteam
			await expect(post(u.bayer, { team: true })).rejects.toThrow(/nur für das Team/);
			tp = (await post(u.mod, { team: true, regionCode: '04', landOnly: true })).id;
			const [row] = await sql`select team, land_code, region_code from posts where id = ${tp}`;
			expect(row).toMatchObject({ team: true, land_code: null, region_code: null });
			const [n] = await sql`select text, link from notifications where user_id = ${u.admin} and kind = 'team'`;
			expect(n.link).toBe(`/community/b/${tp}`);
			const none = await sql`select 1 from notifications where user_id = ${u.bayer} and kind = 'team'`;
			expect(none.length).toBe(0);
		});
		it('nur im Bereich „Moderatoren“, nie in anderen Feeds, Suche, per Link oder Antwort für Mitglieder', async () => {
			const ids = async (uid: string, f: Parameters<typeof P.feed>[2]) => (await P.feed(sql, uid, f)).items.map((i) => i.id);
			expect(await ids(u.mod, { mode: 'neu', scope: 'team' })).toContain(tp);
			expect(await ids(u.admin, { mode: 'neu', scope: 'team' })).toContain(tp);
			expect(await ids(u.mod, { mode: 'neu', scope: 'de' })).not.toContain(tp);
			expect(await ids(u.bayer, { mode: 'neu', scope: 'team' })).not.toContain(tp);
			expect(await ids(u.bayer, { mode: 'neu', scope: 'de' })).not.toContain(tp);
			expect(await ids(u.bayer, { mode: 'neu', q: 'nervt' })).not.toContain(tp);
			expect(await P.getPost(sql, u.bayer, tp)).toBeNull();
			expect((await P.getPost(sql, u.mod, tp))?.team).toBe(true);
			await expect(P.addComment(sql, u.bayer, tp, 'Ich lese mit')).rejects.toThrow(/nicht gefunden/);
			await P.addComment(sql, u.admin, tp, 'Erst verwarnen, dann sperren.');
			const [c] = await sql`select comment_count from posts where id = ${tp}`;
			expect(c.comment_count).toBe(1);
		});
	});

	describe('Rundnachrichten', () => {
		it('Rechte: Betreiber überall, Rundnachrichten-Rolle nur in ihrer Region, Mitglieder gar nicht', async () => {
			expect(await B.broadcastRights(sql, u.bayer)).toMatchObject({ any: false, all: false });
			expect(await B.broadcastRights(sql, u.admin)).toMatchObject({ any: true, all: true });
			const f = await B.broadcastRights(sql, u.funk);
			expect(f).toMatchObject({ any: true, all: false });
			expect(f.regions.map((r) => r.code)).toEqual(['01']);
			const base = { title: 'Karte gestört', body: 'Wir kümmern uns.', link: null, push: false };
			await expect(B.sendBroadcast(sql, u.funk, { ...base, all: true, regions: [] })).rejects.toThrow(/an alle fehlt/);
			await expect(B.sendBroadcast(sql, u.funk, { ...base, all: false, regions: ['09'] })).rejects.toThrow(/fehlt dir das Recht/);
			await expect(B.sendBroadcast(sql, u.bayer, { ...base, all: false, regions: ['09'] })).rejects.toThrow(/Recht/);
			await expect(B.sendBroadcast(sql, u.admin, { ...base, all: false, regions: [] })).rejects.toThrow(/Ganz Deutschland/);
			await expect(B.sendBroadcast(sql, u.admin, { ...base, link: 'javascript:alert(1)', all: true, regions: [] })).rejects.toThrow(/Link/);
		});
		it('an eine Region: nur Mitglieder mit Wohnregion darin (mit allem darunter), als Mitteilung', async () => {
			expect(await B.countRecipients(sql, false, ['01'])).toBe(2); // funk (Kreis) + sh (Gemeinde darunter)
			const r = await B.sendBroadcast(sql, u.funk, { title: 'Sturm an der Küste', body: 'Spielplätze am Strand meiden.', link: '/warnungen', all: false, regions: ['01'], push: false });
			expect(r.recipients).toBe(2);
			const got = await sql`select user_id, link from notifications where kind = 'rundnachricht'`;
			expect(got.map((g) => g.user_id).sort()).toEqual([u.funk, u.sh].sort());
			expect(got[0].link).toBe(`/rundnachricht/${r.id}`);
			expect(await B.readBroadcast(sql, u.bayer, r.id)).toBeNull();
			expect((await B.readBroadcast(sql, u.sh, r.id))?.title).toBe('Sturm an der Küste');
			const [list] = await B.listBroadcasts(sql);
			expect(list).toMatchObject({ title: 'Sturm an der Küste', recipients: 2, opened: 1, target: 'Schleswig-Holstein' });
		});
		it('an alle, Push nur an „Wichtiges sofort“ mit Gerät', async () => {
			await subPush(u.bayer);
			await subPush(u.berlin);
			await sql`insert into notification_settings (user_id, push_urgent) values (${u.bayer}, true), (${u.berlin}, false)`;
			const before = pushes();
			const r = await B.sendBroadcast(sql, u.admin, { title: 'Wartung heute Nacht', body: 'Kurz nicht erreichbar.', link: null, all: true, regions: [], push: false });
			expect(r.recipients).toBe(7);
			expect(await B.pushBroadcast(sql, r.id, 'Wartung heute Nacht')).toBe(1);
			expect(pushes() - before).toBe(1);
		});
	});

	describe('Unwetterwarnungen (DWD)', () => {
		it('Abo über Gemeinde bzw. Stadtstaat → Kreis; Bundesland ohne eindeutigen Kreis abgelehnt; höchstens 5', async () => {
			expect((await W.subscribe(sql, u.sh, '010550001001', 2, true, 'Oma'))).toEqual({ code: '01055', name: 'Kreis Ostholstein' });
			expect((await W.subscribe(sql, u.berlin, '11', 3, true, null)).code).toBe('11000');
			await expect(W.subscribe(sql, u.bayer, '09', 2, true, null)).rejects.toThrow(/keinen Kreis/);
			await expect(W.subscribe(sql, u.bayer, '01055', 7, true, null)).rejects.toThrow(/Stufe/);
			await W.subscribe(sql, u.bayer, '01001', 1, false, null);
			expect((await W.subscriptions(sql, u.sh))[0]).toMatchObject({ kreis: '01055', label: 'Oma', minLevel: 2, push: true });
			await subPush(u.sh);
		});

		it('erster Abruf: übernehmen, aber nichts verschicken; danach nur Neues ab Mindeststufe', async () => {
			const { parseCap } = await import('../src/lib/server/warnings/cap');
			const A = (o: Parameters<typeof cap>[0]) => parseCap(cap(o))!;
			const w0 = A({ id: 'W0', severity: 'Severe', cells: ['101055000'] });
			const r1 = await W.ingest(sql, [w0], { notifyNew: false });
			expect(r1).toMatchObject({ neu: 1, aktiv: 1, mitteilungen: 0 });
			// Neu: markant für Ostholstein (sh ab 2 → ja), gering für Berlin (berlin ab 3 → nein), Fläche über Flensburg
			const w1 = A({ id: 'W1', severity: 'Moderate', cells: ['101055000'], headline: 'Amtliche WARNUNG vor STURMBÖEN' });
			const w4 = A({ id: 'W4', severity: 'Minor', cells: ['111000000'], headline: 'Amtliche WARNUNG vor FROST' });
			const wf = A({ id: 'WF', severity: 'Minor', cells: ['801001001'], polygon: '54.75,9.35 54.75,9.55 54.85,9.55 54.85,9.35 54.75,9.35' });
			const pBefore = pushes();
			const r2 = await W.ingest(sql, [w0, w1, w4, wf], { notifyNew: true });
			expect(r2).toMatchObject({ neu: 3, aktiv: 4, beendet: 0 });
			const n = await sql`select user_id, text, link from notifications where kind = 'warnung' order by id`;
			expect(n.map((x) => x.user_id)).toEqual([u.sh, u.bayer]);
			expect(n[0].text).toBe('Markante Wetterwarnung für Oma: Amtliche WARNUNG vor STURMBÖEN');
			expect(n[0].link).toBe('/warnungen/W1');
			expect(pushes() - pBefore).toBe(1); // sh mit Push; bayer ohne Push
			const [area] = await sql`select kreis_code from warning_areas where warning_id = 'WF'`;
			expect(area.kreis_code).toBe('01001');
			// Warnzelle zeigt auf Flensburg, das Warngebiet liegt aber in Bayern → Flensburg wird nicht übernommen
			const wrong = A({ id: 'WX', severity: 'Minor', cells: ['101001000'], polygon: '48.1,11.5 48.1,11.6 48.2,11.6 48.2,11.5 48.1,11.5' });
			expect(await W.kreiseOf(sql, wrong)).toEqual([]);
			expect(await W.kreiseOf(sql, A({ id: 'WY', cells: ['101001000'], polygon: '54.8,9.4 54.8,9.5 54.85,9.5 54.8,9.4' }))).toEqual(['01001']);
		});

		it('Aktualisierung gleicher Stufe still, höhere Stufe meldet; Verschwundenes ist beendet', async () => {
			const { parseCap } = await import('../src/lib/server/warnings/cap');
			const A = (o: Parameters<typeof cap>[0]) => parseCap(cap(o))!;
			const before = (await sql`select count(*)::int as n from notifications where kind = 'warnung' and user_id = ${u.sh}`)[0].n;
			await W.ingest(sql, [A({ id: 'W2', severity: 'Moderate', cells: ['101055000'], refs: ['W1'] })], { notifyNew: true });
			const mid = (await sql`select count(*)::int as n from notifications where kind = 'warnung' and user_id = ${u.sh}`)[0].n;
			expect(mid).toBe(before);
			await W.ingest(sql, [A({ id: 'W3', severity: 'Extreme', cells: ['101055000'], refs: ['W2'], headline: 'Amtliche WARNUNG vor EXTREMEN ORKANBÖEN' })], { notifyNew: true });
			const [last] = await sql`select text from notifications where kind = 'warnung' and user_id = ${u.sh} order by id desc limit 1`;
			expect(last.text).toBe('Extremes Unwetter für Oma: Amtliche WARNUNG vor EXTREMEN ORKANBÖEN');
			const ended = await sql`select id from warnings where ended_at is not null order by id`;
			expect(ended.map((e) => e.id)).toEqual(['W0', 'W1', 'W2', 'W4', 'WF']);
			const act = await W.activeFor(sql, '01055');
			expect(act.map((a) => [a.id, a.level, a.levelLabel])).toEqual([['W3', 4, 'Extremes Unwetter']]);
			const ov = await W.overview(sql);
			expect(ov.byLevel[4]).toEqual({ n: 1, kreise: 1 });
			const one = await W.getWarning(sql, 'W3');
			expect(one?.kreise).toEqual([{ code: '01055', name: 'Kreis Ostholstein' }]);
		});

		it('Zeitplan: Verzeichnis lesen, neueste Datei laden, gleiche Datei nicht noch einmal', async () => {
			const file = 'Z_CAP_C_EDZW_20261024100000_PVW_STATUS_PREMIUMDWD_DISTRICT_DE.zip';
			const zip = makeZip([{ name: 'a.xml', text: cap({ id: 'J1', severity: 'Severe', cells: ['111000000'] }) }]);
			let downloads = 0;
			const fake = (async (u: string | URL) => {
				const s = String(u);
				if (s.endsWith('/')) return new Response(`<a href="${file}">${file}</a>`);
				downloads++;
				return new Response(new Uint8Array(zip));
			}) as typeof fetch;
			const before = (await sql`select count(*)::int as n from notifications where kind = 'warnung' and user_id = ${u.berlin}`)[0].n;
			const r = await J.tickWarnings(sql, fake);
			expect(r).toMatchObject({ neu: 1, aktiv: 1 });
			expect(await J.tickWarnings(sql, fake)).toBe('unverändert');
			expect(downloads).toBe(1);
			const st = await J.warnState(sql);
			expect(st).toMatchObject({ file, last_error: null });
			// Kein erster Lauf mehr in diesem Zustand? Der erste Zeitplan-Lauf verschickt nichts (seeded war noch false)
			const after = (await sql`select count(*)::int as n from notifications where kind = 'warnung' and user_id = ${u.berlin}`)[0].n;
			expect(after).toBe(before);
			expect(st.seeded).toBe(true);
		});

		it('Kontolöschung entfernt Warn-Abos und Rundnachrichten-Empfang', async () => {
			await deleteAccount(sql, u.sh);
			const a = await sql`select 1 from warning_subscriptions where user_id = ${u.sh}`;
			const b = await sql`select 1 from broadcast_recipients where user_id = ${u.sh}`;
			expect(a.length + b.length).toBe(0);
		});
	});

	it('Deutschland-Übersicht: Zählung je Rasterfeld, mit Filter', async () => {
		await sql`insert into places (kind, name, location, status) values
			('spielplatz', 'A', ST_SetSRID(ST_MakePoint(8.80, 53.08), 4326), 'aktiv'),
			('spielplatz', 'B', ST_SetSRID(ST_MakePoint(8.81, 53.09), 4326), 'aktiv'),
			('indoorspielplatz', 'C', ST_SetSRID(ST_MakePoint(11.57, 48.14), 4326), 'aktiv'),
			('spielplatz', 'weg', ST_SetSRID(ST_MakePoint(11.5, 48.1), 4326), 'zusammengefuehrt')`;
		const all = await placesGrid(sql, [], [], 0.6);
		expect(all.total).toBe(4); // A, B, C + Jugendherberge aus der Migrationsprüfung
		expect(all.cells.length).toBe(3);
		const indoor = await placesGrid(sql, ['drinnen'], [], 0.3);
		expect(indoor).toEqual({ cells: [[11.57, 48.14, 1]], total: 1 });
		const stay = await placesGrid(sql, ['unterkunft'], [], 0.3);
		expect(stay.total).toBe(1);
	});
});
