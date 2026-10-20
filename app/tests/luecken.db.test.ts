// Abschnitt 8 gegen echte Datenbank: Kartenebenen, Orte abonnieren. Testdaten künstlich.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Lücken schließen (Datenbank)', async () => {
	const L = await import('../src/lib/server/layers');
	const F = await import('../src/lib/server/follows');
	const E = await import('../src/lib/server/angebote/events');
	const M = await import('../src/lib/server/alltag/market');
	const H = await import('../src/lib/server/alltag/help');
	const R = await import('../src/lib/server/routes');
	const P = await import('../src/lib/server/places');
	const DC = await import('../src/lib/server/datacenter');
	const { exportAccount } = await import('../src/lib/server/account');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	let place = '';
	const bbox = { w: 8.7, s: 53.0, e: 8.9, n: 53.15 };
	const soon = new Date(Date.now() + 2 * 86_400_000);
	const ev = (extra: Partial<Parameters<typeof E.createEvent>[2]> = {}): Parameters<typeof E.createEvent>[2] => ({
		title: 'Laternenbasteln', description: 'Für Kinder ab 3.', kind: 'workshop', topics: ['freizeit'], startsAt: soon, endsAt: new Date(soon.getTime() + 2 * 3600_000),
		allDay: false, repeat: 'woechentlich', repeatUntil: null, placeId: null, lat: 53.095, lon: 8.795, address: 'Bürgerhaus', regionCode: '04011:st:1',
		ageMin: 3, ageMax: 8, costFree: true, costText: null, discounts: null, freikarte: false, accessibility: [], setting: 'drinnen', capacity: null,
		registrationUrl: null, registrationDeadline: null, waitlist: false, visibility: 'oeffentlich', ...extra
	});
	const notes = async (who: string) => (await sql`select text, link from notifications where user_id = ${u[who]} and kind = 'ort' order by created_at`).map((r) => r.text as string);

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		for (const n of ['anna', 'ben', 'red', 'cem']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
		}
		await sql`insert into regions (code, name, level, parent_code, source, center) values
			('04011:st:1', 'Findorff', 'stadtteil', '04011', 'Test', ST_SetSRID(ST_MakePoint(8.79, 53.09), 4326)),
			('04011:st:9', 'Weit weg', 'stadtteil', '04011', 'Test', ST_SetSRID(ST_MakePoint(11.57, 48.14), 4326)) on conflict (code) do nothing`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.red}, 'superadmin', 'global', null)`;
		const [p] = await sql`insert into places (kind, name, location, status, region_code) values ('spielplatz', 'Spielplatz Torfkanal', ST_SetSRID(ST_MakePoint(8.796, 53.096), 4326), 'aktiv', '04011:st:1') returning id`;
		place = p.id;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Ebenen: Termine nur sichtbare, je Termin das nächste Datum, nur im Ausschnitt', async () => {
		const pub = await E.createEvent(sql, u.red, ev(), { asRedaktion: true });
		await E.createEvent(sql, u.anna, ev({ title: 'Krabbelgruppe bei uns', visibility: 'mitglieder', repeat: 'nie' }));
		await E.createEvent(sql, u.red, ev({ title: 'In München', lat: 48.14, lon: 11.57, regionCode: '04011:st:9' }), { asRedaktion: true });
		const anon = await L.layerData(sql, null, bbox, ['termine']);
		expect(anon.points.map((p) => p.title)).toEqual(['Laternenbasteln']); // wöchentlich → trotzdem nur ein Punkt; Mitgliedertermin nicht öffentlich
		expect(anon.points[0].href).toMatch(new RegExp(`^/veranstaltungen/${pub.id}\\?am=\\d{4}-\\d{2}-\\d{2}$`));
		const mem = await L.layerData(sql, u.ben, bbox, ['termine']);
		expect(mem.points.map((p) => p.title).sort()).toEqual(['Krabbelgruppe bei uns', 'Laternenbasteln']);
		// abgesagt → nicht auf der Karte
		await E.cancelEvent(sql, u.red, pub.id, null, 'krank');
		expect((await L.layerData(sql, null, bbox, ['termine'])).points).toEqual([]);
	});

	it('Ebenen: Marktplatz und Hilfe nur für Mitglieder und nur je Gegend zusammengefasst', async () => {
		const base = { kind: 'verkaufen', category: 'kleidung', description: 'gut', priceCents: 500, negotiable: false, condition: 'gut', sizeText: null, ageMin: null, ageMax: null, regionCode: '04011:st:1', safetyAck: false, privateSeller: true };
		await M.createListing(sql, u.anna, { ...base, title: 'Matschhose 98' });
		await M.createListing(sql, u.anna, { ...base, title: 'Gummistiefel 24' });
		await H.createHelp(sql, u.anna, { kind: 'brauche', category: 'antraege', title: 'Elterngeld-Antrag', body: 'Wer kennt sich aus?', regionCode: '04011:st:1' });
		const anon = await L.layerData(sql, null, bbox, ['marktplatz', 'hilfe']);
		expect(anon.points).toEqual([]);
		expect(anon.hidden.sort()).toEqual(['hilfe', 'marktplatz']);
		const mem = await L.layerData(sql, u.ben, bbox, ['marktplatz', 'hilfe']);
		const m = mem.points.find((p) => p.layer === 'marktplatz')!;
		expect(m.count).toBe(2);
		expect(m.title).toBe('2 Anzeigen');
		expect(m.href).toBe('/marktplatz?region=04011%3Ast%3A1');
		expect([m.lon, m.lat]).toEqual([8.79, 53.09]); // Mittelpunkt der Gegend, nie der Anbieterin
		expect(mem.points.find((p) => p.layer === 'hilfe')?.count).toBe(1);
		// Blockiert → zählt nicht mit
		await sql`insert into blocks (blocker, blocked) values (${u.ben}, ${u.anna})`;
		expect((await L.layerData(sql, u.ben, bbox, ['marktplatz', 'hilfe'])).points).toEqual([]);
		await sql`delete from blocks`;
	});

	it('Ebenen: Routen als Linien, erst nach Prüfung', async () => {
		const path: [number, number][] = [[8.7905, 53.0935], [8.793, 53.095], [8.796, 53.0965], [8.7985, 53.0975]];
		const r = await R.createRoute(sql, u.anna, { title: 'Runde Torfkanal', description: '', coords: path, surface: 'asphalt', incline: 'eben', stairs: false, narrow: false, shade: null, restSpots: null, durationMin: 20, publicEnds: true });
		expect((await L.layerData(sql, null, bbox, ['routen'])).lines).toEqual([]);
		await R.reviewRoute(sql, u.red, r.id, true, '');
		const l = (await L.layerData(sql, null, bbox, ['routen'])).lines;
		expect(l.length).toBe(1);
		expect(l[0].coords).toEqual(path);
		expect(l[0].href).toBe(`/routen/${r.id}`);
	});

	it('Ort abonnieren: Mitteilung bei Hinweisen und neuen Terminen, nicht an den Auslöser, beenden möglich', async () => {
		expect(await F.setPlaceNotify(sql, u.ben, place, true)).toBe(true);
		expect(await F.setPlaceNotify(sql, u.cem, place, true)).toBe(true);
		const fav = await P.getPlace(sql, place, u.ben);
		expect(fav?.favorite).toBe(true); // Abo merkt den Ort automatisch
		expect(fav?.notify).toBe(true);
		// Mitglied meldet „gesperrt“ → Abonnenten erfahren es (ohne Freitext), Melderin nicht
		await P.reportPlace(sql, u.cem, place, 'gesperrt', 'Zaun kaputt, Telefon 0151…');
		expect((await notes('ben'))[0]).toBe('Spielplatz Torfkanal: gesperrt (Hinweis eines Mitglieds, unbestätigt)');
		expect(await notes('cem')).toEqual([]);
		// Redaktion bestätigt → zweite Mitteilung
		const [rp] = await sql`select id from place_reports where place_id = ${place}`;
		await DC.handleReport(sql, rp.id, 'erledigt', 'bestaetigen', 'Bauzaun bis Monatsende', null, u.red);
		expect((await notes('ben'))[1]).toBe('Spielplatz Torfkanal: Sperrung von der Redaktion bestätigt');
		const [n] = await sql`select id from place_notices where place_id = ${place} and ended_at is null`;
		await DC.endNotice(sql, n.id, u.red);
		expect((await notes('ben'))[2]).toBe('Spielplatz Torfkanal: Hinweis aufgehoben');
		// Neuer Termin am Ort
		const e = await E.createEvent(sql, u.red, ev({ title: 'Spielplatzfest', placeId: place, lat: null, lon: null, repeat: 'nie' }), { asRedaktion: true });
		const last = await sql`select text, link from notifications where user_id = ${u.ben} and kind = 'ort' order by created_at desc limit 1`;
		expect(last[0].text).toBe('Neuer Termin am Ort Spielplatz Torfkanal: Spielplatzfest');
		expect(last[0].link).toBe(`/veranstaltungen/${e.id}`);
		// Privater Termin → keine Mitteilung
		await E.createEvent(sql, u.anna, ev({ title: 'Kindergeburtstag privat', placeId: place, lat: null, lon: null, repeat: 'nie', visibility: 'privat' }));
		expect((await notes('ben')).length).toBe(4);
		// Abo beenden: Ort bleibt gemerkt, keine weiteren Mitteilungen
		await F.setPlaceNotify(sql, u.ben, place, false);
		expect((await P.getPlace(sql, place, u.ben))?.favorite).toBe(true);
		await DC.addNotice(sql, place, 'defekt', 'redaktion', 'Schaukel defekt', null, 7, u.red);
		expect((await notes('ben')).length).toBe(4);
		expect((await notes('cem')).at(-1)).toBe('Spielplatz Torfkanal: etwas ist defekt (Redaktion)');
		expect((await F.followedPlaces(sql, u.cem)).map((p) => p.name)).toEqual(['Spielplatz Torfkanal']);
		const x = (await exportAccount(sql, u.cem)) as unknown as { orte_merkliste?: { abonniert: boolean }[] };
		expect(x.orte_merkliste?.[0]?.abonniert).toBe(true);
	});
});
