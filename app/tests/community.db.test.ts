// Community gegen echte Datenbank. Testdaten sind künstlich.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';

process.env.MEDIA_DIR = '/tmp/kd-media-test';
process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Community (Datenbank)', async () => {
	const P = await import('../src/lib/server/community/posts');
	const G = await import('../src/lib/server/community/groups');
	const M = await import('../src/lib/server/community/moderation');
	const K = await import('../src/lib/server/community/knowledge');
	const R = await import('../src/lib/server/community/reviews');
	const { deleteAccount } = await import('../src/lib/server/account');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	let protectedGroup = '';
	let openGroup = '';
	const post = (by: string, extra: Partial<Parameters<typeof P.createPost>[2]> = {}) =>
		P.createPost(sql, by, { kind: 'frage', title: 'Wie lange dauert die Eingewöhnung?', body: 'Bei uns in Findorff …', topicKey: 'betreuung', regionCode: null, groupId: null, placeId: null, labels: [], tags: [], linkUrl: null, poll: null, images: [], ...extra });

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		for (const n of ['anna', 'ben', 'cem', 'dora', 'mod', 'gmod', 'red']) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
			await sql`update user_profiles set display_name = ${n} where user_id = ${x.id}`;
		}
		await sql`insert into regions (code, name, level, parent_code, source) values ('04011:st:1', 'Findorff', 'stadtteil', '04011', 'Test'), ('04011:st:2', 'Neustadt', 'stadtteil', '04011', 'Test')`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.mod}, 'moderator_regional', 'region', '04011:st:1')`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.red}, 'data_editor', 'global', null)`;
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.dora}, 'moderator_global', 'global', null)`;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Themen sind angelegt', async () => {
		const t = await sql`select key from topics`;
		expect(t.map((x) => x.key)).toEqual(expect.arrayContaining(['erziehung', 'kinderarzt', 'betreuung', 'alleinerziehende', 'produkte', 'lokale-hilfe']));
	});

	it('Beitrag braucht Thema, Region oder Gruppe; Titel geprüft', async () => {
		await expect(post(u.anna, { topicKey: null })).rejects.toBeInstanceOf(P.PostError);
		await expect(post(u.anna, { title: 'x' })).rejects.toBeInstanceOf(P.PostError);
	});

	it('Feed: Abo auf Region schließt Stadtteile ein; ohne Abo alles Neue', async () => {
		const { id } = await post(u.anna, { regionCode: '04011:st:1', topicKey: null, title: 'Spielgruppe in Findorff gesucht' });
		await post(u.anna, { title: 'Allgemeine Frage zur Kita' });
		const none = await P.feed(sql, u.ben, { mode: 'abos' });
		expect(none.subsNone).toBe(true);
		await P.setSubscription(sql, u.ben, 'region', '04011', true);
		const f = await P.feed(sql, u.ben, { mode: 'abos' });
		expect(f.items.map((i) => i.id)).toEqual([id]);
		await P.setSubscription(sql, u.ben, 'topic', 'betreuung', true);
		expect((await P.feed(sql, u.ben, { mode: 'abos' })).items.length).toBe(2);
		const s = await P.feed(sql, u.ben, { mode: 'neu', q: 'Spielgruppe' });
		expect(s.items[0].title).toContain('Spielgruppe');
	});

	it('Private Daten: Beitrag wird zurückgehalten und landet in der Moderation', async () => {
		const r = await post(u.anna, { body: 'Meldet euch: 0151 23456789', regionCode: '04011:st:1' });
		expect(r.held).toBeTruthy();
		expect(await P.getPost(sql, u.ben, r.id)).toBeNull();
		expect((await P.getPost(sql, u.anna, r.id))?.status).toBe('pruefung');
		const q = await M.queue(sql, u.mod, {});
		expect(q.some((c) => c.targetId === r.id && c.reason === 'private_daten')).toBe(true);
		// Regionale Moderation Findorff sieht nichts aus Neustadt
		const r2 = await post(u.anna, { body: 'Ruf an 0421 9876543', regionCode: '04011:st:2' });
		expect((await M.queue(sql, u.mod, {})).some((c) => c.targetId === r2.id)).toBe(false);
		// Freigabe macht ihn sichtbar
		const c = q.find((x) => x.targetId === r.id)!;
		await M.decide(sql, u.mod, c.id, 'freigeben', 'Eigene Nummer, bewusst geteilt');
		expect((await P.getPost(sql, u.ben, r.id))?.status).toBe('sichtbar');
	});

	it('Antworten, hilfreich, Lösung, Mitteilung an die Fragende', async () => {
		const { id } = await post(u.anna, { title: 'Welche Kinderärztin in der Neustadt?' });
		const a = await P.addComment(sql, u.ben, id, 'Wir sind sehr zufrieden mit der Praxis am Markt.');
		await P.toggleHelpful(sql, u.cem, a.id);
		await expect(P.toggleHelpful(sql, u.ben, a.id)).rejects.toBeInstanceOf(P.PostError);
		await expect(P.markSolved(sql, u.ben, id, a.id)).rejects.toBeInstanceOf(P.PostError);
		await P.markSolved(sql, u.anna, id, a.id);
		const p = await P.getPost(sql, u.cem, id);
		expect(p?.solvedComment).toBe(a.id);
		expect(p?.comments[0].helpful).toBe(1);
		const [n] = await sql`select count(*)::int as n from notifications where user_id = ${u.anna} and kind = 'antwort'`;
		expect(n.n).toBe(1);
		expect((await P.feed(sql, u.cem, { mode: 'geloest' })).items.some((i) => i.id === id)).toBe(true);
	});

	it('Umfrage: eine Stimme je Person, Ergebnisse gezählt', async () => {
		const { id } = await post(u.anna, { kind: 'umfrage', title: 'Wann geht ihr auf den Spielplatz?', poll: { options: ['morgens', 'nachmittags'], multiple: false, days: 7 } });
		await P.vote(sql, u.ben, id, [1]);
		await P.vote(sql, u.cem, id, [1]);
		await P.vote(sql, u.cem, id, [0]);
		await expect(P.vote(sql, u.ben, id, [0, 1])).rejects.toBeInstanceOf(P.PostError);
		expect((await P.getPost(sql, u.anna, id))?.poll?.counts).toEqual([1, 1]);
	});

	it('Geschützte Gruppe: Aufnahme mit Pseudonym, für Fremde unsichtbar, Pseudonym nicht verknüpfbar', async () => {
		protectedGroup = await G.saveGroup(sql, u.dora, null, { slug: 'alleinerziehende-hb', name: 'Alleinerziehende Bremen', description: 'Geschützter Austausch für Alleinerziehende.', rules: null, kind: 'geschuetzt', topicKey: 'alleinerziehende', regionCode: null, admission: ['Was erhoffst du dir?'] });
		await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id) values (${u.gmod}, 'group_moderator', 'group', ${protectedGroup})`;
		await expect(G.join(sql, u.anna, protectedGroup, null, ['x'])).rejects.toBeInstanceOf(P.PostError);
		expect(await G.join(sql, u.anna, protectedGroup, 'Möwe', ['Austausch'])).toBe('angefragt');
		await expect(P.createPost(sql, u.anna, { kind: 'beitrag', title: 'Hallo zusammen', body: 'x', topicKey: null, regionCode: null, groupId: protectedGroup, placeId: null, labels: [], tags: [], linkUrl: null, poll: null, images: [] })).rejects.toBeInstanceOf(P.PostError);
		// Globale Moderation ist NICHT automatisch zuständig
		await expect(G.pendingRequests(sql, u.dora, protectedGroup)).rejects.toBeInstanceOf(P.PostError);
		const req = await G.pendingRequests(sql, u.gmod, protectedGroup);
		expect(req[0]).toMatchObject({ pseudonym: 'Möwe', contactId: null });
		await G.decideRequest(sql, u.gmod, protectedGroup, u.anna, true);
		const [app] = await sql`select application from group_members where group_id = ${protectedGroup} and user_id = ${u.anna}`;
		expect(app.application).toBeNull();
		const { id } = await P.createPost(sql, u.anna, { kind: 'beitrag', title: 'Wie schafft ihr das mit dem Umgang?', body: 'Erfahrungen?', topicKey: null, regionCode: null, groupId: protectedGroup, placeId: null, labels: [], tags: [], linkUrl: null, poll: null, images: [] });
		expect(await P.getPost(sql, u.ben, id)).toBeNull();
		expect((await P.feed(sql, u.ben, { mode: 'neu' })).items.some((i) => i.id === id)).toBe(false);
		expect((await P.feed(sql, u.ben, { mode: 'neu', q: 'Umgang' })).items.length).toBe(0);
		const mine = await P.getPost(sql, u.anna, id);
		expect(mine?.author).toMatchObject({ name: 'Möwe', pseudonym: true, contactId: null });
		const list = await G.listGroups(sql, u.ben);
		expect(list.find((g) => g.id === protectedGroup)?.members).toBeNull();
		// Meldung in der geschützten Gruppe: nur Gruppenmoderation sieht den Fall
		await G.join(sql, u.cem, protectedGroup, 'Kranich', ['Hilfe']);
		await G.decideRequest(sql, u.gmod, protectedGroup, u.cem, true);
		await M.report(sql, u.cem, 'post', id, 'unangemessen', null);
		expect((await M.queue(sql, u.dora, {})).some((c) => c.targetId === id)).toBe(false);
		expect((await M.queue(sql, u.gmod, {})).some((c) => c.targetId === id)).toBe(true);
	});

	it('Offene Gruppe: Beitritt sofort', async () => {
		openGroup = await G.saveGroup(sql, u.dora, null, { slug: 'radfahren-bremen', name: 'Radfahren mit Kindern', description: 'Touren, Anhänger, Laufräder.', rules: null, kind: 'offen', topicKey: 'freizeit', regionCode: '04011', admission: [] });
		expect(await G.join(sql, u.ben, openGroup, null, [])).toBe('aktiv');
		await expect(G.saveGroup(sql, u.ben, null, { slug: 'xyz-gruppe', name: 'Test', description: 'Testgruppe hier', rules: null, kind: 'offen', topicKey: null, regionCode: null, admission: [] })).rejects.toBeInstanceOf(P.PostError);
	});

	it('Moderation: Entfernen mit Begründung, Mitteilung, Einspruch, Wiederherstellen', async () => {
		const { id } = await post(u.cem, { title: 'Totaler Quatsch hier', regionCode: '04011:st:1' });
		await M.report(sql, u.ben, 'post', id, 'unangemessen', 'beleidigend');
		await M.report(sql, u.ben, 'post', id, 'unangemessen', 'nochmal');
		const cases = (await M.queue(sql, u.mod, {})).filter((c) => c.targetId === id);
		expect(cases.length).toBe(1);
		await expect(M.decide(sql, u.mod, cases[0].id, 'entfernen', '')).rejects.toBeInstanceOf(P.PostError);
		await M.decide(sql, u.mod, cases[0].id, 'entfernen', 'Verstößt gegen die Regeln');
		const [p] = await sql`select status, mod_note, title from posts where id = ${id}`;
		expect(p).toMatchObject({ status: 'entfernt', mod_note: 'Verstößt gegen die Regeln', title: 'Totaler Quatsch hier' });
		const [note] = await sql`select text from notifications where user_id = ${u.cem} and kind = 'moderation'`;
		expect(note.text).toContain('Verstößt gegen die Regeln');
		await expect(M.appeal(sql, u.ben, 'post', id, 'Das war doch ok so')).rejects.toBeInstanceOf(P.PostError);
		await M.appeal(sql, u.cem, 'post', id, 'Das war nicht beleidigend gemeint.');
		await expect(M.appeal(sql, u.cem, 'post', id, 'Nochmal Einspruch dazu')).rejects.toBeInstanceOf(P.PostError);
		const ap = (await M.queue(sql, u.mod, {})).find((c) => c.targetId === id && c.source === 'einspruch')!;
		await M.decide(sql, u.mod, ap.id, 'wiederherstellen', 'Einspruch berechtigt');
		expect((await sql`select status from posts where id = ${id}`)[0].status).toBe('sichtbar');
		const [a] = await sql`select count(*)::int as n from audit_log where action like 'mod.%'`;
		expect(a.n).toBeGreaterThan(1);
	});

	it('Einschränkung: stummgeschaltete Person kann nicht schreiben; Sperren nur Betreiber', async () => {
		const { id } = await post(u.cem, { regionCode: '04011:st:1', title: 'Noch ein Beitrag von Cem' });
		await M.report(sql, u.ben, 'post', id, 'spam', null);
		const c = (await M.queue(sql, u.mod, {})).find((x) => x.targetId === id)!;
		await M.decide(sql, u.mod, c.id, 'stumm', 'Wiederholt Werbung', { days: 3 });
		await expect(post(u.cem)).rejects.toThrow(/eingeschränkt/);
		await expect(P.addComment(sql, u.cem, id, 'Hallo')).rejects.toThrow(/eingeschränkt/);
		await M.report(sql, u.ben, 'post', id, 'spam', 'weiter');
		const c2 = (await M.queue(sql, u.mod, {})).find((x) => x.targetId === id)!;
		await expect(M.decide(sql, u.mod, c2.id, 'sperren', 'Spam')).rejects.toThrow(/Betreiber/);
	});

	it('Wissen: aus Beitrag nur mit Zustimmung, nie aus Gruppen', async () => {
		const { id } = await post(u.anna, { title: 'Kita-Gutschein beantragen – so ging es bei uns' });
		await expect(K.draftFromPost(sql, u.ben, id)).rejects.toBeInstanceOf(P.PostError);
		const [gp] = await sql`select id from posts where group_id = ${protectedGroup} limit 1`;
		await expect(K.draftFromPost(sql, u.red, gp.id)).rejects.toThrow(/Gruppen/);
		const slug = await K.draftFromPost(sql, u.red, id);
		const [k] = await sql`select id, consent from knowledge where slug = ${slug}`;
		expect(k.consent).toBe('angefragt');
		const input = { slug, title: 'Kita-Gutschein beantragen', summary: 'Schritt für Schritt erklärt, mit Fristen.', body: 'Text', sources: [{ title: 'Stadt', url: 'https://www.bremen.de/' }], topicKey: 'betreuung', regionCode: null, visibility: 'oeffentlich', publish: true };
		await expect(K.saveKnowledge(sql, u.red, k.id, input)).rejects.toThrow(/Zustimmung/);
		expect(await K.consentInfo(sql, u.ben, k.id)).toBeNull();
		await K.giveConsent(sql, u.anna, k.id, true);
		await K.saveKnowledge(sql, u.red, k.id, input);
		expect((await K.listKnowledge(sql, { member: false, editor: false })).map((x) => x.slug)).toContain(slug);
		await expect(K.saveKnowledge(sql, u.red, null, { ...input, slug: 'ohne-quelle', sources: [] })).rejects.toThrow(/Quelle/);
	});

	it('Ortsbewertung und -foto: Foto erst nach Freigabe öffentlich, ohne Metadaten', async () => {
		const [pl] = await sql`insert into places (kind, name, location, region_code) values ('spielplatz', 'Testspielplatz', ST_SetSRID(ST_MakePoint(8.8, 53.09), 4326), '04011:st:1') returning id`;
		await R.saveReview(sql, u.anna, pl.id, 4, 'Schöner Sandkasten, wenig Schatten.');
		await R.saveReview(sql, u.anna, pl.id, 5, 'Doch super.');
		await expect(R.saveReview(sql, u.ben, pl.id, 7, null)).rejects.toBeInstanceOf(P.PostError);
		let e = await R.placeExperiences(sql, pl.id, null);
		expect(e).toMatchObject({ count: 1, avg: 5 });
		expect(JSON.stringify(e.reviews)).not.toContain(u.anna);
		const img = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#88aa55' } }).withMetadata({ exif: { IFD0: { Artist: 'Geheim' } } }).jpeg().toBuffer();
		const mid = await R.addPlacePhoto(sql, u.ben, pl.id, img, 'Klettergerüst');
		expect((await R.placeExperiences(sql, pl.id, null)).photos.length).toBe(0);
		expect(await P.canSeeMedia(sql, null, mid)).toBe(false);
		const c = (await M.queue(sql, u.mod, {})).find((x) => x.targetId === mid)!;
		expect(c.reason).toBe('neues_ortsfoto');
		await M.decide(sql, u.mod, c.id, 'freigeben', 'Keine Personen erkennbar');
		e = await R.placeExperiences(sql, pl.id, null);
		expect(e.photos.length).toBe(1);
		expect(await P.canSeeMedia(sql, null, mid)).toBe(true);
		const { readImage } = await import('../src/lib/server/community/media');
		const meta = await sharp((await readImage(mid))!).metadata();
		expect(meta.format).toBe('webp');
		expect(meta.exif).toBeUndefined();
	});

	it('Kontolöschung: Texte weg, Mitgliedschaften und Bewertungen gelöscht', async () => {
		await deleteAccount(sql, u.anna);
		const [p] = await sql`select count(*)::int as n from posts where author_id = ${u.anna} and (body <> '' or status <> 'entfernt')`;
		expect(p.n).toBe(0);
		const [g] = await sql`select count(*)::int as n from group_members where user_id = ${u.anna}`;
		expect(g.n).toBe(0);
		const [r] = await sql`select count(*)::int as n from place_reviews where user_id = ${u.anna}`;
		expect(r.n).toBe(0);
		// Auch wer Antworten geschrieben hat, kann löschen (Antworttext wird ersetzt, nicht geleert)
		const [{ n: before }] = await sql`select count(*)::int as n from comments where author_id = ${u.ben}`;
		expect(before).toBeGreaterThan(0);
		await deleteAccount(sql, u.ben);
		const [c] = await sql`select count(*)::int as n from comments where author_id = ${u.ben} and (body <> '[gelöscht]' or status <> 'entfernt')`;
		expect(c.n).toBe(0);
	});
});
