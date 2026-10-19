// Chat-Regeln, Treffen-Tickets und Push-Gateway gegen echte Datenbank (ohne Chat-Server; der echte Ablauf läuft im Rauchtest).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';
process.env.PUSH_OUTBOX_DIR = '/tmp/kd-push-test';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Chat (Datenbank)', async () => {
	const { checkRule } = await import('../src/lib/server/chat/rules');
	const push = await import('../src/lib/server/push');
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const m: Record<string, string> = {};
	const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

	beforeAll(async () => {
		rmSync('/tmp/kd-push-test', { recursive: true, force: true });
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk', SYNAPSE_CONFIG_DIR: '' }, encoding: 'utf8' });
		const { ensureProfile } = await import('../src/lib/server/profiles');
		const lp = ['kaaaaaaaaaaaaaaa', 'kbbbbbbbbbbbbbbb', 'kccccccccccccccc', 'kddddddddddddddd'];
		for (const [i, n] of ['anna', 'ben', 'cem', 'dora'].entries()) {
			const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${n + '@example.org'}, 'x', now()) returning id`;
			u[n] = x.id;
			await ensureProfile(sql, x.id);
			await sql`insert into chat_accounts (user_id, localpart) values (${x.id}, ${lp[i]})`;
			m[n] = `@${lp[i]}:kinder-deutschlands`;
		}
		const [a, b] = pair(u.anna, u.ben);
		await sql`insert into contacts (user_a, user_b) values (${a}, ${b})`;
		await sql`insert into chat_rooms (room_id, kind, created_by, dm_a, dm_b) values ('!dm:kinder-deutschlands', 'direkt', ${u.anna}, ${a}, ${b})`;
		await sql`insert into chat_rooms (room_id, kind, created_by) values ('!gruppe:kinder-deutschlands', 'gruppe', ${u.anna})`;
		await sql`insert into chat_rooms (room_id, kind, created_by, expires_at, join_token_hash) values ('!treffen:kinder-deutschlands', 'treffen', ${u.anna}, now() + interval '2 hours', 'x')`;
	});
	afterAll(async () => {
		await sql.end();
	});

	it('Einladung nur an Kontakte; Direktchat nur für die zwei', async () => {
		expect((await checkRule(sql, { action: 'invite', inviter: m.anna, invitee: m.ben, room: '!neu' })).allow).toBe(true);
		expect(await checkRule(sql, { action: 'invite', inviter: m.anna, invitee: m.cem, room: '!neu' })).toEqual({ allow: false, why: 'kein_kontakt' });
		const [a, c] = pair(u.anna, u.cem);
		await sql`insert into contacts (user_a, user_b) values (${a}, ${c})`;
		expect((await checkRule(sql, { action: 'invite', inviter: m.anna, invitee: m.cem, room: '!gruppe:kinder-deutschlands' })).allow).toBe(true);
		expect(await checkRule(sql, { action: 'invite', inviter: m.anna, invitee: m.cem, room: '!dm:kinder-deutschlands' })).toEqual({ allow: false, why: 'direkt' });
		expect((await checkRule(sql, { action: 'invite', inviter: m.anna, invitee: '@kzzz:evil.example', room: '!neu' })).allow).toBe(false);
	});

	it('Beitritt: mit Einladung ja; ohne nur Treffen mit gültigem Ticket', async () => {
		expect((await checkRule(sql, { action: 'join', user: m.ben, room: '!gruppe:kinder-deutschlands', invited: true })).allow).toBe(true);
		expect((await checkRule(sql, { action: 'join', user: m.dora, room: '!gruppe:kinder-deutschlands', invited: false })).allow).toBe(false);
		expect(await checkRule(sql, { action: 'join', user: m.dora, room: '!treffen:kinder-deutschlands', invited: false })).toEqual({ allow: false, why: 'kein_ticket' });
		await sql`insert into chat_join_tickets (user_id, room_id, expires_at) values (${u.dora}, '!treffen:kinder-deutschlands', now() + interval '5 minutes')`;
		expect((await checkRule(sql, { action: 'join', user: m.dora, room: '!treffen:kinder-deutschlands', invited: false })).allow).toBe(true);
		await sql`update chat_join_tickets set expires_at = now() - interval '1 second' where user_id = ${u.dora}`;
		expect((await checkRule(sql, { action: 'join', user: m.dora, room: '!treffen:kinder-deutschlands', invited: false })).allow).toBe(false);
	});

	it('Senden: Blockieren stoppt Direktchat, Einschränkung gilt in Gruppen/Treffen, Ablauf beendet Treffen, Sperre alles', async () => {
		expect((await checkRule(sql, { action: 'send', user: m.ben, room: '!dm:kinder-deutschlands' })).allow).toBe(true);
		await sql`insert into blocks (blocker, blocked) values (${u.anna}, ${u.ben})`;
		expect(await checkRule(sql, { action: 'send', user: m.ben, room: '!dm:kinder-deutschlands' })).toEqual({ allow: false, why: 'blockiert' });
		await sql`delete from blocks`;
		await sql`insert into user_restrictions (user_id, kind, reason, until) values (${u.ben}, 'stumm', 'Test', now() + interval '1 day')`;
		expect((await checkRule(sql, { action: 'send', user: m.ben, room: '!dm:kinder-deutschlands' })).allow).toBe(true);
		expect(await checkRule(sql, { action: 'send', user: m.ben, room: '!gruppe:kinder-deutschlands' })).toEqual({ allow: false, why: 'eingeschraenkt' });
		await sql`update chat_rooms set expires_at = now() - interval '1 minute' where room_id = '!treffen:kinder-deutschlands'`;
		expect(await checkRule(sql, { action: 'send', user: m.dora, room: '!treffen:kinder-deutschlands' })).toEqual({ allow: false, why: 'beendet' });
		await sql`update users set status = 'suspended' where id = ${u.cem}`;
		expect((await checkRule(sql, { action: 'send', user: m.cem, room: '!gruppe:kinder-deutschlands' })).allow).toBe(false);
		expect((await checkRule(sql, { action: 'join', user: m.cem, room: '!gruppe:kinder-deutschlands', invited: true })).allow).toBe(false);
	});

	it('Push-Gateway: nur bekannte Schlüssel, nur ohne Inhalt, Ruhezeit und Abschalten respektiert', async () => {
		const key = await push.subscribe(sql, u.anna, { endpoint: 'https://push.example.org/a', keys: { p256dh: 'p', auth: 'a' } }, 'Test');
		const n = (extra: object = {}) => ({ notification: { event_id: '$e1', room_id: '!dm:kinder-deutschlands', counts: { unread: 1 }, devices: [{ app_id: push.PUSH_APP_ID, pushkey: key }, { app_id: push.PUSH_APP_ID, pushkey: 'unbekannt' }], ...extra } });
		const res = await push.gateway(sql, n());
		expect(res.rejected).toEqual(['unbekannt']);
		const files = readdirSync('/tmp/kd-push-test');
		expect(files.length).toBe(1);
		const sent = JSON.parse(readFileSync(`/tmp/kd-push-test/${files[0]}`, 'utf8'));
		expect(sent.payload).toEqual({ t: 'chat', title: 'Kinder Deutschlands', body: 'Neue Nachricht', url: '/nachrichten/chat/!dm%3Akinder-deutschlands', tag: 'chat' });
		// nur Zähler (ohne Ereignis) → kein Hinweis
		await push.gateway(sql, { notification: { counts: { unread: 0 }, devices: [{ app_id: push.PUSH_APP_ID, pushkey: key }] } });
		expect(readdirSync('/tmp/kd-push-test').length).toBe(1);
		// Ruhezeit rund um die Uhr
		const now = push.berlinMinutes();
		await push.saveSettings(sql, u.anna, { ...push.DEFAULTS, quiet_from: (now + 1439) % 1440, quiet_to: (now + 1) % 1440 });
		await push.gateway(sql, n());
		expect(readdirSync('/tmp/kd-push-test').length).toBe(1);
		await push.saveSettings(sql, u.anna, { ...push.DEFAULTS, push_chat: false });
		await push.gateway(sql, n());
		expect(readdirSync('/tmp/kd-push-test').length).toBe(1);
		// gesperrtes Konto → Schlüssel abgelehnt
		await sql`update users set status = 'suspended' where id = ${u.anna}`;
		expect((await push.gateway(sql, n())).rejected).toContain(key);
		await sql`update users set status = 'active' where id = ${u.anna}`;
	});

	it('Benachrichtigungseinstellungen: Standard zurückhaltend, ungültige Zeiten verworfen', async () => {
		expect(await push.getSettings(sql, u.dora)).toEqual(push.DEFAULTS);
		expect(push.DEFAULTS).toMatchObject({ read_receipts: false, typing: false, push_community: false });
		await push.saveSettings(sql, u.dora, { ...push.DEFAULTS, quiet_from: 9999, quiet_to: 60 });
		expect((await push.getSettings(sql, u.dora)).quiet_from).toBeNull();
		expect((await push.getSettings(sql, u.dora)).quiet_to).toBeNull();
	});

	it('VAPID-Schlüssel einmalig erzeugt und verschlüsselt gespeichert', async () => {
		const k1 = await push.vapidKeys(sql);
		const [row] = await sql`select value from settings where key = 'push_vapid'`;
		expect(row.value.public).toBe(k1.publicKey);
		expect(JSON.stringify(row.value)).not.toContain(k1.privateKey);
	});

	it('Kontolöschung räumt Chat-Daten auf', async () => {
		const { deleteAccount } = await import('../src/lib/server/account');
		await deleteAccount(sql, u.anna);
		const [p] = await sql`select count(*)::int as n from push_subscriptions where user_id = ${u.anna}`;
		const [r] = await sql`select status from chat_rooms where room_id = '!dm:kinder-deutschlands'`;
		const [a] = await sql`select count(*)::int as n from chat_accounts where user_id = ${u.anna}`;
		expect(p.n).toBe(0);
		expect(r.status).toBe('abgelaufen');
		expect(a.n).toBe(0); // Zuordnung gelöscht; das Stilllegen auf dem Chat-Server prüft der Rauchtest
	});
});
