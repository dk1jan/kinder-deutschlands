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
	const { exportAccount, deleteAccount } = await import('../src/lib/server/account');
	const G = await import('../src/lib/server/community/groups');
	const N = await import('../src/lib/server/angebote/notices');
	const { relationOf } = await import('../src/lib/server/profiles');
	const { cardForViewer } = await import('../src/lib/server/cards');
	const { PostError } = await import('../src/lib/server/community/posts');
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
		for (const n of ['anna', 'ben', 'red', 'cem', 'dora', 'partner', 'helfer', 'eva']) {
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

	// ---------- 8.2 ----------
	it('Freigabestufe „Mitglieder meiner Gruppen“: nur offene/Beitritts-Gruppen ohne Pseudonym', async () => {
		await sql`update user_profiles set display_name = 'Dora', can_help = 'Fahrrad reparieren', visibility = ${sql.json({ display_name: 'mitglieder', can_help: 'gruppen', looking_for: 'kontakte', interests: 'kontakte', child_ages: 'kontakte', region: 'kontakte' })} where user_id = ${u.dora}`;
		expect(await relationOf(sql, u.eva, u.dora)).toBe('mitglied');
		expect((await cardForViewer(sql, u.dora, u.eva))?.card.canHelp).toBeNull();
		const [open] = await sql`insert into community_groups (slug, name, description, kind) values ('papas-findorff', 'Papas Findorff', 'Austausch für Väter', 'offen') returning id`;
		const [prot] = await sql`insert into community_groups (slug, name, description, kind) values ('alleinerziehend', 'Alleinerziehend', 'Geschützter Austausch', 'geschuetzt') returning id`;
		// gemeinsame geschützte Gruppe (mit Pseudonym) zählt nicht
		await sql`insert into group_members (group_id, user_id, status, pseudonym) values (${prot.id}, ${u.dora}, 'aktiv', 'Möwe'), (${prot.id}, ${u.eva}, 'aktiv', 'Kranich')`;
		expect(await relationOf(sql, u.eva, u.dora)).toBe('mitglied');
		// gemeinsame offene Gruppe zählt
		await sql`insert into group_members (group_id, user_id, status) values (${open.id}, ${u.dora}, 'aktiv'), (${open.id}, ${u.eva}, 'angefragt')`;
		expect(await relationOf(sql, u.eva, u.dora)).toBe('mitglied'); // nur angefragt
		await sql`update group_members set status = 'aktiv' where group_id = ${open.id} and user_id = ${u.eva}`;
		expect(await relationOf(sql, u.eva, u.dora)).toBe('gruppe');
		const c = await cardForViewer(sql, u.dora, u.eva);
		expect(c?.card.canHelp).toBe('Fahrrad reparieren');
		expect(c?.card.lookingFor).toBeNull();
		// Kontakte sehen „gruppen“-Felder auch
		const [a, b] = [u.dora, u.ben].sort();
		await sql`insert into contacts (user_a, user_b) values (${a}, ${b})`;
		expect((await cardForViewer(sql, u.dora, u.ben))?.card.canHelp).toBe('Fahrrad reparieren');
		// ohne Anmeldung nie
		expect((await cardForViewer(sql, u.dora, null))?.card.canHelp ?? null).toBeNull();
	});

	it('Aufnahme durch Partnerorganisation: nur Verwaltung einer verifizierten Einrichtung, nur Anfragen, keine Profile', async () => {
		const [org] = await sql`insert into organizations (slug, name, kind, status) values ('verband-ae', 'Verband Alleinerziehender', 'beratung', 'verifiziert') returning id`;
		const [unv] = await sql`insert into organizations (slug, name, kind, status) values ('neu-verein', 'Neuer Verein', 'verein', 'beantragt') returning id`;
		await sql`insert into org_members (org_id, user_id, role) values (${org.id}, ${u.partner}, 'admin'), (${org.id}, ${u.helfer}, 'redaktion')`;
		const base = { slug: 'ae-bremen', name: 'Alleinerziehend Bremen', description: 'Geschützter Austausch für Alleinerziehende', rules: null, kind: 'geschuetzt', topicKey: null, regionCode: null, admission: ['Was erhoffst du dir?'] };
		await expect(G.saveGroup(sql, u.red, null, { ...base, partnerOrgId: unv.id })).rejects.toBeInstanceOf(PostError);
		const gid = await G.saveGroup(sql, u.red, null, { ...base, partnerOrgId: org.id });
		expect(await G.isPartnerAdmitter(sql, u.partner, gid)).toBe(true);
		expect(await G.isPartnerAdmitter(sql, u.helfer, gid)).toBe(false); // Redaktion der Einrichtung reicht nicht
		expect((await G.partnerGroups(sql, u.partner)).map((g) => g.slug)).toEqual(['ae-bremen']);
		await G.join(sql, u.anna, gid, 'Lerche', ['Austausch mit anderen']);
		const [note] = await sql`select text, link from notifications where user_id = ${u.partner} and kind = 'gruppe'`;
		expect(note.text).toBe('Neue Aufnahmeanfrage für „Alleinerziehend Bremen“');
		expect(note.text).not.toContain('Lerche');
		const reqs = await G.pendingRequests(sql, u.partner, gid);
		expect(reqs.map((r) => [r.pseudonym, r.contactId])).toEqual([['Lerche', null]]);
		await expect(G.pendingRequests(sql, u.helfer, gid)).rejects.toBeInstanceOf(PostError);
		await expect(G.members(sql, u.partner, gid)).rejects.toBeInstanceOf(PostError); // keine Mitgliederliste
		await G.decideRequest(sql, u.partner, gid, u.anna, true);
		const [m] = await sql`select status, application from group_members where group_id = ${gid} and user_id = ${u.anna}`;
		expect(m.status).toBe('aktiv');
		expect(m.application).toBeNull();
		const [log] = await sql`select meta from audit_log where action = 'group.member.accepted' order by at desc limit 1`;
		expect(log.meta.via).toBe('partner');
		// Einrichtung pausiert → Recht weg
		await sql`update organizations set status = 'pausiert' where id = ${org.id}`;
		expect(await G.isPartnerAdmitter(sql, u.partner, gid)).toBe(false);
		await sql`update organizations set status = 'verifiziert' where id = ${org.id}`;
		// Offene Gruppe: Partner wird nicht gespeichert
		const oid = await G.saveGroup(sql, u.red, null, { ...base, slug: 'offen-x', kind: 'offen', partnerOrgId: org.id });
		const [og] = await sql`select partner_org_id from community_groups where id = ${oid}`;
		expect(og.partner_org_id).toBeNull();
	});

	it('Hinweise von Mitgliedern: Vorschlag → Prüfung → sichtbar als „Mitglied“; Ablehnung mit Grund', async () => {
		const i = { kind: 'sperrung', title: 'Gehweg vor der Kita gesperrt', body: 'Bis Freitag Baustelle.', regionCode: '04011:st:1', sourceUrl: null, days: 7 };
		await expect(N.proposeNotice(sql, u.eva, { ...i, kind: 'leistung' })).rejects.toBeInstanceOf(PostError);
		await expect(N.proposeNotice(sql, u.eva, { ...i, regionCode: null })).rejects.toBeInstanceOf(PostError);
		await expect(N.proposeNotice(sql, u.eva, { ...i, body: 'Ruft mich an: 0151 23456789' })).rejects.toBeInstanceOf(PostError);
		const id = await N.proposeNotice(sql, u.eva, i);
		expect((await N.listNotices(sql, { region: '04011:st:1' })).notices.map((n) => n.title)).not.toContain(i.title);
		expect((await N.pendingProposals(sql, u.anna)).length).toBe(0); // kein Recht
		const p = await N.pendingProposals(sql, u.red);
		expect(p.map((x) => x.id)).toEqual([id]);
		await expect(N.reviewProposal(sql, u.anna, id, true, '')).rejects.toBeInstanceOf(PostError);
		await N.reviewProposal(sql, u.red, id, true, '');
		const vis = (await N.listNotices(sql, { region: '04011:st:1' })).notices.find((n) => n.id === id);
		expect(vis?.sourceKind).toBe('mitglied');
		const [nt] = await sql`select text from notifications where user_id = ${u.eva} and kind = 'hinweis'`;
		expect(nt.text).toContain('jetzt sichtbar');
		// Ablehnen nur mit Grund
		const id2 = await N.proposeNotice(sql, u.eva, { ...i, title: 'Kita macht zu (Gerücht)' });
		await expect(N.reviewProposal(sql, u.red, id2, false, '')).rejects.toBeInstanceOf(PostError);
		await N.reviewProposal(sql, u.red, id2, false, 'Bitte mit Quelle');
		expect((await N.myProposals(sql, u.eva)).find((x) => x.id === id2)?.note).toBe('Bitte mit Quelle');
		// höchstens 3 pro Tag
		await N.proposeNotice(sql, u.eva, { ...i, title: 'Dritter Hinweis heute' });
		await expect(N.proposeNotice(sql, u.eva, { ...i, title: 'Vierter Hinweis heute' })).rejects.toBeInstanceOf(PostError);
		// eigenen Hinweis beenden
		await N.archiveNotice(sql, u.eva, id);
		expect((await N.listNotices(sql, { region: '04011:st:1' })).notices.find((n) => n.id === id)).toBeUndefined();
		// Export + Löschung
		const x = (await exportAccount(sql, u.eva)) as unknown as { hinweise_vorgeschlagen: unknown[] };
		expect(x.hinweise_vorgeschlagen.length).toBe(3);
		await deleteAccount(sql, u.eva);
		expect((await sql`select 1 from notices where source_kind = 'mitglied'`).length).toBe(0);
	});

	// ---------- 8.3 ----------
	it('Rechtstexte: Entwurf aus Systemfunktionen, Prüfung nur mit Pflichtangaben, Änderung hebt Prüfung auf', async () => {
		const LG = await import('../src/lib/server/legal');
		let l = await LG.getLegal(sql);
		expect(LG.imprintComplete(l.imprint)).toBe(false);
		const draft = LG.privacyDraft(l, 'https://kinder.example.org');
		expect(draft).toContain('[Name/Firma – fehlt, bitte in der Verwaltung eintragen]');
		expect(draft).toContain('Ende-zu-Ende-verschlüsselt');
		expect(draft).toContain('14 Tage');
		const blocks = LG.legalBlocks(draft);
		expect(blocks.filter((b) => b.t === 'h').length).toBeGreaterThan(8);
		const base = { hosting: 'Testhoster', authority: 'Testbehörde', imprintExtra: '', privacyText: null, resetPrivacy: true, note: null };
		await expect(LG.saveLegal(sql, u.red, { ...base, imprint: { provider: 'Betreiber' }, checked: true })).rejects.toBeInstanceOf(LG.LegalError);
		await expect(LG.saveLegal(sql, u.red, { ...base, imprint: { provider: 'B', street: 'S 1', city: '28195 Bremen', email: 'kein-mail' }, checked: false })).rejects.toBeInstanceOf(LG.LegalError);
		l = await LG.saveLegal(sql, u.red, { ...base, imprint: { provider: 'Betreiber e. V.', street: 'Weg 1', city: '28195 Bremen', email: 'info@example.org' }, checked: true, note: 'geprüft' });
		expect(l.checked_at).not.toBeNull();
		expect(l.checked_by).toMatch(/^[0-9A-Z]{3}-[0-9A-Z]{3}-[0-9A-Z]{3}$/); // Familien-ID, nie E-Mail
		expect(LG.privacyDraft(l, 'x')).toContain('Betreiber e. V., Weg 1, 28195 Bremen');
		// unverändert speichern → bleibt geprüft; Inhalt ändern → Prüfung weg
		l = await LG.saveLegal(sql, u.red, { ...base, imprint: {}, checked: false });
		expect(l.checked_at).not.toBeNull();
		l = await LG.saveLegal(sql, u.red, { ...base, imprint: { phone: '0421 000' }, checked: false });
		expect(l.checked_at).toBeNull();
		// eigener Text
		l = await LG.saveLegal(sql, u.red, { ...base, resetPrivacy: false, privacyText: '## Eigene Fassung\nText', imprint: {}, checked: false });
		expect(LG.legalBlocks(l.privacy_text!)).toEqual([{ t: 'h', text: 'Eigene Fassung' }, { t: 'p', text: 'Text' }]);
	});

	// ---------- Abschnitt 9 / Sammel-Update ----------
	it('Stadtteile Niedersachsen: OSM-Stadtteile werden der amtlichen Gemeinde zugeordnet, fremde übersprungen', async () => {
		const { importOsmDistricts } = await import('../src/lib/server/import/regions');
		await sql`insert into regions (code, name, level, parent_code, source, geom) values
			('03241', 'Region Hannover', 'kreis', '03', 'Test', ST_Multi(ST_MakeEnvelope(9.6, 52.3, 9.9, 52.45, 4326))),
			('03241001', 'Hannover', 'gemeinde', '03241', 'Test', ST_Multi(ST_MakeEnvelope(9.65, 52.32, 9.85, 52.43, 4326)))
			on conflict (code) do nothing`;
		const sq = (w: number, s: number, e: number, n: number) => [{ lat: s, lon: w }, { lat: s, lon: e }, { lat: n, lon: e }, { lat: n, lon: w }, { lat: s, lon: w }];
		const els = [
			{ type: 'relation', id: 111, tags: { name: 'List', boundary: 'administrative', admin_level: '10' }, members: [{ type: 'way', role: 'outer', geometry: sq(9.74, 52.39, 9.77, 52.41) }] },
			{ type: 'relation', id: 222, tags: { name: 'Findorff (Bremen)' }, members: [{ type: 'way', role: 'outer', geometry: sq(8.79, 53.09, 8.81, 53.1) }] }
		];
		let query = '';
		const fake = (async (_u: string, init: RequestInit) => {
			query = decodeURIComponent(new URLSearchParams(String(init.body)).get('data') ?? '');
			return new Response(JSON.stringify({ elements: els }), { status: 200, headers: { 'content-type': 'application/json' } });
		}) as unknown as typeof fetch;
		const r = await importOsmDistricts(sql, { iso: 'DE-NI', admin_level: 10 }, { userAgent: 'test', endpoints: ['http://x/api'], fetchImpl: fake, retries: 1 });
		expect(query).toContain('"ISO3166-2"="DE-NI"');
		expect(r.counts).toEqual({ stadtteile: 1, uebersprungen: 1 });
		const [st] = await sql`select name, parent_code, level from regions where code = '03241001:st:111'`;
		expect(st).toEqual({ name: 'List', parent_code: '03241001', level: 'stadtteil' });
		const [src] = await sql`select config from data_sources where key = 'osm-stadtteile-ni'`;
		expect(src.config).toEqual({ type: 'osm-stadtteile', iso: 'DE-NI', admin_level: 10 });
		const [orte] = await sql`select config->'areas' as a from data_sources where key = 'osm-spielplaetze'`;
		expect((orte.a as string[]).length).toBe(16); // F-015: ganz Deutschland
	});

	it('Familie verbinden: beidseitig, Sichtbarkeit nach beiden Profilen, gemeinsam schreiben nur mit Kontakt', async () => {
		const Fm = await import('../src/lib/server/family');
		const { cardForViewer } = await import('../src/lib/server/cards');
		const [pa] = await sql`select contact_id from user_profiles where user_id = ${u.anna}`;
		await expect(Fm.requestLink(sql, u.ben, 'ZZZ-ZZZ-ZZZ', 'partnerschaft')).rejects.toBeInstanceOf(Fm.FamilyError);
		await Fm.requestLink(sql, u.ben, pa.contact_id, 'partnerschaft');
		await expect(Fm.requestLink(sql, u.ben, pa.contact_id, 'familie')).rejects.toBeInstanceOf(Fm.FamilyError); // doppelt
		const inc = (await Fm.myLinks(sql, u.anna)).find((l) => l.incoming)!;
		await expect(Fm.respondLink(sql, u.ben, inc.id, true)).rejects.toBeInstanceOf(Fm.FamilyError); // nicht selbst bestätigen
		// vor Bestätigung nirgends sichtbar
		const vis = { display_name: 'mitglieder', can_help: 'kontakte', looking_for: 'kontakte', interests: 'kontakte', child_ages: 'kontakte', region: 'kontakte', family: 'mitglieder' };
		await sql`update user_profiles set display_name = 'Anna', visibility = ${sql.json(vis)} where user_id = ${u.anna}`;
		await sql`update user_profiles set display_name = 'Ben', visibility = ${sql.json(vis)} where user_id = ${u.ben}`;
		expect((await cardForViewer(sql, u.anna, u.red))?.card.family).toEqual([]);
		await Fm.respondLink(sql, u.anna, inc.id, true);
		let c = await cardForViewer(sql, u.anna, u.red);
		expect(c?.card.family?.map((f) => [f.name, f.kind])).toEqual([['Ben', 'Familie']]); // F-029: alte „Partnerschaft“ heißt jetzt auch Familie
		expect(c?.writeTogether).toBeNull(); // red ist kein Kontakt
		// Ben schränkt ein → auf Annas Karte nicht mehr sichtbar
		await sql`update user_profiles set visibility = ${sql.json({ ...vis, family: 'kontakte' })} where user_id = ${u.ben}`;
		expect((await cardForViewer(sql, u.anna, u.red))?.card.family).toEqual([]);
		expect((await cardForViewer(sql, u.anna, null))?.card.family).toEqual([]); // ohne Anmeldung nie
		// Kontakt beider → sichtbar + gemeinsam schreiben
		for (const o of [u.anna, u.ben]) { const [a, b] = [u.red, o].sort(); await sql`insert into contacts (user_a, user_b) values (${a}, ${b}) on conflict do nothing`; }
		c = await cardForViewer(sql, u.anna, u.red);
		expect(c?.card.family?.length).toBe(1);
		expect(c?.writeTogether?.length).toBe(2);
		// lösen
		await Fm.removeLink(sql, u.ben, inc.id);
		expect((await Fm.myLinks(sql, u.anna)).length).toBe(0);
	});

	it('E-Mail für niemanden in der Verwaltung, Nachricht der Verwaltung über Familien-ID', async () => {
		const M = await import('../src/lib/server/adminmsg');
		const { PostError: PE } = await import('../src/lib/server/community/posts');
		const [pb] = await sql`select contact_id from user_profiles where user_id = ${u.ben}`;
		await expect(M.messageUser(sql, u.red, { contactId: pb.contact_id }, 'kurz')).rejects.toBeInstanceOf(PE);
		await expect(M.messageUser(sql, u.red, { contactId: 'AAA-AAA-AAA' }, 'Bitte keine Telefonnummern posten.')).rejects.toBeInstanceOf(PE);
		await M.messageUser(sql, u.red, { contactId: pb.contact_id }, 'Bitte keine Telefonnummern posten.');
		const [n] = await sql`select text from notifications where user_id = ${u.ben} and kind = 'verwaltung'`;
		expect(n.text).toBe('Nachricht der Verwaltung: Bitte keine Telefonnummern posten.');
		const [a] = await sql`select meta from audit_log where action = 'user.messaged' order by at desc limit 1`;
		expect(a.meta).toEqual({ chars: 'Bitte keine Telefonnummern posten.'.length, case: null }); // Länge, nicht der Text
		expect(await M.canMessage(sql, u.red)).toBe(true);
		expect(await M.canMessage(sql, u.anna)).toBe(false);
		// Freigaben zeigen Familien-IDs, nie E-Mail
		const A2 = await import('../src/lib/server/approvals');
		const list = await A2.listApprovals(sql, u.red);
		expect(JSON.stringify(list)).not.toMatch(/@example\.org/);
	});
});

