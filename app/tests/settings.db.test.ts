// Mail-Einstellungen in der Verwaltung: verschlüsselt gespeichert, Vorrang vor Umgebungsvariablen, Rückfall.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Mail-Einstellungen (Datenbank)', async () => {
	const ms = await import('../src/lib/server/mailsettings');
	const { userCan } = await import('../src/lib/server/roles');
	const sql = postgres(url ?? '', { max: 2, onnotice: () => {} });
	let admin = '';
	const base = { host: 'Mail.Example.org', port: '587', user: 'noreply@example.org', password: 'geheim-123', from: 'noreply@example.org', insecureTls: false };

	beforeAll(async () => {
		await sql.unsafe('drop schema public cascade; create schema public;');
		execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_URL: url, BACKUP_DIR: '/tmp/kd-test-bk' }, encoding: 'utf8' });
		const [u] = await sql`insert into users (email, password_hash, email_verified_at) values ('t@example.org', 'x', now()) returning id`;
		admin = u.id;
		for (const k of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PORT']) delete process.env[k];
	});
	afterAll(async () => {
		await sql.end();
	});

	it('ohne Eintrag und ohne Variablen: nicht eingerichtet', async () => {
		await ms.loadMailSettings(sql);
		expect(ms.mailConfig()).toBeNull();
	});

	it('Umgebungsvariablen gelten als Rückfall', async () => {
		process.env.SMTP_HOST = 'env.example.org';
		process.env.SMTP_FROM = 'env@example.org';
		expect(ms.mailConfig()?.source).toBe('umgebung');
		expect(ms.mailConfig()?.host).toBe('env.example.org');
	});

	it('Gespeichert: Vorrang, Passwort nur verschlüsselt in der DB, nie in der Anzeige', async () => {
		await ms.saveMailSettings(sql, base, admin);
		const c = ms.mailConfig()!;
		expect(c.source).toBe('verwaltung');
		expect(c.host).toBe('mail.example.org');
		expect(c.password).toBe('geheim-123');
		const [row] = await sql`select value::text as v from settings where key = 'mail'`;
		expect(row.v).not.toContain('geheim-123');
		expect(JSON.stringify(ms.mailSettingsView())).not.toContain('geheim-123');
		expect(ms.mailSettingsView().hasPassword).toBe(true);
	});

	it('Leeres Passwortfeld behält das gespeicherte Passwort', async () => {
		const v = ms.mailSettingsVersion();
		await ms.saveMailSettings(sql, { ...base, password: '', port: '465' }, admin);
		expect(ms.mailConfig()?.password).toBe('geheim-123');
		expect(ms.mailConfig()?.port).toBe(465);
		expect(ms.mailSettingsVersion()).toBeGreaterThan(v);
	});

	it('Ungültige Eingaben werden abgelehnt', async () => {
		await expect(ms.saveMailSettings(sql, { ...base, host: 'mail example' }, admin)).rejects.toBeInstanceOf(ms.MailSettingsError);
		await expect(ms.saveMailSettings(sql, { ...base, port: '99999' }, admin)).rejects.toBeInstanceOf(ms.MailSettingsError);
		await expect(ms.saveMailSettings(sql, { ...base, from: 'kein-mail' }, admin)).rejects.toBeInstanceOf(ms.MailSettingsError);
	});

	it('Entfernen: Umgebungsvariablen gelten wieder', async () => {
		await ms.clearMailSettings(sql);
		expect(ms.mailConfig()?.source).toBe('umgebung');
		delete process.env.SMTP_HOST;
		delete process.env.SMTP_FROM;
	});

	it('Recht settings.manage: Technikadministration ja, Moderation nein', async () => {
		await sql`insert into role_assignments (user_id, role_key, scope_type) values (${admin}, 'moderator_global', 'global')`;
		expect(await userCan(sql, admin, 'settings.manage')).toBe(false);
		await sql`insert into role_assignments (user_id, role_key, scope_type) values (${admin}, 'tech_admin', 'global')`;
		expect(await userCan(sql, admin, 'settings.manage')).toBe(true);
	});
});
