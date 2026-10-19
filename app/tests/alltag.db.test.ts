// Marktplatz, Familien helfen Familien, Lebenslagen-Kompass, Einladungen, Event-Chat gegen echte Datenbank.
// Alle Testdaten sind künstlich.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

process.env.MEDIA_DIR = '/tmp/kd-media-test-alltag';
process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Alltag (Datenbank)', async () => {
	const M = await import('../src/lib/server/alltag/market');
	const H = await import('../src/lib/server/alltag/help');
	const K = await import('../src/lib/server/alltag/compass');
	const I = await import('../src/lib/server/alltag/invitations');
	const C = await import('../src/lib/server/contacts');
	const { PostError, canSeeMedia } = await import('../src/lib/server/community/posts');
	const { deleteAccount, exportAccount } = await import('../src/lib/server/account');
	const { checkRule } = await import('../src/lib/server/chat/rules');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const listing = (extra: Partial<Parameters<typeof M.createListing>[2]> = {}): Parameters<typeof M.createListing>[2] => ({
		kind: 'verkaufen',
		category: 'kleidung',
		title: 'Winterjacke Größe 104',
		description: 'Warm, kaum getragen.',
		priceCents: 1500,
		negotiable: false,
		condition: 'gut',
		sizeText: '104',
		ageMin: 3,
		ageMax: 5,
		regionCode: '04011:st:1',
		safetyAck: false,
		privateSeller: true,
		...extra
	});
	const guest = (userId: string | null, key: string | null = null): import('../src/lib/server/alltag/invitations').Guest => ({ userId, keyFor: () => key });
	const inv = (extra: Partial<Parameters<typeof I.createInvitation>[2]> = {}): Parameters<typeof I.createInvitation>[2] => ({
		title: 'Mias 6. Geburtstag',
		message: 'Wir feiern mit Schatzsuche.',
		startsAt: new Date(Date.now() + 10 * 86_400_000),
		endsAt: new Date(Date.now() + 10 * 86_400_000 + 3 * 3600_000),
		placeText: 'Musterweg 1',
		addressAfterRsvp: true,
		placeId: null,
		rsvpUntil: null,
		maxGuests: 2,
		guestsSeeList: true,
		...extra
	});

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		for (const n of ['anna', 'ben', 'cem', 'dora', 'red']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
			await sql`update user_profiles set display_name = ${n} where user_id = ${x.id}`;
		}
		await sql`insert into regions (code, name, level, parent_code, source, center) values
			('04011:st:1', 'Findorff', 'stadtteil', '04011', 'Test', ST_SetSRID(ST_MakePoint(8.79, 53.09), 4326)),
			('04011:st:2', 'Neustadt', 'stadtteil', '04011', 'Test', ST_SetSRID(ST_MakePoint(8.80, 53.06), 4326)) on conflict (code) do nothing`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.red}, 'data_editor', 'global', null)`;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Anzeige: Pflichtangaben, grober Ort statt Adresse, Dubletten, Sicherheitsbestätigung', async () => {
		await expect(M.createListing(sql, u.anna, listing({ privateSeller: false }))).rejects.toBeInstanceOf(PostError);
		await expect(M.createListing(sql, u.anna, listing({ regionCode: null }))).rejects.toBeInstanceOf(PostError);
		await expect(M.createListing(sql, u.anna, listing({ priceCents: null }))).rejects.toBeInstanceOf(PostError);
		await expect(M.createListing(sql, u.anna, listing({ category: 'autositz', title: 'Babyschale' }))).rejects.toBeInstanceOf(PostError);
		const img = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#ffc53d' } }).jpeg().toBuffer();
		const a = await M.createListing(sql, u.anna, listing(), [{ data: img, alt: null }]);
		expect(a.held).toBeNull();
		const [row] = await sql`select ST_X(location) as lon, ST_Y(location) as lat, status from market_listings where id = ${a.id}`;
		expect(row).toMatchObject({ lon: 8.79, lat: 53.09, status: 'verfuegbar' }); // Mittelpunkt des Stadtteils
		await expect(M.createListing(sql, u.anna, listing())).rejects.toBeInstanceOf(PostError); // gleiche Anzeige
		const g = await M.createListing(sql, u.anna, listing({ kind: 'verschenken', title: 'Bilderbücher', category: 'buecher', priceCents: 500 }));
		const [gift] = await sql`select price_cents from market_listings where id = ${g.id}`;
		expect(gift.price_cents).toBeNull();
		const view = await M.getListing(sql, u.ben, a.id);
		expect(view?.images.length).toBe(1);
		expect(view?.seller.contactId).toBeNull(); // Familien-ID erst nach Kontakt
		expect(await canSeeMedia(sql, u.ben, view!.images[0].id)).toBe(true);
		expect(await canSeeMedia(sql, null, view!.images[0].id)).toBe(false);
	});

	it('Telefonnummer → Prüfung, nicht sichtbar; Suche, Umkreis, Blockieren', async () => {
		const h = await M.createListing(sql, u.cem, listing({ title: 'Laufrad', category: 'fahrraeder', description: 'Ruft an: 0151 23456789' }));
		expect(h.held).toBeTruthy();
		expect(await M.getListing(sql, u.ben, h.id)).toBeNull();
		const [c] = await sql`select reason from mod_cases where target_type = 'listing' and target_id = ${h.id}`;
		expect(c.reason).toBe('private_daten');
		expect((await M.listListings(sql, u.ben, { q: 'Winterjacke' })).map((x) => x.title)).toEqual(['Winterjacke Größe 104']);
		expect((await M.listListings(sql, u.ben, { region: '04011' })).length).toBe(2);
		expect((await M.listListings(sql, u.ben, { region: '04011:st:2' })).length).toBe(0);
		const near = await M.listListings(sql, u.ben, { near: { lat: 53.06, lon: 8.80, km: 5 }, sort: 'naehe' });
		expect(near.length).toBe(2);
		expect(near[0].km).toBeGreaterThanOrEqual(1);
		expect((await M.listListings(sql, u.ben, { maxPriceCents: 1000 })).map((x) => x.title)).toEqual(['Bilderbücher']);
		await sql`insert into blocks (blocker, blocked) values (${u.anna}, ${u.dora})`;
		expect((await M.listListings(sql, u.dora, {})).length).toBe(0);
	});

	it('Anfrage zur Anzeige = Kontaktanfrage mit Bezug; danach Chat über Kontakt', async () => {
		const [l] = await sql`select id from market_listings where title = 'Winterjacke Größe 104'`;
		await expect(M.inquire(sql, u.ben, l.id, 'Hi')).rejects.toBeInstanceOf(PostError);
		await expect(M.inquire(sql, u.ben, l.id, 'Noch da? Meine Nummer 0151 23456789')).rejects.toBeInstanceOf(PostError);
		expect(await M.inquire(sql, u.ben, l.id, 'Ist die Jacke noch zu haben?')).toEqual({ direct: false });
		expect((await M.getListing(sql, u.ben, l.id))?.contact).toBe('angefragt');
		const o = await C.overview(sql, u.anna);
		const r = o.incoming.find((x) => x.ref_id === l.id);
		expect(r).toMatchObject({ via: 'markt', ref_kind: 'listing', ref_title: 'Winterjacke Größe 104' });
		const [n] = await sql`select text from notifications where user_id = ${u.anna} and kind = 'markt'`;
		expect(n.text).toContain('Winterjacke');
		await C.respond(sql, u.anna, r!.id as string, true);
		const v = await M.getListing(sql, u.ben, l.id);
		expect(v?.contact).toBe('kontakt');
		expect(v?.seller.contactId).toBeTruthy();
		expect(await M.inquire(sql, u.ben, l.id, 'egal')).toEqual({ direct: true });
	});

	it('Status, Verlängern, Ablauf, Suchauftrag meldet nur Neues', async () => {
		const [l] = await sql`select id from market_listings where title = 'Winterjacke Größe 104'`;
		await expect(M.setStatus(sql, u.ben, l.id, 'abgegeben')).rejects.toBeInstanceOf(PostError);
		await M.setStatus(sql, u.anna, l.id, 'reserviert');
		expect((await M.listListings(sql, u.ben, { q: 'Winterjacke' }))[0].status).toBe('reserviert');
		await sql`update market_listings set expires_at = now() - interval '1 minute' where id = ${l.id}`;
		expect(await M.expireListings(sql)).toBe(1);
		expect((await M.listListings(sql, u.ben, { q: 'Winterjacke' })).length).toBe(0);
		await M.renewListing(sql, u.anna, l.id);
		expect((await M.listListings(sql, u.ben, { q: 'Winterjacke' })).length).toBe(1);
		await expect(M.renewListing(sql, u.anna, l.id)).rejects.toBeInstanceOf(PostError); // einmal am Tag
		await expect(M.saveSearch(sql, u.ben, { q: null, category: null, kinds: [], regionCode: null, maxPriceCents: null })).rejects.toBeInstanceOf(PostError);
		await M.saveSearch(sql, u.ben, { q: 'Kinderwagen', category: null, kinds: [], regionCode: '04011', maxPriceCents: 10000 });
		await sql`update market_searches set last_checked_at = now() - interval '1 hour' where user_id = ${u.ben}`;
		expect(await M.checkSearches(sql)).toBe(0);
		await M.createListing(sql, u.anna, listing({ title: 'Kinderwagen Kombi', category: 'kinderwagen', priceCents: 8000, safetyAck: true }));
		await sql`update market_searches set last_checked_at = now() - interval '1 hour' where user_id = ${u.ben}`;
		expect(await M.checkSearches(sql)).toBe(1);
		const [n] = await sql`select text from notifications where user_id = ${u.ben} and kind = 'markt' order by created_at desc limit 1`;
		expect(n.text).toContain('Kinderwagen Kombi');
	});

	it('Hilfe: keine Fremdbetreuung, Krisenhinweis, Antwort als Kontaktanfrage', async () => {
		await expect(H.createHelp(sql, u.cem, { kind: 'brauche', category: 'alltag', title: 'Babysitter gesucht', body: 'Freitagabend', regionCode: '04011:st:1' })).rejects.toBeInstanceOf(PostError);
		await expect(H.createHelp(sql, u.cem, { kind: 'biete', category: 'alltag', title: 'Kann auf eure Kinder aufpassen', body: 'nachmittags', regionCode: '04011:st:1' })).rejects.toBeInstanceOf(PostError);
		const h = await H.createHelp(sql, u.cem, { kind: 'brauche', category: 'antraege', title: 'Hilfe beim Elterngeldantrag', body: 'Ich habe keine Kraft mehr für den Papierkram.', regionCode: '04011:st:1' });
		expect(h.crisis).toBe(true);
		const b = await H.createHelp(sql, u.dora, { kind: 'biete', category: 'kleidung', title: 'Babykleidung abzugeben', body: 'Größe 56–68', regionCode: '04011:st:2' });
		expect((await H.listHelp(sql, u.ben, { region: '04011' })).length).toBe(2);
		expect((await H.listHelp(sql, u.ben, { kind: 'biete' })).map((x) => x.id)).toEqual([b.id]);
		expect(await H.respondHelp(sql, u.ben, h.id, 'Ich habe das letztes Jahr gemacht und helfe gern.')).toEqual({ direct: false });
		const [r] = await sql`select via, ref_kind from contact_requests where from_user = ${u.ben} and to_user = ${u.cem}`;
		expect(r).toMatchObject({ via: 'hilfe', ref_kind: 'help' });
		await H.setHelpStatus(sql, u.cem, h.id, 'erledigt');
		expect((await H.listHelp(sql, u.ben, {})).some((x) => x.id === h.id)).toBe(false);
		await expect(H.respondHelp(sql, u.dora, h.id, 'Noch Hilfe nötig?')).rejects.toBeInstanceOf(PostError);
	});

	it('Kompass: Inhalte mit Quelle, Pflege nur mit Recht', async () => {
		const list = await K.situations(sql);
		expect(list.map((s) => s.key)).toEqual(['schwangerschaft', 'geburt', 'kita-start', 'schule', 'trennung', 'geld-knapp']);
		const g = await K.situation(sql, 'geburt', { region: null, member: false, viewerId: null });
		expect(g?.steps.length).toBeGreaterThan(3);
		expect([...g!.steps, ...g!.infos].every((i) => i.source)).toBe(true);
		const item = { situation: 'kita-start', kind: 'schritt' as const, section: null, title: 'Kita-Platz anmelden', body: '', url: 'https://example.org', source: 'Test', sort: 1 };
		await expect(K.saveItem(sql, u.anna, null, item)).rejects.toBeInstanceOf(PostError);
		await expect(K.saveItem(sql, u.red, null, { ...item, source: '' })).rejects.toBeInstanceOf(PostError);
		const id = await K.saveItem(sql, u.red, null, item);
		expect((await K.situation(sql, 'kita-start', { region: null, member: true, viewerId: u.red }))?.steps.map((s) => s.id)).toContain(id);
		await K.deleteItem(sql, u.red, id);
	});

	it('Einladung: Link, Antworten ohne Konto, Adresse erst nach Zusage, Höchstzahl, Widerruf', async () => {
		const { link, id } = await I.createInvitation(sql, u.anna, inv());
		const token = link.split('/e/')[1];
		const v0 = await I.guestView(sql, token, guest(null));
		expect(v0?.placeText).toBeNull();
		expect(v0?.addressHidden).toBe(true);
		expect(await I.guestView(sql, 'x'.repeat(30), guest(null))).toBeNull();
		const g1 = await I.rsvp(sql, token, guest(null), { name: 'Lena', answer: 'ja', kids: 1, adults: 1, note: null });
		expect(g1.guestKey).toBeTruthy();
		const v1 = await I.guestView(sql, token, guest(null, g1.guestKey));
		expect(v1?.placeText).toBe('Musterweg 1');
		expect(v1?.mine?.answer).toBe('ja');
		expect(v1?.list).toEqual(['Lena']);
		await I.rsvp(sql, token, guest(u.ben), { name: 'Ben', answer: 'ja', kids: 2, adults: 0, note: null });
		await expect(I.rsvp(sql, token, guest(u.cem), { name: 'Cem', answer: 'ja', kids: 1, adults: 0, note: null })).rejects.toBeInstanceOf(PostError); // voll
		await I.rsvp(sql, token, guest(u.cem), { name: 'Cem', answer: 'vielleicht', kids: 1, adults: 0, note: null });
		expect((await I.guestView(sql, token, guest(u.cem)))?.list).toBeNull(); // nur Zusagende sehen Namen
		await expect(I.rsvp(sql, token, guest(u.dora), { name: 'Dora', answer: 'nein', kids: 0, adults: 0, note: 'Ruf an: 0151 23456789' })).rejects.toBeInstanceOf(PostError);
		const org = await I.organizerView(sql, u.anna, id);
		expect(org.rsvps.map((r) => r.name).sort()).toEqual(['Ben', 'Cem', 'Lena']);
		expect(org.link).toBe(link);
		await expect(I.organizerView(sql, u.ben, id)).rejects.toBeInstanceOf(PostError);
		const fresh = await I.renewLink(sql, u.anna, id);
		expect(await I.guestView(sql, token, guest(null))).toBeNull();
		const t2 = fresh.split('/e/')[1];
		expect((await I.guestView(sql, t2, guest(null, g1.guestKey)))?.mine?.name).toBe('Lena'); // Antworten bleiben
		await I.updateInvitation(sql, u.anna, id, { ...inv(), startsAt: new Date(Date.now() + 11 * 86_400_000), endsAt: null });
		const msgs = await sql`select user_id from notifications where kind = 'einladung' and text like '%geändert%'`;
		expect(msgs.map((m) => m.user_id).sort()).toEqual([u.ben, u.cem].sort());
		await I.revokeLink(sql, u.anna, id);
		expect(await I.guestView(sql, t2, guest(null))).toBeNull();
		await I.cancelInvitation(sql, u.anna, id, 'krank');
		expect((await I.myInvitations(sql, u.anna)).own[0].status).toBe('abgesagt');
	});

	it('Einladungen werden 30 Tage nach dem Termin gelöscht', async () => {
		const { id } = await I.createInvitation(sql, u.dora, inv({ title: 'Alter Geburtstag' }));
		await sql`update invitations set starts_at = now() - interval '40 days', ends_at = null where id = ${id}`;
		expect(await I.purgeInvitations(sql)).toBe(1);
		expect((await sql`select 1 from invitations where id = ${id}`).length).toBe(0);
	});

	it('Chat-Regeln bleiben: Einladung im Direktchat nur unter Kontakten', async () => {
		await sql`insert into chat_accounts (user_id, localpart) values (${u.ben}, 'kbbbbbbbbbbbbbbb'), (${u.dora}, 'kddddddddddddddd') on conflict do nothing`;
		const r = await checkRule(sql, { action: 'invite', inviter: '@kbbbbbbbbbbbbbbb:kinder-deutschlands', invitee: '@kddddddddddddddd:kinder-deutschlands', room: '!xyzxyzxyz' });
		expect(r.allow).toBe(false);
	});

	it('Konto löschen: Anzeigen, Suchaufträge, Hilfe, Einladungen weg; Export vorher vollständig', async () => {
		const ex = JSON.stringify(await exportAccount(sql, u.anna));
		expect(ex).toContain('Winterjacke');
		expect(ex).toContain('Mias 6. Geburtstag');
		await deleteAccount(sql, u.anna);
		const [{ n }] = await sql`select count(*)::int as n from market_listings where user_id = ${u.anna} and status <> 'entfernt'`;
		expect(n).toBe(0);
		expect((await sql`select 1 from invitations where organizer_id = ${u.anna}`).length).toBe(0);
		expect((await sql`select 1 from media where listing_id is not null and owner_id = ${u.anna}`).length).toBe(0);
		expect((await M.listListings(sql, u.ben, {})).some((x) => x.title.includes('Winterjacke'))).toBe(false);
	});
});
