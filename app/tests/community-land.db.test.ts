// F-023: Community nach „Ganz Deutschland“ und Bundesland, Einladung in einzelne Beiträge. Künstliche Testkonten.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

process.env.MEDIA_DIR = '/tmp/kd-media-test';
process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Community nach Bundesland (F-023)', async () => {
	const P = await import('../src/lib/server/community/posts');
	const { checkLandChange, ensureProfile, updateProfile } = await import('../src/lib/server/profiles');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const cid: Record<string, string> = {};
	const post = (by: string, extra: Partial<Parameters<typeof P.createPost>[2]> = {}) =>
		P.createPost(sql, by, { kind: 'frage', title: 'Laternenumzug in Findorff – wer kommt mit?', body: 'Am Freitag …', topicKey: 'lokale-hilfe', regionCode: null, groupId: null, placeId: null, labels: [], tags: [], linkUrl: null, poll: null, images: [], ...extra });

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		await sql`insert into regions (code, name, level, parent_code, source) values ('04011', 'Bremen', 'gemeinde', '04', 'Test'), ('04011:st:1', 'Findorff', 'stadtteil', '04011', 'Test') on conflict do nothing`;
		// hb1/hb2: Bremen (Stadtteil bzw. Land), by: Bayern, ni: Niedersachsen, none: ohne Wohnregion
		for (const [n, region] of [['hb1', '04011:st:1'], ['hb2', '04'], ['by', '09'], ['ni', '03'], ['none', null]] as const) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
			await sql`update user_profiles set display_name = ${n}, region_code = ${region} where user_id = ${x.id}`;
			const [p] = await sql`select contact_id from user_profiles where user_id = ${x.id}`;
			cid[n] = p.contact_id;
		}
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Bundesland aus der Wohnregion (Stadtteil → Land)', async () => {
		expect(await P.userLand(sql, u.hb1)).toEqual({ code: '04', name: 'Bremen' });
		expect((await P.userLand(sql, u.by))?.code).toBe('09');
		expect(await P.userLand(sql, u.none)).toBeNull();
	});

	let local = '';
	let global = '';
	it('„Nur mein Bundesland“: nur gleiches Land liest; ohne Wohnregion nicht möglich; Region muss im Land liegen', async () => {
		local = (await post(u.hb1, { landOnly: true, regionCode: '04011:st:1' })).id;
		global = (await post(u.hb1, { title: 'Allgemeine Frage für alle', landOnly: false })).id;
		const [row] = await sql`select land_code from posts where id = ${local}`;
		expect(row.land_code).toBe('04');
		await expect(post(u.none, { landOnly: true })).rejects.toThrow(/Wohnregion/);
		await expect(post(u.hb1, { landOnly: true, regionCode: '03' })).rejects.toThrow(/liegt nicht in Bremen/);
		expect(await P.getPost(sql, u.hb1, local)).not.toBeNull();
		expect(await P.getPost(sql, u.hb2, local)).not.toBeNull();
		expect(await P.getPost(sql, u.by, local)).toBeNull();
		expect(await P.getPost(sql, u.none, local)).toBeNull();
		await expect(P.addComment(sql, u.by, local, 'Ich will mitreden')).rejects.toThrow(/nicht gefunden/);
		await expect(P.toggleBookmark(sql, u.by, local)).rejects.toThrow(/nicht gefunden/);
		expect(await P.getPost(sql, u.by, global)).not.toBeNull();
	});

	it('Feeds: Reiter Land zeigt Landes-Beiträge, Reiter Deutschland nicht; Suche findet Fremdes nicht', async () => {
		const ids = (f: Awaited<ReturnType<typeof P.feed>>) => f.items.map((i) => i.id);
		const hbLand = await P.feed(sql, u.hb2, { mode: 'neu', scope: 'land' });
		expect(ids(hbLand)).toContain(local);
		expect(ids(hbLand)).not.toContain(global);
		expect(hbLand.items.find((i) => i.id === local)?.land).toEqual({ code: '04', name: 'Bremen', invited: false });
		const hbDe = await P.feed(sql, u.hb2, { mode: 'neu', scope: 'de' });
		expect(ids(hbDe)).toContain(global);
		expect(ids(hbDe)).not.toContain(local);
		const byDe = await P.feed(sql, u.by, { mode: 'neu', scope: 'de' });
		expect(ids(byDe)).toContain(global);
		expect(ids(byDe)).not.toContain(local);
		const byLand = await P.feed(sql, u.by, { mode: 'neu', scope: 'land' });
		expect(ids(byLand)).not.toContain(local);
		const search = await P.feed(sql, u.by, { mode: 'neu', q: 'Laternenumzug' });
		expect(ids(search)).not.toContain(local);
		const noScope = await P.feed(sql, u.by, { mode: 'neu' });
		expect(ids(noScope)).not.toContain(local);
	});

	it('Einladung: Person aus Bayern liest und antwortet genau diesen Beitrag, bekommt eine Mitteilung', async () => {
		const other = (await post(u.hb2, { landOnly: true, title: 'Anderes Bremer Thema' })).id;
		const r = await P.inviteToPost(sql, u.hb2, local, cid.by.toLowerCase().replace(/(.{3})/g, '$1 '));
		expect(r.name).toBe('by');
		const [n] = await sql`select kind, text, link from notifications where user_id = ${u.by} order by created_at desc limit 1`;
		expect(n.kind).toBe('einladung_beitrag');
		expect(n.link).toBe(`/community/b/${local}`);
		expect(n.text).toContain('(Bremen)');
		const view = await P.getPost(sql, u.by, local);
		expect(view?.land).toEqual({ code: '04', name: 'Bremen', invited: true });
		await P.addComment(sql, u.by, local, 'Ich komme aus München zu Besuch – darf ich mit?');
		expect(await P.getPost(sql, u.by, other)).toBeNull();
		const byDe = await P.feed(sql, u.by, { mode: 'neu', scope: 'de' });
		expect(byDe.items.find((i) => i.id === local)?.land?.invited).toBe(true);
		// Verfasserin sieht, wer eingeladen ist und von wem
		const own = await P.getPost(sql, u.hb1, local);
		expect(own?.invites.map((i) => [i.name, i.by])).toEqual([['by', 'hb2']]);
		expect((await P.getPost(sql, u.hb2, local))?.invites).toEqual([]);
	});

	it('Einladung: Regeln (schon lesbar, unbekannt, blockiert, ganz-Deutschland-Beitrag, Tageslimit)', async () => {
		await expect(P.inviteToPost(sql, u.hb1, local, cid.hb2)).rejects.toThrow(/schon lesen/);
		await expect(P.inviteToPost(sql, u.hb1, local, 'AAA AAA AAA')).rejects.toThrow(/können wir nicht einladen|gültige/);
		await expect(P.inviteToPost(sql, u.hb1, local, 'unsinn')).rejects.toThrow(/gültige Familien-ID/);
		await expect(P.inviteToPost(sql, u.hb1, global, cid.ni)).rejects.toThrow(/ganz Deutschland/);
		await expect(P.inviteToPost(sql, u.ni, local, cid.hb1)).rejects.toThrow(/nicht gefunden/); // ni kann nicht lesen → darf nicht einladen
		await sql`insert into blocks (blocker, blocked) values (${u.ni}, ${u.hb1})`;
		await expect(P.inviteToPost(sql, u.hb2, local, cid.ni)).rejects.toThrow(/können wir nicht einladen/); // blockiert die Verfasserin
		await sql`delete from blocks where blocker = ${u.ni}`;
		await sql`insert into post_invites (post_id, user_id, invited_by, created_at) select ${local}, id, ${u.hb2}, now() from users where id not in (${u.hb1}, ${u.hb2}, ${u.by}) limit 1`;
		const extra = await Promise.all(
			Array.from({ length: P.INVITES_PER_DAY }, async (_, i) => {
				const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${'gast' + i + '@example.org'}, 'x', now()) returning id`;
				await ensureProfile(sql, x.id);
				const [p] = await sql`select contact_id from user_profiles where user_id = ${x.id}`;
				return p.contact_id as string;
			})
		);
		let ok = 0;
		let limited = false;
		for (const c of extra) {
			try {
				await P.inviteToPost(sql, u.hb2, local, c);
				ok++;
			} catch (e) {
				limited = /Höchstens 20/.test((e as Error).message);
				break;
			}
		}
		expect(limited).toBe(true);
		expect(ok).toBe(P.INVITES_PER_DAY - 2); // by + der direkt eingefügte zählen mit
	});

	it('Einladung zurücknehmen: nur Verfasserin, danach kein Zugriff mehr', async () => {
		await expect(P.revokeInvite(sql, u.hb2, local, u.by)).rejects.toThrow(/Nur die Verfasserin/);
		await P.revokeInvite(sql, u.hb1, local, u.by);
		expect(await P.getPost(sql, u.by, local)).toBeNull();
	});

	it('Bundesland höchstens einmal im Monat wechseln; Region im selben Land jederzeit; erstes Eintragen zählt nicht', async () => {
		const base = { displayName: 'x', canHelp: null, lookingFor: null, interests: [], childAges: [], discoverable: false, preset: 'zurueckhaltend' as const, visibility: {} as never };
		expect(await checkLandChange(sql, u.none, '04')).toBeNull();
		await updateProfile(sql, u.none, { ...base, regionCode: '04' });
		let [p] = await sql`select land_changed_at from user_profiles where user_id = ${u.none}`;
		expect(p.land_changed_at).toBeNull();
		expect(await checkLandChange(sql, u.none, '04011:st:1')).toBeNull(); // gleiches Land
		expect(await checkLandChange(sql, u.none, '09')).toBeNull(); // erster Wechsel erlaubt
		await updateProfile(sql, u.none, { ...base, regionCode: '09' });
		[p] = await sql`select land_changed_at from user_profiles where user_id = ${u.none}`;
		expect(p.land_changed_at).not.toBeNull();
		expect(await checkLandChange(sql, u.none, '04')).toMatch(/einmal im Monat/);
		await sql`update user_profiles set land_changed_at = now() - interval '31 days' where user_id = ${u.none}`;
		expect(await checkLandChange(sql, u.none, '04')).toBeNull();
	});

	it('Bestehende Beiträge ohne Land bleiben für alle sichtbar', async () => {
		const [old] = await sql`insert into posts (kind, title, topic_key, author_id) values ('frage', 'Alter Beitrag vor F-023', 'erziehung', ${u.ni}) returning id`;
		expect(await P.getPost(sql, u.by, old.id)).not.toBeNull();
		expect(await P.getPost(sql, u.hb1, old.id)).not.toBeNull();
	});
});
