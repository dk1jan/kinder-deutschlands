// Mitglieder-Abläufe gegen echte Datenbank: Kontakte, Blockieren, QR-Widerruf, Löschen, Token.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.BACKUP_DIR = mkdtempSync(join(tmpdir(), 'kd-del-'));
import { ensureProfile, getProfileByContactId, relationOf } from '../src/lib/server/profiles';
import { block, ContactError, overview, respond, sendRequest, unblock, discover } from '../src/lib/server/contacts';
import { ensurePermanentQr, replacePermanentQr, resolveQr, createTemporaryQr } from '../src/lib/server/qr';
import { deleteAccount, exportAccount, reapplyDeletions } from '../src/lib/server/account';
import { consumeEmailToken, createEmailToken } from '../src/lib/server/tokens';
import { cardForViewer } from '../src/lib/server/cards';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Mitglieder (Datenbank)', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const ids: Record<string, string> = {};

	async function member(name: string) {
		const [u] = await sql`insert into users (email, password_hash, email_verified_at) values (${name + '@example.org'}, 'x', now()) returning id`;
		await ensureProfile(sql, u.id);
		await sql`update user_profiles set display_name = ${name} where user_id = ${u.id}`;
		return u.id as string;
	}

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		for (const n of ['anna', 'ben', 'cem', 'dora']) ids[n] = await member(n);
	});
	afterAll(async () => {
		await sql.end();
	});

	it('jedes Profil hat eine eindeutige Kontakt-ID, ensureProfile ist idempotent', async () => {
		const a = await ensureProfile(sql, ids.anna);
		expect(await ensureProfile(sql, ids.anna)).toBe(a);
		const [{ n }] = await sql`select count(distinct contact_id)::int as n from user_profiles`;
		expect(n).toBe(4);
	});

	it('Unbestätigte Konten sind über die ID nicht auffindbar', async () => {
		const [u] = await sql`insert into users (email, password_hash) values ('neu@example.org', 'x') returning id`;
		const cid = await ensureProfile(sql, u.id);
		expect(await getProfileByContactId(sql, cid)).toBeNull();
	});

	it('Anfrage → annehmen → Kontakt; Sichtbarkeit wächst mit der Beziehung', async () => {
		expect(await relationOf(sql, ids.ben, ids.anna)).toBe('mitglied');
		await sendRequest(sql, ids.ben, ids.anna, 'Hallo', 'id');
		await expect(sendRequest(sql, ids.ben, ids.anna, null, 'id')).rejects.toBeInstanceOf(ContactError);
		const o = await overview(sql, ids.anna);
		expect(o.incoming.length).toBe(1);
		await respond(sql, ids.anna, o.incoming[0].id as string, true);
		expect(await relationOf(sql, ids.ben, ids.anna)).toBe('kontakt');
		await sql`update user_profiles set can_help = 'Kita' where user_id = ${ids.anna}`;
		expect((await cardForViewer(sql, ids.anna, ids.ben))!.card.canHelp).toBe('Kita');
		expect((await cardForViewer(sql, ids.anna, ids.cem))!.card.canHelp).toBeNull();
		expect((await cardForViewer(sql, ids.anna, null))!.card.displayName).toBeNull();
	});

	it('Gegenseitige Anfragen verbinden direkt', async () => {
		await sendRequest(sql, ids.cem, ids.dora, null, 'id');
		expect(await sendRequest(sql, ids.dora, ids.cem, null, 'qr')).toBe('verbunden');
		expect(await relationOf(sql, ids.cem, ids.dora)).toBe('kontakt');
	});

	it('Fremde Anfragen kann niemand Drittes annehmen', async () => {
		await sendRequest(sql, ids.cem, ids.anna, null, 'id');
		const [r] = await sql`select id from contact_requests where from_user = ${ids.cem} and to_user = ${ids.anna} and status = 'offen'`;
		await expect(respond(sql, ids.ben, r.id, true)).rejects.toBeInstanceOf(ContactError);
	});

	it('Blockieren beendet Kontakt, Anfragen und Sichtbarkeit in beide Richtungen', async () => {
		await block(sql, ids.anna, ids.ben);
		expect(await relationOf(sql, ids.ben, ids.anna)).toBe('mitglied');
		expect(await cardForViewer(sql, ids.anna, ids.ben)).toBeNull();
		expect(await cardForViewer(sql, ids.ben, ids.anna)).toBeNull();
		await expect(sendRequest(sql, ids.ben, ids.anna, null, 'id')).rejects.toBeInstanceOf(ContactError);
		await unblock(sql, ids.anna, ids.ben);
		expect(await cardForViewer(sql, ids.anna, ids.ben)).not.toBeNull();
	});

	it('Entdecken zeigt nur auffindbare, nie blockierte, nie sich selbst', async () => {
		await sql`update user_profiles set discoverable = true, region_code = '04011' where user_id in (${ids.anna}, ${ids.cem})`;
		let list = await discover(sql, ids.dora, '04011');
		expect(list.map((r) => r.user_id).sort()).toEqual([ids.anna, ids.cem].sort());
		await block(sql, ids.cem, ids.dora);
		list = await discover(sql, ids.dora, null);
		expect(list.map((r) => r.user_id)).toEqual([ids.anna]);
		list = await discover(sql, ids.anna, null);
		expect(list.map((r) => r.user_id)).not.toContain(ids.anna);
	});

	it('QR: gültig, nach Ersetzen ungültig, befristet läuft ab', async () => {
		await ensurePermanentQr(sql, ids.anna);
		const [old] = await sql`select token from qr_tokens where user_id = ${ids.anna} and kind = 'dauerhaft' and revoked_at is null`;
		expect((await resolveQr(sql, old.token))?.userId).toBe(ids.anna);
		await replacePermanentQr(sql, ids.anna);
		expect(await resolveQr(sql, old.token)).toBeNull();
		await createTemporaryQr(sql, ids.anna, 1, 'Test');
		const [t] = await sql`select id, token from qr_tokens where user_id = ${ids.anna} and kind = 'befristet'`;
		expect(await resolveQr(sql, t.token)).not.toBeNull();
		await sql`update qr_tokens set expires_at = now() - interval '1 minute' where id = ${t.id}`;
		expect(await resolveQr(sql, t.token)).toBeNull();
		expect(await resolveQr(sql, 'gibt-es-nicht-123')).toBeNull();
	});

	it('E-Mail-Token: einmalig, zweckgebunden, ältere werden entwertet', async () => {
		const t1 = await createEmailToken(sql, ids.anna, 'reset');
		const t2 = await createEmailToken(sql, ids.anna, 'reset');
		expect(await consumeEmailToken(sql, t1, 'reset')).toBeNull();
		expect(await consumeEmailToken(sql, t2, 'verify')).toBeNull();
		expect(await consumeEmailToken(sql, t2, 'reset')).toBe(ids.anna);
		expect(await consumeEmailToken(sql, t2, 'reset')).toBeNull();
	});

	it('Export enthält eigene Daten, keine fremden E-Mail-Adressen', async () => {
		const data = await exportAccount(sql, ids.cem);
		const text = JSON.stringify(data);
		expect(text).toContain('cem@example.org');
		expect(text).not.toContain('dora@example.org');
		expect(data.profil?.contact_id).toBeTruthy();
	});

	it('Löschen entfernt alles Persönliche, ID ist danach nicht mehr auffindbar, Löschung ist wiederholbar', async () => {
		const [p] = await sql`select contact_id from user_profiles where user_id = ${ids.dora}`;
		await deleteAccount(sql, ids.dora);
		const [u] = await sql`select email, status, password_hash from users where id = ${ids.dora}`;
		expect(u.status).toBe('deleted');
		expect(u.email).not.toContain('dora');
		expect(await getProfileByContactId(sql, p.contact_id)).toBeNull();
		for (const t of ['user_profiles', 'qr_tokens', 'webauthn_credentials', 'sessions']) {
			const [{ n }] = await sql.unsafe(`select count(*)::int as n from ${t} where user_id = $1`, [ids.dora]);
			expect(n).toBe(0);
		}
		const [{ n }] = await sql`select count(*)::int as n from contacts where user_a = ${ids.dora} or user_b = ${ids.dora}`;
		expect(n).toBe(0);
		// Simulierte Wiederherstellung aus Sicherung: Konto wieder aktiv → Löschprotokoll wendet Löschung erneut an
		// Auch wenn das Löschprotokoll in der DB mit zurückgesetzt wurde: Datei im Sicherungsordner reicht.
		expect(readFileSync(process.env.BACKUP_DIR + '/deletions.log', 'utf8')).toContain(ids.dora);
		await sql`update users set status = 'active' where id = ${ids.dora}`;
		await sql`delete from deletion_log`;
		expect(await reapplyDeletions(sql)).toBe(1);
		expect(await reapplyDeletions(sql)).toBe(0);
		const [again] = await sql`select status from users where id = ${ids.dora}`;
		expect(again.status).toBe('deleted');
	});
});
