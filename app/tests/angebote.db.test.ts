// Veranstaltungen, Einrichtungen, Angebote, Hinweise, Merkliste, Radar und ICS-Import gegen echte Datenbank.
// Alle Testdaten sind künstlich.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createServer, type Server } from 'node:http';
import { execFileSync } from 'node:child_process';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
process.env.APP_URL ||= 'https://kinder.example.org';
process.env.IMPORT_ALLOW_LOCAL = '1';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Angebote (Datenbank)', async () => {
	const E = await import('../src/lib/server/angebote/events');
	const O = await import('../src/lib/server/angebote/orgs');
	const F = await import('../src/lib/server/angebote/offers');
	const N = await import('../src/lib/server/angebote/notices');
	const S = await import('../src/lib/server/angebote/saved');
	const R = await import('../src/lib/server/angebote/radar');
	const I = await import('../src/lib/server/angebote/icsimport');
	const { berlinToUtc, berlinParts } = await import('../src/lib/server/angebote/recurrence');
	const { PostError } = await import('../src/lib/server/community/posts');
	const { deleteAccount, exportAccount } = await import('../src/lib/server/account');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const cid: Record<string, string> = {};
	let org = '';
	let orgSlug = '';
	let ics = '';
	let server: Server;
	let port = 0;
	const B = (y: number, m: number, d: number, h = 10) => berlinToUtc({ y, m, d, h, mi: 0 });
	// Ein Samstag in naher Zukunft (ab nächster Woche), 10 Uhr Ortszeit
	const sat = (() => {
		const c = berlinParts(new Date(Date.now() + 7 * 86_400_000));
		const base = new Date(Date.UTC(c.y, c.m - 1, c.d));
		const add = (6 - base.getUTCDay() + 7) % 7;
		const t = new Date(base.getTime() + add * 86_400_000);
		return B(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
	})();
	const key = (t: Date) => berlinParts(t).y + '-' + String(berlinParts(t).m).padStart(2, '0') + '-' + String(berlinParts(t).d).padStart(2, '0');
	const input = (extra: Partial<Parameters<typeof E.createEvent>[2]> = {}): Parameters<typeof E.createEvent>[2] => ({
		title: 'Kinderflohmarkt im Bürgerhaus',
		description: 'Kleidung, Spielzeug, Bücher.',
		kind: 'flohmarkt',
		topics: ['freizeit'],
		startsAt: sat,
		endsAt: new Date(sat.getTime() + 3 * 3600_000),
		allDay: false,
		repeat: 'nie',
		repeatUntil: null,
		placeId: null,
		lat: null,
		lon: null,
		address: 'Bürgerhaus Findorff',
		regionCode: '04011:st:1',
		ageMin: 0,
		ageMax: 10,
		costFree: true,
		costText: null,
		discounts: null,
		freikarte: true,
		accessibility: ['kinderwagen'],
		setting: 'drinnen',
		capacity: null,
		registrationUrl: null,
		registrationDeadline: null,
		waitlist: false,
		visibility: 'oeffentlich',
		...extra
	});
	const range = { from: new Date(), to: new Date(Date.now() + 60 * 86_400_000) };

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		for (const n of ['anna', 'ben', 'cem', 'leitung', 'kollegin', 'mod', 'red']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
			const [p] = await sql`update user_profiles set display_name = ${n} where user_id = ${x.id} returning contact_id`;
			cid[n] = p.contact_id;
		}
		await sql`insert into regions (code, name, level, parent_code, source) values ('04', 'Bremen', 'land', null, 'Test'), ('04011', 'Bremen, Stadt', 'gemeinde', '04', 'Test'),
			('04011:st:1', 'Findorff', 'stadtteil', '04011', 'Test'), ('04011:st:2', 'Neustadt', 'stadtteil', '04011', 'Test') on conflict (code) do nothing`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.mod}, 'moderator_global', 'global', null)`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.red}, 'data_editor', 'global', null)`;
		server = createServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/calendar' });
			res.end(ics);
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
		port = (server.address() as { port: number }).port;
	});
	afterAll(async () => {
		server?.close();
		await sql.end();
	});

	it('Einrichtung: Antrag, Prüfung, Team, Folgen (nur grobe Zahl)', async () => {
		const i = { name: 'Familienzentrum Findorff', kind: 'familienzentrum', description: 'Offener Treff, Kurse, Beratung.', topics: ['betreuung'], regionCode: '04011:st:1', address: 'Musterweg 1', lat: null, lon: null, website: 'https://fz.example.org', email: null, phone: null };
		await expect(O.applyOrg(sql, u.leitung, i, { role: 'Leitung', proof: 'kurz' })).rejects.toBeInstanceOf(PostError);
		const o = await O.applyOrg(sql, u.leitung, i, { role: 'Leitung', proof: 'Rückruf unter der Nummer auf der Webseite' });
		org = o.id;
		orgSlug = o.slug;
		expect((await O.listOrgs(sql, {})).length).toBe(0); // noch nicht öffentlich
		expect(await O.getOrg(sql, o.slug, u.anna)).toBeNull();
		await expect(O.decideOrg(sql, u.anna, org, true, 'ok')).rejects.toBeInstanceOf(PostError); // kein Recht
		await O.decideOrg(sql, u.mod, org, true, 'Rückruf bestätigt');
		const [row] = await sql`select status, application from organizations where id = ${org}`;
		expect(row.status).toBe('verifiziert');
		expect(row.application.proof).toBeUndefined(); // Prüfangaben gelöscht
		expect(await O.orgRole(sql, u.leitung, org)).toBe('admin');
		await O.addMember(sql, u.leitung, org, cid.kollegin, 'redaktion');
		expect(await O.orgRole(sql, u.kollegin, org)).toBe('redaktion');
		await expect(O.addMember(sql, u.kollegin, org, cid.anna, 'admin')).rejects.toBeInstanceOf(PostError); // Redaktion darf kein Team ändern
		await expect(O.removeMember(sql, u.leitung, org, u.leitung)).rejects.toBeInstanceOf(PostError); // letzte Verwaltung
		expect(await O.toggleFollow(sql, u.anna, org)).toBe(true);
		const g = await O.getOrg(sql, orgSlug, u.anna);
		expect(g?.followersText).toBe('weniger als 10');
		expect((await O.listOrgs(sql, { region: '04011' })).map((x) => x.id)).toEqual([org]);
	});

	it('Mitgliedstermin: nicht öffentlich, keine FreiKarte; Einrichtungstermin öffentlich', async () => {
		const m = await E.createEvent(sql, u.anna, input({ title: 'Spielgruppe Findorff' }));
		const [row] = await sql`select visibility, freikarte, origin, status from events where id = ${m.id}`;
		expect(row).toMatchObject({ visibility: 'mitglieder', freikarte: false, origin: 'mitglied', status: 'aktiv' });
		const anon = await E.listOccurrences(sql, { id: null }, range);
		expect(anon.some((x) => x.id === m.id)).toBe(false);
		expect(await E.getEvent(sql, { id: null }, m.id, null)).toEqual({ needsLogin: true });
		const o = await E.createEvent(sql, u.kollegin, input(), { orgId: org });
		const pub = await E.listOccurrences(sql, { id: null }, range);
		expect(pub.find((x) => x.id === o.id)).toMatchObject({ origin: 'anbieter', orgName: 'Familienzentrum Findorff', freikarte: true });
		await expect(E.createEvent(sql, u.anna, input(), { orgId: org })).rejects.toBeInstanceOf(PostError);
		await expect(E.createEvent(sql, u.anna, input(), { asRedaktion: true })).rejects.toBeInstanceOf(PostError);
		expect((await E.createEvent(sql, u.red, input({ title: 'Laternenlaufen' }), { asRedaktion: true })).held).toBe(false);
	});

	it('Privater Termin nur mit Link; Telefonnummer → Prüfung', async () => {
		const p = await E.createEvent(sql, u.anna, input({ title: 'Geburtstagsfeier im Park', visibility: 'privat' }));
		expect(p.shareToken).toBeTruthy();
		expect(await E.getEvent(sql, { id: u.ben }, p.id, null)).toBeNull();
		expect((await E.getEvent(sql, { id: u.ben }, p.id, p.shareToken)) as object).toHaveProperty('event');
		const h = await E.createEvent(sql, u.anna, input({ title: 'Tauschbörse', description: 'Ruft mich an: 0151 23456789' }));
		expect(h.held).toBe(true);
		expect(await E.getEvent(sql, { id: u.ben }, h.id, null)).toBeNull();
		const [c] = await sql`select reason from mod_cases where target_type = 'event' and target_id = ${h.id}`;
		expect(c.reason).toBe('private_daten');
	});

	it('Blockierte sehen Mitgliedstermine gegenseitig nicht', async () => {
		const m = await E.createEvent(sql, u.anna, input({ title: 'Kinderwagenrunde' }));
		await sql`insert into blocks (blocker, blocked) values (${u.anna}, ${u.cem})`;
		expect((await E.listOccurrences(sql, { id: u.cem }, range)).some((x) => x.id === m.id)).toBe(false);
		expect(await E.getEvent(sql, { id: u.cem }, m.id, null)).toBeNull();
		expect((await E.listOccurrences(sql, { id: u.ben }, range)).some((x) => x.id === m.id)).toBe(true);
	});

	it('Wöchentliche Reihe: Einzelabsage sichtbar, Absage-Hinweis, Benachrichtigung, Wiederherstellen', async () => {
		const s = await E.createEvent(sql, u.leitung, input({ title: 'Krabbelgruppe', repeat: 'woechentlich', repeatUntil: new Date(sat.getTime() + 21 * 86_400_000) }), { orgId: org });
		const occ = (await E.listOccurrences(sql, { id: u.anna }, range)).filter((x) => x.id === s.id);
		expect(occ.length).toBe(4);
		expect(occ.every((o) => berlinParts(o.start).h === 10)).toBe(true);
		const second = occ[1].date;
		await S.toggleSaved(sql, u.anna, 'event', s.id, second);
		await E.setAttendance(sql, u.ben, s.id, second, 'komme_mit', true);
		await E.cancelEvent(sql, u.kollegin, s.id, second, 'Raum belegt');
		const after = (await E.listOccurrences(sql, { id: u.anna }, range)).filter((x) => x.id === s.id);
		expect(after.map((o) => [o.date, o.cancelled])).toContainEqual([second, true]);
		expect(after.filter((o) => o.cancelled).length).toBe(1);
		const n = await sql`select user_id, text from notifications where kind = 'termin' and link like ${'%' + s.id + '%'}`;
		expect(n.map((x) => x.user_id).sort()).toEqual([u.anna, u.ben].sort());
		const [notice] = await sql`select kind, source_kind, org_id from notices where event_id = ${s.id}`;
		expect(notice).toMatchObject({ kind: 'absage', source_kind: 'anbieter', org_id: org });
		await expect(E.setAttendance(sql, u.cem, s.id, second, 'komme_mit', false)).rejects.toBeInstanceOf(PostError);
		await E.restoreOccurrence(sql, u.leitung, s.id, second);
		expect((await E.listOccurrences(sql, { id: u.anna }, range)).filter((x) => x.id === s.id && x.cancelled).length).toBe(0);
		await expect(E.cancelEvent(sql, u.anna, s.id, null, '')).rejects.toBeInstanceOf(PostError); // fremder Termin
	});

	it('Wer kommt mit: nur wer zustimmt; Zählung', async () => {
		const e = await E.createEvent(sql, u.leitung, input({ title: 'Ferienbasteln' }), { orgId: org });
		const day = key(sat);
		await E.setAttendance(sql, u.anna, e.id, day, 'komme_mit', true);
		await E.setAttendance(sql, u.ben, e.id, day, 'komme_mit', false);
		await E.setAttendance(sql, u.cem, e.id, day, 'interessiert', true);
		const who = await E.whoComes(sql, u.leitung, e.id, day);
		expect(who.length).toBe(1);
		const d1 = await E.getEvent(sql, { id: u.anna }, e.id, null);
		if (!d1 || d1.needsLogin) throw new Error('fehlt');
		expect(d1.counts[day]).toEqual({ interessiert: 1, kommeMit: 2 });
		expect(d1.mine[day]).toEqual({ status: 'komme_mit', showMe: true });
		await expect(E.setAttendance(sql, u.anna, e.id, key(new Date(sat.getTime() + 86_400_000)), 'komme_mit', false)).rejects.toBeInstanceOf(PostError);
	});

	it('Angebote: Verfügbarkeit nur mit Gültigkeit; Erinnerung zur Bestätigung', async () => {
		const id = await F.saveOffer(sql, u.kollegin, org, null, { title: 'Babyschwimmen dienstags', description: '', kind: 'babyschwimmen', topics: ['freizeit'], ageMin: 0, ageMax: 1, scheduleText: 'dienstags 10 Uhr', startsOn: null, costText: '60 € für 6 Termine', freikarte: false, registrationUrl: null, contact: null, placeId: null, address: null, lat: null, lon: null });
		expect((await F.listOffers(sql, { orgId: org }))[0].availability).toBe('unbekannt');
		await expect(F.confirmAvailability(sql, u.anna, id, 'frei', 3, 7)).rejects.toBeInstanceOf(PostError);
		await expect(F.confirmAvailability(sql, u.kollegin, id, 'frei', 3, 5)).rejects.toBeInstanceOf(PostError);
		await F.confirmAvailability(sql, u.kollegin, id, 'frei', 3, 7);
		const l = await F.listOffers(sql, { region: '04011', onlyAvailable: true });
		expect(l.map((x) => [x.id, x.availability, x.placesCount])).toEqual([[id, 'frei', 3]]);
		const [nn] = await sql`select kind, source_kind from notices where offer_id = ${id}`;
		expect(nn).toMatchObject({ kind: 'neu', source_kind: 'anbieter' });
		await sql`update offers set availability_until = now() - interval '1 minute' where id = ${id}`;
		const after = await F.listOffers(sql, { orgId: org });
		expect(after[0]).toMatchObject({ availability: 'unbekannt', placesCount: null });
		expect(await F.remindReconfirm(sql)).toBe(1);
		expect(await F.remindReconfirm(sql)).toBe(0);
		const r = await sql`select user_id from notifications where kind = 'einrichtung' and link = ${'/angebote/' + id}`;
		expect(r.map((x) => x.user_id).sort()).toEqual([u.leitung, u.kollegin].sort());
	});

	it('Hinweise: Rechte, „amtlich“ nur mit Quelle, Region nach oben und unten', async () => {
		const base = { kind: 'frist', title: 'Anmeldung Kita-Jahr 2027', body: 'Bis Ende Januar anmelden.', topics: ['betreuung'], regionCode: '04011', sourceKind: 'amtlich' as const, sourceUrl: null, validUntil: null, deadline: key(new Date(Date.now() + 20 * 86_400_000)), urgent: false };
		await expect(N.createNotice(sql, u.anna, base)).rejects.toBeInstanceOf(PostError);
		await expect(N.createNotice(sql, u.red, base)).rejects.toBeInstanceOf(PostError);
		const id = await N.createNotice(sql, u.red, { ...base, sourceUrl: 'https://www.bremen.de/kita' });
		const l = await N.listNotices(sql, { region: '04011:st:1' });
		expect(l.notices.find((n) => n.id === id)).toMatchObject({ sourceKind: 'amtlich' });
		expect((await N.listNotices(sql, { region: '04011:st:1', topics: ['gesundheit'] })).notices.some((n) => n.id === id)).toBe(false);
		const o = await N.createNotice(sql, u.kollegin, { ...base, sourceKind: 'amtlich', urgent: true, title: 'Neue Kurszeiten' }, { orgId: org });
		const [r] = await sql`select source_kind, urgent from notices where id = ${o}`;
		expect(r).toMatchObject({ source_kind: 'anbieter', urgent: false });
	});

	it('Merkliste: Erinnerung zur Frist, Versand einmal, Kalender-Link', async () => {
		const [n] = await sql`select id from notices where title = 'Anmeldung Kita-Jahr 2027'`;
		await S.toggleSaved(sql, u.ben, 'notice', n.id, null);
		const at = await S.setReminder(sql, u.ben, 'notice', n.id, null, '1w');
		expect(at).toBeInstanceOf(Date);
		await expect(S.setReminder(sql, u.ben, 'notice', n.id, null, '5x')).rejects.toBeInstanceOf(PostError);
		await sql`update saved_items set remind_at = now() - interval '1 minute' where user_id = ${u.ben} and item_id = ${n.id}`;
		expect(await S.sendReminders(sql)).toBe(1);
		expect(await S.sendReminders(sql)).toBe(0);
		const [msg] = await sql`select text from notifications where user_id = ${u.ben} and kind = 'erinnerung'`;
		expect(msg.text).toContain('Kita-Jahr');
		const feedUrl = await S.calendarFeed(sql, u.anna);
		expect(feedUrl).toMatch(/\/kalender\/[A-Za-z0-9_-]{20,}\.ics$/);
		expect(await S.calendarFeed(sql, u.anna)).toBe(''); // nur einmal sichtbar
		const token = feedUrl.split('/').pop()!.replace('.ics', '');
		const body = await S.feedIcs(sql, token);
		expect(body).toContain('SUMMARY:Krabbelgruppe');
		expect(await S.feedIcs(sql, 'x'.repeat(30))).toBeNull();
		await S.revokeCalendarFeed(sql, u.anna);
		expect(await S.feedIcs(sql, token)).toBeNull();
	});

	it('Radar: Auswahl nach Region, Thema, Alter; Zusammenfassung ohne Dubletten', async () => {
		await expect(R.saveProfile(sql, u.cem, null, { name: 'x', regions: [], topics: [], include: [], ageGroups: [], frequency: 'woechentlich', viaEmail: false, viaPush: false })).rejects.toBeInstanceOf(PostError);
		const pid = await R.saveProfile(sql, u.cem, null, { name: 'Findorff', regions: ['04011:st:1'], topics: [], include: ['veranstaltungen', 'angebote', 'hinweise'], ageGroups: ['0-1'], frequency: 'woechentlich', viaEmail: false, viaPush: true });
		const p = (await R.getProfile(sql, u.cem, pid))!;
		const items = await R.select(sql, u.cem, p);
		const titles = items.map((i) => i.title);
		expect(titles).toContain('Krabbelgruppe');
		expect(titles.filter((t) => t === 'Krabbelgruppe').length).toBe(1); // je Reihe nur der nächste Termin
		expect(titles).toContain('Anmeldung Kita-Jahr 2027'); // Stadt-Hinweis gilt im Stadtteil
		expect(titles).not.toContain('Kinderwagenrunde'); // blockiert
		expect(items.every((i) => i.isNew)).toBe(true);
		// Montag 8 Uhr: fällig
		const c = berlinParts(new Date());
		const mon = new Date(Date.UTC(c.y, c.m - 1, c.d));
		const monday = berlinToUtc({ y: c.y, m: c.m, d: c.d, h: 8, mi: 0 });
		const shift = ((8 - mon.getUTCDay()) % 7) * 86_400_000;
		const due = new Date(monday.getTime() + shift);
		expect(R.isDue(p, due)).toBe(true);
		expect(R.isDue(p, new Date(due.getTime() - 2 * 3600_000))).toBe(false); // vor 7 Uhr
		expect(R.isDue(p, new Date(due.getTime() + 86_400_000))).toBe(false); // Dienstag
		expect(R.isDue({ ...p, frequency: 'nur_portal' }, due)).toBe(false);
		expect(await R.sendDigests(sql, due)).toBe(1);
		expect(await R.sendDigests(sql, due)).toBe(0);
		const [nt] = await sql`select text, link from notifications where user_id = ${u.cem} and kind = 'radar'`;
		expect(nt.link).toBe(`/radar/${pid}`);
		const again = await R.select(sql, u.cem, (await R.getProfile(sql, u.cem, pid))!);
		expect(again.filter((i) => i.isNew).length).toBe(0);
		const txt = R.digestText('Findorff', items, 'https://kinder.example.org/radar/x');
		expect(txt.subject).toBe('Dein Familienradar');
		expect(txt.text).toContain('Quelle: ');
	});

	it('Radar: gefolgte Einrichtung kommt auch außerhalb der Region dazu', async () => {
		const pid = await R.saveProfile(sql, u.anna, null, { name: 'Neustadt', regions: ['04011:st:2'], topics: ['gesundheit'], include: ['veranstaltungen'], ageGroups: [], frequency: 'nur_portal', viaEmail: false, viaPush: false });
		const items = await R.select(sql, u.anna, (await R.getProfile(sql, u.anna, pid))!);
		expect(items.some((i) => i.title === 'Krabbelgruppe')).toBe(true);
	});

	it('ICS-Import der Einrichtung: neu, unverändert, gesperrte Felder, entfernt → archiviert', async () => {
		const t1 = new Date(sat.getTime() + 2 * 86_400_000);
		const fmt = (t: Date) => t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
		const ev = (uid: string, title: string, start: Date, extra: string[] = []) => ['BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${title}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(new Date(start.getTime() + 3600_000))}`, ...extra, 'END:VEVENT'];
		ics = ['BEGIN:VCALENDAR', ...ev('a@fz', 'Elterncafé', t1, ['RRULE:FREQ=WEEKLY;COUNT=3']), ...ev('b@fz', 'Vortrag Schlaf', t1), ...ev('alt@fz', 'Längst vorbei', new Date('2020-01-01T10:00:00Z')), 'END:VCALENDAR'].join('\r\n');
		await O.updateOrg(sql, u.leitung, org, { name: 'Familienzentrum Findorff', kind: 'familienzentrum', description: 'Offener Treff', topics: ['betreuung'], regionCode: '04011:st:1', address: 'Musterweg 1', lat: null, lon: null, website: null, email: null, phone: null, icsUrl: `https://fz.example.org/k.ics` });
		const [src] = await sql`select key, config, kind from data_sources where key = ${'org-ics-' + orgSlug}`;
		expect(src.kind).toBe('termine');
		const cfg = { ...src.config, url: `http://127.0.0.1:${port}/k.ics` };
		const r1 = await I.importIcs(sql, src.key, cfg);
		expect(r1.counts).toMatchObject({ neu: 2, aktualisiert: 0 });
		const imported = await sql`select id, title, origin, org_id, region_code, visibility, rrule from events where source_key = ${src.key} order by title`;
		expect(imported.map((x) => [x.title, x.origin, x.org_id, x.region_code])).toEqual([
			['Elterncafé', 'anbieter', org, '04011:st:1'],
			['Vortrag Schlaf', 'anbieter', org, '04011:st:1']
		]);
		expect(imported[0].rrule).toBe('FREQ=WEEKLY;COUNT=3');
		expect((await I.importIcs(sql, src.key, cfg)).counts).toMatchObject({ neu: 0, unveraendert: 2 });
		// Redaktion ändert den Titel → beim nächsten Abruf bleibt er
		const cafe = imported[0].id;
		const d0 = await E.getEvent(sql, { id: u.leitung }, cafe, null);
		if (!d0 || d0.needsLogin) throw new Error('fehlt');
		const { eventValues, eventFromForm } = await import('../src/lib/server/angebote/forms');
		const vals = eventValues(d0.event, E.ruleToChoice(d0.event.rrule, d0.event.startsAt), '04011:st:1');
		const fd = new FormData();
		for (const [k, vs] of Object.entries(vals)) for (const v of vs) fd.append(k, v);
		fd.set('title', 'Elterncafé (mit Kinderbetreuung)');
		await E.updateEvent(sql, u.leitung, cafe, eventFromForm(fd));
		const [kept] = await sql`select rrule, locked_fields from events where id = ${cafe}`;
		expect(kept.rrule).toBe('FREQ=WEEKLY;COUNT=3'); // „beibehalten“
		expect(kept.locked_fields).toContain('title');
		ics = ics.replace('SUMMARY:Elterncafé', 'SUMMARY:Elterncafe NEU').replace(/BEGIN:VEVENT\r\nUID:b@fz[\s\S]*?END:VEVENT\r\n/, '');
		const r3 = await I.importIcs(sql, src.key, cfg);
		expect(r3.counts).toMatchObject({ aktualisiert: 1, entfernt: 1 });
		const after = await sql`select title, status from events where source_key = ${src.key} order by title`;
		expect(after.map((x) => [x.title, x.status])).toEqual([
			['Elterncafé (mit Kinderbetreuung)', 'aktiv'],
			['Vortrag Schlaf', 'archiviert']
		]);
		// Pausierte Einrichtung: Abruf ausgesetzt
		await O.setOrgStatus(sql, u.mod, org, 'pausiert', 'Test');
		await expect(I.importIcs(sql, src.key, cfg)).rejects.toThrow(/verifiziert/);
		expect((await E.listOccurrences(sql, { id: null }, range)).some((x) => x.orgName)).toBe(false);
		await O.setOrgStatus(sql, u.mod, org, 'verifiziert', 'Test');
	});

	it('Konto: Export enthält Radar und Merkliste; Löschen räumt auf', async () => {
		const ex = await exportAccount(sql, u.cem);
		expect(JSON.stringify(ex)).toContain('Findorff');
		await deleteAccount(sql, u.anna);
		for (const t of ['saved_items', 'radar_profiles', 'event_attendance', 'org_followers', 'calendar_feeds'])
			expect((await sql.unsafe(`select count(*)::int as n from ${t} where user_id = $1`, [u.anna]))[0].n).toBe(0);
		const [{ n }] = await sql`select count(*)::int as n from events where created_by = ${u.anna} and status <> 'entfernt'`;
		expect(n).toBe(0);
	});
});
