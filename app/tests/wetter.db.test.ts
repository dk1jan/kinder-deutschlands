// F-056: Wetter bei Veranstaltungen – Warnung zur Terminzeit, Entscheidung des Veranstalters, Mitteilung (einmalig),
// Warnung am Kartenpunkt, Filter „Bäder“. Alle Daten künstlich.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Wetter bei Veranstaltungen (F-056)', async () => {
	const E = await import('../src/lib/server/angebote/events');
	const Wx = await import('../src/lib/server/angebote/wetter');
	const W = await import('../src/lib/server/warnings/store');
	const P = await import('../src/lib/server/places');
	const { berlinParts } = await import('../src/lib/server/angebote/recurrence');
	const { PostError } = await import('../src/lib/server/community/posts');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const key = (t: Date) => `${berlinParts(t).y}-${String(berlinParts(t).m).padStart(2, '0')}-${String(berlinParts(t).d).padStart(2, '0')}`;
	const start = new Date(Date.now() + 20 * 3600_000);
	const input = (extra: Partial<Parameters<typeof E.createEvent>[2]> = {}): Parameters<typeof E.createEvent>[2] => ({
		title: 'Kinderfest am See', description: 'Spiele und Kuchen.', kind: 'fest', topics: ['freizeit'],
		startsAt: start, endsAt: new Date(start.getTime() + 3 * 3600_000), allDay: false, repeat: 'nie', repeatUntil: null,
		placeId: null, lat: null, lon: null, address: 'Seeufer 1', regionCode: 'Z9001:g:1', ageMin: 0, ageMax: 10,
		costFree: true, costText: null, discounts: null, freikarte: false, accessibility: [], setting: 'draussen', capacity: null,
		registrationUrl: null, registrationDeadline: null, waitlist: false, visibility: 'mitglieder', ...extra
	});
	let ev = '';
	let day = '';
	const notes = async (uid: string, like = '%') => (await sql`select text, link from notifications where user_id = ${uid} and kind = 'termin' and text like ${like} order by created_at`) as unknown as { text: string; link: string }[];
	const warn = (id: string, level: number, o: { kreis?: string; onsetH?: number; expiresH?: number } = {}) =>
		sql`with w as (insert into warnings (id, provider, msg_type, severity, level, headline, sent, onset, expires)
				values (${id}, 'dwd', 'Alert', 'Severe', ${level}, ${'GEWITTER ' + id}, now(), now() + make_interval(hours => ${o.onsetH ?? 0}), now() + make_interval(hours => ${o.expiresH ?? 30})) returning id)
			insert into warning_areas (warning_id, kreis_code) select id, ${o.kreis ?? 'Z9001'} from w`;

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		for (const n of ['anna', 'ben', 'cem', 'fremd']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
		}
		await sql`insert into regions (code, name, level, parent_code, source) values ('Z9', 'Testland', 'land', null, 'Test'),
			('Z9001', 'Testkreis Eins', 'kreis', 'Z9', 'Test'), ('Z9001:g:1', 'Weyhe', 'gemeinde', 'Z9001', 'Test'),
			('Z9002', 'Testkreis Zwei', 'kreis', 'Z9', 'Test'), ('Z9002:g:1', 'Bramsche', 'gemeinde', 'Z9002', 'Test')`;
		const c = await E.createEvent(sql, u.anna, input());
		ev = c.id;
		await sql`update events set status = 'aktiv' where id = ${ev}`;
		day = key(start);
		await E.setAttendance(sql, u.ben, ev, day, 'komme_mit', false);
	});
	afterAll(async () => {
		await sql.end();
	});

	it('ohne Warnung: kein Hinweis, keine Mitteilung', async () => {
		expect(await Wx.kreisOfEvent(sql, ev)).toBe('Z9001');
		expect((await Wx.terminWetter(sql, ev, day, start, new Date(start.getTime() + 3 * 3600_000), false)).warnings).toEqual([]);
		expect(await Wx.tickEventWeather(sql)).toBe(0);
	});

	it('Stufe 1, Warnung im anderen Kreis und beendete Warnung zählen nicht', async () => {
		await warn('dwd.l1', 1);
		await warn('dwd.andererkreis', 3, { kreis: 'Z9002' });
		await warn('dwd.vorbei', 3);
		await sql`update warnings set ended_at = now() where id = 'dwd.vorbei'`;
		await warn('dwd.zufrueh', 3, { onsetH: 60, expiresH: 70 }); // beginnt erst lange nach dem Termin
		await warn('dwd.zuspaet', 3, { onsetH: -10, expiresH: 5 }); // endet vor dem Termin
		expect((await Wx.terminWetter(sql, ev, day, start, new Date(start.getTime() + 3 * 3600_000), false)).warnings).toEqual([]);
		expect(await Wx.tickEventWeather(sql)).toBe(0);
	});

	it('Warnung ab Stufe 2 zur Terminzeit: Hinweis am Termin, einmal Mitteilung an Mitkommende und Veranstalter', async () => {
		await warn('dwd.gewitter', 3);
		const t = await Wx.terminWetter(sql, ev, day, start, new Date(start.getTime() + 3 * 3600_000), false);
		expect(t.warnings.map((w) => [w.id, w.level, w.label])).toEqual([['dwd.gewitter', 3, 'Unwetterwarnung']]);
		expect(await Wx.tickEventWeather(sql)).toBe(2);
		const ben = await notes(u.ben);
		expect(ben).toHaveLength(1);
		expect(ben[0].text).toContain('Kinderfest am See');
		expect(ben[0].text).toContain('GEWITTER dwd.gewitter');
		expect(ben[0].link).toBe(`/veranstaltungen/${ev}?am=${day}`);
		expect((await notes(u.anna))[0].text).toContain('Du kannst auf der Terminseite festhalten');
		expect(await notes(u.cem)).toHaveLength(0); // kommt nicht mit
		expect(await Wx.tickEventWeather(sql)).toBe(0); // nicht noch einmal
		expect(await notes(u.ben)).toHaveLength(1);
	});

	it('Entscheidung des Veranstalters: nur mit Recht, benachrichtigt Mitkommende, lässt sich zurücknehmen', async () => {
		await expect(Wx.setWeatherStatus(sql, u.fremd, ev, day, 'drinnen', '')).rejects.toBeInstanceOf(PostError);
		await expect(Wx.setWeatherStatus(sql, u.ben, ev, day, 'drinnen', '')).rejects.toBeInstanceOf(PostError); // Mitkommende dürfen nicht
		await expect(Wx.setWeatherStatus(sql, u.anna, ev, 'kaputt', 'drinnen', '')).rejects.toBeInstanceOf(PostError);
		await expect(Wx.setWeatherStatus(sql, u.anna, ev, '2030-01-01', 'drinnen', '')).rejects.toBeInstanceOf(PostError); // kein Termin an dem Tag
		await Wx.setWeatherStatus(sql, u.anna, ev, day, 'drinnen', 'Treffpunkt Halle 2');
		expect(await Wx.statusOf(sql, ev, day)).toEqual({ status: 'drinnen', label: 'Nach drinnen verlegt', note: 'Treffpunkt Halle 2' });
		const n = await notes(u.ben, '%drinnen%');
		expect(n).toHaveLength(1);
		expect(n[0].text).toContain('Treffpunkt Halle 2');
		expect(await notes(u.anna, '%drinnen%')).toHaveLength(0); // nicht an sich selbst
		await Wx.setWeatherStatus(sql, u.anna, ev, day, 'findet_statt', '');
		expect((await Wx.statusOf(sql, ev, day))?.status).toBe('findet_statt');
		await Wx.setWeatherStatus(sql, u.anna, ev, day, null, '');
		expect(await Wx.statusOf(sql, ev, day)).toBeNull();
		const [a] = await sql`select count(*)::int as n from audit_log where action like 'event.weather.%'`;
		expect(a.n).toBe(3);
	});

	it('hat der Veranstalter entschieden, bleibt es still; abgesagte Termine werden nicht gemeldet', async () => {
		const s2 = new Date(Date.now() + 22 * 3600_000);
		const e2 = (await E.createEvent(sql, u.anna, input({ title: 'Laternenumzug', startsAt: s2, endsAt: new Date(s2.getTime() + 3600_000) }))).id;
		await sql`update events set status = 'aktiv' where id = ${e2}`;
		await E.setAttendance(sql, u.cem, e2, key(s2), 'interessiert', false);
		await Wx.setWeatherStatus(sql, u.anna, e2, key(s2), 'drinnen', '');
		expect(await Wx.tickEventWeather(sql)).toBe(0);
		expect(await notes(u.cem, '%Laternenumzug%drinnen%')).toHaveLength(1); // nur die Entscheidung, keine Warnmeldung

		const s3 = new Date(Date.now() + 23 * 3600_000);
		const e3 = (await E.createEvent(sql, u.anna, input({ title: 'Flohmarkt', startsAt: s3, endsAt: new Date(s3.getTime() + 3600_000) }))).id;
		await sql`update events set status = 'aktiv' where id = ${e3}`;
		await E.setAttendance(sql, u.cem, e3, key(s3), 'komme_mit', false);
		await E.cancelEvent(sql, u.anna, e3, null, 'abgesagt');
		await expect(Wx.setWeatherStatus(sql, u.anna, e3, key(s3), 'drinnen', '')).rejects.toBeInstanceOf(PostError);
		expect(await Wx.tickEventWeather(sql)).toBe(0);
	});

	it('Termin in einem Kreis ohne Warnung bleibt still', async () => {
		const s4 = new Date(Date.now() + 21 * 3600_000);
		const e4 = (await E.createEvent(sql, u.anna, input({ title: 'Kasperletheater', regionCode: 'Z9002:g:1', startsAt: s4, endsAt: new Date(s4.getTime() + 3600_000) }))).id;
		await sql`update events set status = 'aktiv' where id = ${e4}`;
		await E.setAttendance(sql, u.ben, e4, key(s4), 'komme_mit', false);
		// im Kreis Osnabrück gilt nur „dwd.andererkreis“ ab Stufe 3 → trifft genau diesen Termin
		const before = (await notes(u.ben)).length;
		expect(await Wx.tickEventWeather(sql)).toBe(2);
		expect((await notes(u.ben)).length).toBe(before + 1);
		await sql`update warnings set ended_at = now() where id = 'dwd.andererkreis'`;
		await sql`delete from event_weather_alerts where event_id = ${e4}`;
		expect(await Wx.tickEventWeather(sql)).toBe(0);
	});

	it('Warnung am Kartenpunkt: nur Stufe 2+, aktiv, Punkt in der Fläche', async () => {
		const poly = (x: number, y: number) => `ST_Multi(ST_GeomFromText('POLYGON((${x} ${y}, ${x + 0.2} ${y}, ${x + 0.2} ${y + 0.2}, ${x} ${y + 0.2}, ${x} ${y}))', 4326))`;
		await sql.unsafe(`insert into warnings (id, provider, msg_type, severity, level, headline, sent, geom) values
			('dwd.f1', 'dwd', 'Alert', 'Minor', 1, 'FROST', now(), ${poly(8.8, 52.9)}),
			('dwd.f2', 'dwd', 'Alert', 'Moderate', 2, 'STURMBÖEN', now(), ${poly(8.8, 52.9)}),
			('dwd.f3', 'dwd', 'Alert', 'Severe', 3, 'ORKAN', now(), ${poly(8.8, 52.9)})`);
		const hit = await W.warningsAt(sql, 8.9, 53.0);
		expect(hit.map((h) => [h.id, h.level, h.label])).toEqual([['dwd.f3', 3, 'Unwetterwarnung'], ['dwd.f2', 2, 'Markante Wetterwarnung']]);
		expect(await W.warningsAt(sql, 10.5, 53.0)).toEqual([]);
		await sql`update warnings set ended_at = now() where id in ('dwd.f2', 'dwd.f3')`;
		expect(await W.warningsAt(sql, 8.9, 53.0)).toEqual([]);
	});

	it('Kartenfilter „baeder“ (unsichtbar) liefert Schwimmbäder, „Lieber drinnen“ umfasst Indoor, Bibliothek, Bad, Familienzentrum', async () => {
		const { DRINNEN_KEYS } = await import('../src/lib/places');
		expect(P.resolveFilters(['baeder']).kinds).toEqual(['schwimmbad']);
		expect(P.resolveFilters([...DRINNEN_KEYS]).kinds.sort()).toEqual(['bibliothek', 'familienzentrum', 'indoorspielplatz', 'schwimmbad']);
		expect(P.resolveFilters(['unbekannt']).kinds).toEqual([]);
	});
});
