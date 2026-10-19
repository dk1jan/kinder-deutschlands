// Abschnitt 7 gegen echte Datenbank: zweite Freigabe, Kinderwagenrouten, Statistik, Partnerlinks. Testdaten künstlich.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Ausbau (Datenbank)', async () => {
	const A = await import('../src/lib/server/approvals');
	const R = await import('../src/lib/server/routes');
	const S = await import('../src/lib/server/stats');
	const F = await import('../src/lib/server/affiliate');
	const { assignRole, userCan } = await import('../src/lib/server/roles');
	const { PostError } = await import('../src/lib/server/community/posts');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	// Weg in Bremen-Findorff (künstlich, ca. 600 m)
	const path: [number, number][] = [[8.7905, 53.0935], [8.7930, 53.0950], [8.7960, 53.0965], [8.7985, 53.0975]];
	const input = (extra: Partial<Parameters<typeof R.createRoute>[2]> = {}): Parameters<typeof R.createRoute>[2] => ({
		title: 'Runde am Torfkanal', description: 'Breite Wege, eine Brücke mit Rampe.', coords: path, surface: 'asphalt', incline: 'eben', stairs: false, narrow: false, shade: true, restSpots: 'Bänke am Kanal', durationMin: 20, publicEnds: true, ...extra
	});

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		for (const n of ['op1', 'op2', 'mod', 'red', 'anna', 'ben']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at, last_login_at) values (${n + '@example.org'}, 'x', now(), now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
		}
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.op1}, 'superadmin', 'global', null)`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.red}, 'data_editor', 'global', null)`;
		await sql`insert into regions (code, name, level, parent_code, source, geom) values ('04011:st:1', 'Findorff', 'stadtteil', '04011', 'Test',
			ST_Multi(ST_MakeEnvelope(8.77, 53.08, 8.81, 53.11, 4326))) on conflict (code) do nothing`;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Zweite Freigabe: allein sofort (mit Vermerk), zu zweit erst nach Zustimmung einer anderen Person', async () => {
		// Nur ein Betreiber: Vergabe wirkt sofort
		expect(await A.request(sql, u.op1, 'role.assign', { userId: u.op2, roleKey: 'superadmin', scopeType: 'global', scopeId: null, expiresAt: null, note: 'Vertretung' }, 'Betreiber op2', 'Vertretung im Urlaub')).toBe('ausgefuehrt');
		expect(await userCan(sql, u.op2, 'roles.assign')).toBe(true);
		const [single] = await sql`select meta from audit_log where action = 'approval.single'`;
		expect(single.meta.hinweis).toContain('ohne zweite Freigabe');
		// Jetzt zwei Betreiber: Antrag nötig
		await expect(A.request(sql, u.op1, 'role.assign', { userId: u.anna, roleKey: 'tech_admin', scopeType: 'global', scopeId: null, expiresAt: null, note: null }, 'Technik für Anna', 'kurz')).rejects.toBeInstanceOf(A.ApprovalError);
		expect(await A.request(sql, u.op1, 'role.assign', { userId: u.anna, roleKey: 'tech_admin', scopeType: 'global', scopeId: null, expiresAt: null, note: null }, 'Technik für Anna', 'Übernimmt Backups')).toBe('beantragt');
		expect(await userCan(sql, u.anna, 'system.manage')).toBe(false);
		const [ap] = await sql`select id from approvals where status = 'offen'`;
		expect(await A.openCount(sql, u.op2)).toBe(1);
		expect(await A.openCount(sql, u.op1)).toBe(0); // eigener Antrag zählt nicht
		await expect(A.decide(sql, u.op1, ap.id, true, '')).rejects.toBeInstanceOf(A.ApprovalError); // nicht selbst
		await expect(A.decide(sql, u.mod, ap.id, true, '')).rejects.toBeInstanceOf(A.ApprovalError); // kein Recht
		expect(await A.decide(sql, u.op2, ap.id, true, 'ok')).toBe('ausgefuehrt');
		expect(await userCan(sql, u.anna, 'system.manage')).toBe(true);
		await expect(A.decide(sql, u.op2, ap.id, true, '')).rejects.toBeInstanceOf(A.ApprovalError); // nur einmal
		// Doppelter Antrag, Ablehnen, Ablauf
		const p = { userId: u.ben, caseId: null };
		expect(await A.request(sql, u.op1, 'user.suspend', p, 'Ben sperren', 'Wiederholt Spam')).toBe('beantragt');
		await expect(A.request(sql, u.op1, 'user.suspend', p, 'Ben sperren', 'Wiederholt Spam')).rejects.toBeInstanceOf(A.ApprovalError);
		const [sp] = await sql`select id from approvals where action = 'user.suspend'`;
		expect(await A.decide(sql, u.op2, sp.id, false, 'Erst verwarnen')).toBe('abgelehnt');
		const [ben] = await sql`select status from users where id = ${u.ben}`;
		expect(ben.status).toBe('active');
		await A.request(sql, u.op1, 'user.suspend', p, 'Ben sperren', 'Nach Verwarnung weiter Spam');
		const [sp2] = await sql`select id from approvals where action = 'user.suspend' and status = 'offen'`;
		await sql`update approvals set expires_at = now() - interval '1 minute' where id = ${sp2.id}`;
		await expect(A.decide(sql, u.op2, sp2.id, true, '')).rejects.toBeInstanceOf(A.ApprovalError);
		const list = await A.listApprovals(sql, u.op2);
		expect(list.map((x) => x.status).sort()).toEqual(['abgelaufen', 'abgelehnt', 'ausgefuehrt']);
		expect(await A.listApprovals(sql, u.mod)).toEqual([]);
	});

	it('Gesperrt nach Freigabe: Sitzungen enden', async () => {
		await sql`insert into sessions (id_hash, user_id, mfa_verified, expires_at) values ('x', ${u.ben}, true, now() + interval '1 day')`;
		await A.request(sql, u.op1, 'user.suspend', { userId: u.ben, caseId: null }, 'Ben sperren', 'Dritter Versuch, jetzt sperren');
		const [sp] = await sql`select id from approvals where action = 'user.suspend' and status = 'offen'`;
		await A.decide(sql, u.op2, sp.id, true, '');
		const [ben] = await sql`select status from users where id = ${u.ben}`;
		expect(ben.status).toBe('suspended');
		expect((await sql`select 1 from sessions where user_id = ${u.ben}`).length).toBe(0);
	});

	it('Route: Prüfung, Länge, Rundweg-Erkennung, Orte am Weg, Erfahrungen', async () => {
		await expect(R.createRoute(sql, u.anna, input({ publicEnds: false }))).rejects.toBeInstanceOf(PostError);
		await expect(R.createRoute(sql, u.anna, input({ coords: [path[0]] }))).rejects.toBeInstanceOf(PostError);
		await expect(R.createRoute(sql, u.anna, input({ coords: [[8.79, 53.09], [9.9, 53.5]] }))).rejects.toBeInstanceOf(PostError); // Sprung > 3 km
		await expect(R.createRoute(sql, u.anna, input({ description: 'Start bei mir, Tel. 0151 23456789' }))).rejects.toBeInstanceOf(PostError);
		const r = await R.createRoute(sql, u.anna, input());
		expect(r.held).toBe(true);
		expect(await R.getRoute(sql, u.ben, r.id)).toBeNull(); // vor Prüfung nicht sichtbar
		expect(await R.getRoute(sql, null, r.id)).toBeNull();
		const own = await R.getRoute(sql, u.anna, r.id);
		expect(own?.distanceM).toBeGreaterThan(500);
		expect(own?.distanceM).toBeLessThan(800);
		expect(own?.distanceM).toBe(R.lengthM(path));
		await expect(R.reviewRoute(sql, u.anna, r.id, true, '')).rejects.toBeInstanceOf(PostError);
		await R.reviewRoute(sql, u.red, r.id, true, '');
		const [n] = await sql`select text from notifications where user_id = ${u.anna} and kind = 'route'`;
		expect(n.text).toContain('sichtbar');
		await sql`insert into places (kind, name, location, status, region_code) values ('spielplatz', 'Spielplatz am Kanal', ST_SetSRID(ST_MakePoint(8.7931, 53.0951), 4326), 'aktiv', '04011:st:1'),
			('toilette', 'Weit weg', ST_SetSRID(ST_MakePoint(8.75, 53.07), 4326), 'aktiv', null)`;
		const pub = await R.getRoute(sql, null, r.id);
		expect(pub?.places.map((p) => p.name)).toEqual(['Spielplatz am Kanal']);
		const list = await R.listRoutes(sql, { region: '04011:st:1' });
		expect(list.map((x) => x.id)).toEqual([r.id]);
		expect((await R.listRoutes(sql, { near: { lat: 53.094, lon: 8.792, km: 1 } })).length).toBe(1);
		expect((await R.listRoutes(sql, { maxKm: 0.3 })).length).toBe(0);
		expect((await R.listRoutes(sql, { noStairs: true, flat: true })).length).toBe(1);
		const loop = await R.createRoute(sql, u.red, input({ title: 'Kleine Runde', coords: [...path, [path[0][0] + 0.0002, path[0][1]]] }), { asRedaktion: true });
		expect(loop.held).toBe(false);
		expect((await R.getRoute(sql, null, loop.id))?.loop).toBe(true);
		await R.reportRoute(sql, u.ben, r.id, 'passt', null).catch(() => {}); // Ben ist gesperrt – egal, nur Daten
		await R.reportRoute(sql, u.op2, r.id, 'hindernis', 'Baustelle an der Brücke');
		const w = await R.getRoute(sql, null, r.id);
		expect(w?.reports.map((x) => x.kind)).toContain('hindernis');
		const [c] = await sql`select target_type from mod_cases where target_id = ${r.id}`;
		expect(c.target_type).toBe('route');
		await R.endReports(sql, u.red, r.id);
		expect((await R.getRoute(sql, null, r.id))?.reports.filter((x) => x.kind === 'hindernis').length).toBe(0);
		const gpx = R.toGpx('Runde & mehr', path, 'https://kinder.example.org/routen/x');
		expect(gpx).toContain('<trkpt lat="53.0935" lon="8.7905">');
		expect(gpx).toContain('Runde &amp; mehr');
	});

	it('Statistik: Zählungen, Regionsfilter verbirgt kleine Zahlen, nichts Erfundenes', async () => {
		const g = await S.statistics(sql, 30, null);
		const all = Object.fromEntries(g.flatMap((x) => x.metrics).map((m) => [m.key, m]));
		expect(all.reg.now).toBe(6);
		expect(all.calls.now).toBeNull();
		expect(all.calls.note).toContain('nicht erfasst');
		expect(all.views.note).toContain('nicht erfasst');
		const r = await S.statistics(sql, 30, '04011:st:1');
		const rm = Object.fromEntries(r.flatMap((x) => x.metrics).map((m) => [m.key, m]));
		expect(rm.places.now).toBe(-2); // 1 Ort → „< 5“
		expect(rm.deleted.now).toBeNull();
	});

	it('Partnerlinks: aus bis zur bestätigten Prüfung, nie in geschützten Gruppen', async () => {
		expect((await F.getAffiliate(sql)).enabled).toBe(false);
		expect(await F.tagFor(sql, { protectedGroup: false })).toBeNull();
		await expect(F.saveAffiliate(sql, u.op1, { enabled: true, tag: 'kd-21', termsChecked: false, note: null })).rejects.toBeInstanceOf(F.AffiliateError);
		await expect(F.saveAffiliate(sql, u.op1, { enabled: true, tag: 'k d', termsChecked: true, note: null })).rejects.toBeInstanceOf(F.AffiliateError);
		await F.saveAffiliate(sql, u.op1, { enabled: true, tag: 'kd-21', termsChecked: true, note: 'Test' });
		expect(await F.tagFor(sql, { protectedGroup: false })).toBe('kd-21');
		expect(await F.tagFor(sql, { protectedGroup: true })).toBeNull();
		const v = await F.getAffiliate(sql);
		expect(v.terms_checked_by).toBe('op1@example.org');
	});

	it('Rechtevergabe ohne kritische Rolle bleibt direkt', async () => {
		await assignRole(sql, { actorId: u.op1, userId: u.mod, roleKey: 'moderator_global', scopeType: 'global', scopeId: null, expiresAt: null, note: null, ipHash: null });
		expect(await userCan(sql, u.mod, 'content.moderate')).toBe(true);
	});
});
