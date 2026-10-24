// F-052 (Feedback aus der Fußzeile) und F-051 (Profilkarte per Familien-ID) gegen echte Datenbank.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BACKUP_DIR = mkdtempSync(join(tmpdir(), 'kd-feedback-'));
import { ensureProfile, getProfileByContactId } from '../src/lib/server/profiles';
import { block } from '../src/lib/server/contacts';
import { cardForViewer } from '../src/lib/server/cards';
import { userCan } from '../src/lib/server/roles';
import { authorViews } from '../src/lib/server/community/posts';
import { deleteAccount, exportAccount } from '../src/lib/server/account';
import { cleanPage, FeedbackError, handleFeedback, listFeedback, openFeedbackCount, submitFeedback } from '../src/lib/server/feedback';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Feedback und Profilkarte (Datenbank)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const u: Record<string, string> = {};
	const cid: Record<string, string> = {};
	async function member(name: string) {
		const [x] = await sql`insert into users (email, password_hash, email_verified_at) values (${name + '@example.org'}, 'x', now()) returning id`;
		await ensureProfile(sql, x.id);
		await sql`update user_profiles set display_name = ${name} where user_id = ${x.id}`;
		const [p] = await sql`select contact_id from user_profiles where user_id = ${x.id}`;
		cid[name] = p.contact_id as string;
		return x.id as string;
	}

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		for (const n of ['anna', 'ben', 'cem', 'mod']) u[n] = await member(n);
	});
	afterAll(async () => {
		await sql.end();
	});

	it('cleanPage: nur interne Pfade, ohne Suchparameter und Sprungmarke', () => {
		expect(cleanPage('/community/b/123?x=1#a')).toBe('/community/b/123');
		expect(cleanPage('https://evil.example/x')).toBeNull();
		expect(cleanPage('//evil.example')).toBeNull();
		expect(cleanPage('/a b')).toBeNull();
		expect(cleanPage('/<script>')).toBeNull();
		expect(cleanPage('/' + 'a'.repeat(250))).toBeNull();
		expect(cleanPage(null)).toBeNull();
	});

	it('speichert Feedback mit Art, Text und Seite; ungültige Eingaben werden abgelehnt', async () => {
		const id = await submitFeedback(sql, u.anna, { kind: 'fehler', body: 'Der Knopf im Chat reagiert nicht.', page: '/nachrichten?x=1' });
		const [row] = await sql`select kind, body, page, status, user_id from feedback where id = ${id}`;
		expect(row).toMatchObject({ kind: 'fehler', page: '/nachrichten', status: 'offen', user_id: u.anna });
		await expect(submitFeedback(sql, u.anna, { kind: 'quatsch', body: 'Text genug' })).rejects.toBeInstanceOf(FeedbackError);
		await expect(submitFeedback(sql, u.anna, { kind: 'allgemein', body: 'abc' })).rejects.toBeInstanceOf(FeedbackError);
		await expect(submitFeedback(sql, u.anna, { kind: 'allgemein', body: 'x'.repeat(2001) })).rejects.toBeInstanceOf(FeedbackError);
		const [a] = await sql`select count(*)::int as n from audit_log where action = 'feedback.submitted' and actor_id = ${u.anna}`;
		expect(a.n).toBe(1);
		const [{ meta }] = await sql`select meta from audit_log where action = 'feedback.submitted' and actor_id = ${u.anna}`;
		expect(JSON.stringify(meta)).not.toContain('Knopf');
	});

	it('begrenzt auf 10 Meldungen pro Person und Tag', async () => {
		for (let i = 0; i < 10; i++) await submitFeedback(sql, u.ben, { kind: 'allgemein', body: `Rückmeldung Nummer ${i + 1}` });
		await expect(submitFeedback(sql, u.ben, { kind: 'allgemein', body: 'Das ist die elfte' })).rejects.toThrow(/heute schon/);
		await submitFeedback(sql, u.cem, { kind: 'korrektur', body: 'Die Öffnungszeit stimmt nicht.' });
	});

	it('Verwaltung: Liste mit Filter, Offen zuerst; Zähler', async () => {
		const all = await listFeedback(sql);
		expect(all.length).toBe(12);
		expect(all[0].status).toBe('offen');
		expect(all.find((f) => f.kind === 'korrektur')?.from).toBe(`${cid.cem.slice(0, 3)}-${cid.cem.slice(3, 6)}-${cid.cem.slice(6)}`);
		expect(JSON.stringify(all)).not.toContain('@example.org');
		expect((await listFeedback(sql, { kind: 'korrektur' })).length).toBe(1);
		expect((await listFeedback(sql, { status: 'erledigt' })).length).toBe(0);
		expect(await openFeedbackCount(sql)).toBe(12);
	});

	it('Bearbeiten: „in Arbeit“ ohne Mitteilung, „erledigt“ und „verworfen“ mit neutraler Mitteilung', async () => {
		const [f] = await sql`select id from feedback where user_id = ${u.cem}`;
		await handleFeedback(sql, u.mod, f.id, { status: 'in_arbeit' });
		expect((await sql`select 1 from notifications where user_id = ${u.cem}`).length).toBe(0);
		await handleFeedback(sql, u.mod, f.id, { status: 'erledigt', reply: 'Ist korrigiert.' });
		const n = await sql`select kind, text, link from notifications where user_id = ${u.cem}`;
		expect(n).toHaveLength(1);
		expect(n[0].text).toContain('Ist korrigiert.');
		const [g] = await sql`select id from feedback where user_id = ${u.anna}`;
		await handleFeedback(sql, u.mod, g.id, { status: 'verworfen' });
		const m = await sql`select text from notifications where user_id = ${u.anna}`;
		expect(m[0].text).toMatch(/^Danke für dein Feedback!/);
		await expect(handleFeedback(sql, u.mod, g.id, { status: 'komisch' })).rejects.toBeInstanceOf(FeedbackError);
		await expect(handleFeedback(sql, u.mod, '00000000-0000-0000-0000-000000000000', { status: 'erledigt' })).rejects.toBeInstanceOf(FeedbackError);
		expect(await openFeedbackCount(sql)).toBe(10);
	});

	it('Recht feedback.manage: Rolle ja, normale Mitglieder nein', async () => {
		expect(await userCan(sql, u.mod, 'feedback.manage')).toBe(false);
		await sql`insert into role_assignments (user_id, role_key, scope_type) values (${u.mod}, 'moderator_global', 'global')`;
		expect(await userCan(sql, u.mod, 'feedback.manage')).toBe(true);
		expect(await userCan(sql, u.anna, 'feedback.manage')).toBe(false);
		const rows = await sql`select role_key from role_permissions where action = 'feedback.manage' order by role_key`;
		expect(rows.map((r) => r.role_key)).toEqual(['moderator_global', 'tech_admin']);
	});

	it('Export enthält das eigene Feedback, Kontolöschung entfernt es', async () => {
		const ex = JSON.stringify(await exportAccount(sql, u.ben));
		expect(ex).toContain('Rückmeldung Nummer 1');
		await deleteAccount(sql, u.ben);
		expect((await sql`select 1 from feedback where user_id = ${u.ben}`).length).toBe(0);
		expect((await sql`select 1 from feedback where user_id = ${u.anna}`).length).toBe(1);
	});

	// ---------- F-051: Profilkarte per Familien-ID aus dem Forum ----------
	it('Forum: Name führt zur Familien-ID; Karte folgt der Sichtbarkeit, Blockierte sehen sie nicht', async () => {
		const v = await authorViews(sql, u.cem, [u.anna], null, false);
		expect(v.get(u.anna)).toMatchObject({ pseudonym: false, contactId: cid.anna });
		const owner = await getProfileByContactId(sql, cid.anna);
		expect(owner?.user_id).toBe(u.anna);
		const res = await cardForViewer(sql, u.anna, u.cem);
		expect(res?.relation).toBe('mitglied');
		expect(await getProfileByContactId(sql, 'ZZZZZZZZZ')).toBeNull();
		await block(sql, u.anna, u.cem);
		expect(await cardForViewer(sql, u.anna, u.cem)).toBeNull();
		expect(await cardForViewer(sql, u.cem, u.anna)).toBeNull();
	});

	it('Forum: gelöschte Konten sind nicht verlinkbar', async () => {
		const v = await authorViews(sql, u.cem, [u.ben], null, false);
		expect(v.get(u.ben)?.contactId).toBeNull();
		expect(v.get(u.ben)?.pseudonym).toBe(false);
		expect(await getProfileByContactId(sql, cid.ben)).toBeNull();
	});
});
