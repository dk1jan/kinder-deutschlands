// Integrationstests gegen eine echte PostgreSQL/PostGIS-Datenbank.
// Läuft nur mit TEST_DATABASE_URL (lokal und in GitHub Actions). Die Datenbank wird dabei geleert!
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeSetup, isSetupComplete, SetupLockedError, verifySetupToken } from '../src/lib/server/setup';
import { assignRole, regionPath, revokeAssignment, RightsError, userCan } from '../src/lib/server/roles';
import { createSession, validateSession, deleteSession } from '../src/lib/server/session';
import { hashPassword } from '../src/lib/server/password';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Datenbank: Migration, Einrichtung, Rechte, Sitzungen', () => {
	const sql = postgres(url ?? '', { max: 4, onnotice: () => {} });
	const backupDir = mkdtempSync(join(tmpdir(), 'kd-backup-'));
	let migrateLog = '';

	function migrate() {
		return execFileSync('node', ['scripts/migrate.mjs'], {
			env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: backupDir, APP_URL: 'https://test.example' },
			encoding: 'utf8'
		});
	}

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		migrateLog = migrate();
	});
	afterAll(async () => {
		await sql.end();
	});

	it('spielt Migrationen ein und gibt ein Setup-Token aus', async () => {
		expect(migrateLog).toContain('EINRICHTUNG NOCH NICHT ABGESCHLOSSEN');
		const [{ n }] = await sql`select count(*)::int as n from schema_migrations`;
		expect(n).toBeGreaterThan(0);
		const [p] = await sql`select postgis_lib_version() as v`;
		expect(p.v).toBeTruthy();
	});

	it('zweiter Start: keine erneute Migration, kein Backup nötig, Daten bleiben', async () => {
		const out = migrate();
		expect(out).toContain('Datenbank aktuell');
		expect(readdirSync(backupDir).length).toBe(0);
	});

	it('Setup-Token aus dem Log ist gültig, falsches nicht', async () => {
		const out = migrate();
		const token = /Einmal-Token:\s+(\S+)/.exec(out)?.[1] ?? '';
		expect(await verifySetupToken(sql, token)).toBe(true);
		expect(await verifySetupToken(sql, token + 'x')).toBe(false);
		expect(await verifySetupToken(sql, '')).toBe(false);
	});

	let adminId = '';
	it('Einrichtung legt genau einen Betreiber an und sperrt sich – auch bei gleichzeitigen Versuchen', async () => {
		const base = { passwordHash: await hashPassword('ein sehr gutes Passwort'), totpSecretEnc: 'v1.x.y.z', totpStep: 1, ipHash: null };
		const results = await Promise.allSettled([
			completeSetup(sql, { ...base, email: 'eins@example.org' }),
			completeSetup(sql, { ...base, email: 'zwei@example.org' })
		]);
		const ok = results.filter((r) => r.status === 'fulfilled');
		const locked = results.filter((r) => r.status === 'rejected' && r.reason instanceof SetupLockedError);
		expect(ok.length).toBe(1);
		expect(locked.length).toBe(1);
		adminId = (ok[0] as PromiseFulfilledResult<string>).value;
		expect(await isSetupComplete(sql)).toBe(true);
		const [{ n }] = await sql`select count(*)::int as n from users`;
		expect(n).toBe(1);
		const [tok] = await sql`select 1 from settings where key = 'setup_token'`;
		expect(tok).toBeUndefined();
		await expect(completeSetup(sql, { ...base, email: 'drei@example.org' })).rejects.toBeInstanceOf(SetupLockedError);
	});

	it('nach der Einrichtung erzeugt ein Neustart kein Token mehr', async () => {
		const out = migrate();
		expect(out).not.toContain('Einmal-Token');
	});

	it('Regionspfad Bremen-Stadt', async () => {
		expect(await regionPath(sql, '04011')).toEqual(['de', '04', '04011']);
	});

	it('Rechtevergabe: Regionalmoderation bleibt regional, Entzug wirkt, Protokoll wird geschrieben', async () => {
		const [mod] = await sql`insert into users (email, password_hash) values ('mod@example.org', 'x') returning id`;
		const id = await assignRole(sql, {
			actorId: adminId, userId: mod.id, roleKey: 'moderator_regional', scopeType: 'region', scopeId: '04',
			expiresAt: null, note: 'Test', ipHash: null
		});
		expect(await userCan(sql, mod.id, 'content.moderate', { regionPath: await regionPath(sql, '04011') })).toBe(true);
		expect(await userCan(sql, mod.id, 'content.moderate', { regionPath: ['de', '03'] })).toBe(false);
		expect(await userCan(sql, mod.id, 'content.moderate')).toBe(false);
		expect(await userCan(sql, mod.id, 'roles.assign')).toBe(false);
		// Moderator darf selbst keine Rechte vergeben
		await expect(assignRole(sql, {
			actorId: mod.id, userId: mod.id, roleKey: 'superadmin', scopeType: 'global', scopeId: null, expiresAt: null, note: null, ipHash: null
		})).rejects.toBeInstanceOf(RightsError);
		await revokeAssignment(sql, adminId, id, 'Test beendet', null);
		expect(await userCan(sql, mod.id, 'content.moderate', { regionPath: ['de', '04'] })).toBe(false);
		const log = await sql`select action from audit_log order by id`;
		expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['setup.completed', 'role.assigned', 'role.revoked']));
	});

	it('Die letzte Betreiberrolle kann nicht entzogen werden', async () => {
		const [a] = await sql`select id from role_assignments where role_key = 'superadmin' and revoked_at is null`;
		await expect(revokeAssignment(sql, adminId, a.id, null, null)).rejects.toBeInstanceOf(RightsError);
	});

	it('Sitzungen: gültig, ungültig nach Abmeldung, Token nicht im Klartext gespeichert', async () => {
		const { token } = await createSession(sql, adminId, true, 'test');
		const v = await validateSession(sql, token);
		expect(v?.user.id).toBe(adminId);
		const [row] = await sql`select id_hash from sessions where id_hash = ${v!.session.idHash}`;
		expect(row.id_hash).not.toBe(token);
		await deleteSession(sql, v!.session.idHash);
		expect(await validateSession(sql, token)).toBeNull();
		expect(await validateSession(sql, 'falsch')).toBeNull();
	});

	it('Neue Migration: vorher wird gesichert', async () => {
		await sql`delete from schema_migrations where version = (select max(version) from schema_migrations)`;
		// Je nach Migration läuft sie erneut durch oder bricht ab – in beiden Fällen muss VORHER gesichert werden
		try {
			migrate();
		} catch {
			/* nicht idempotente Migration: sauberer Abbruch, Transaktion zurückgerollt */
		}
		expect(readdirSync(backupDir).some((f) => f.startsWith('pre-migrate-'))).toBe(true);
		// Daten unverändert
		const [{ n }] = await sql`select count(*)::int as n from users`;
		expect(n).toBe(2);
	});
});
