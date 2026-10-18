import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, verifyTotp, currentStep } from '../src/lib/server/totp';
import { decrypt, deriveKey, encrypt } from '../src/lib/server/crypto';
import { hashPassword, verifyPassword, passwordProblem } from '../src/lib/server/password';
import { can, type Assignment, type RolePermissions } from '../src/lib/server/rights';
import { safeRedirectTarget } from '../src/lib/server/auth';

describe('TOTP (RFC 6238 Testvektoren, SHA-1)', () => {
	const secret = Buffer.from('12345678901234567890');
	it('liefert die Referenzwerte', () => {
		// RFC 6238 Anhang B, auf 6 Stellen gekürzt
		expect(hotp(secret, Math.floor(59 / 30))).toBe('287082');
		expect(hotp(secret, Math.floor(1111111109 / 30))).toBe('081804');
		expect(hotp(secret, Math.floor(1234567890 / 30))).toBe('005924');
	});
	it('Base32 hin und zurück', () => {
		expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
	});
	it('akzeptiert aktuellen Code, lehnt Wiederverwendung ab', () => {
		const b32 = base32Encode(secret);
		const now = 1111111109 * 1000;
		const step = verifyTotp(b32, '081804', null, now);
		expect(step).toBe(currentStep(now));
		expect(verifyTotp(b32, '081804', step, now)).toBeNull();
		expect(verifyTotp(b32, '000000', null, now)).toBeNull();
		expect(verifyTotp(b32, 'abc', null, now)).toBeNull();
	});
});

describe('Verschlüsselung', () => {
	const k = deriveKey('x'.repeat(40), 'test');
	it('entschlüsselt, was verschlüsselt wurde', () => {
		expect(decrypt(encrypt('geheim', k), k)).toBe('geheim');
	});
	it('erkennt Manipulation', () => {
		const c = encrypt('geheim', k).split('.');
		c[3] = Buffer.from('anders').toString('base64url');
		expect(() => decrypt(c.join('.'), k)).toThrow();
	});
	it('verweigert zu kurzes APP_SECRET', () => {
		expect(() => deriveKey('kurz', 'x')).toThrow();
	});
});

describe('Passwörter', () => {
	it('hash/verify', async () => {
		const h = await hashPassword('ein langes Passwort');
		expect(await verifyPassword('ein langes Passwort', h)).toBe(true);
		expect(await verifyPassword('falsch falsch falsch', h)).toBe(false);
	});
	it('Mindestlänge', () => {
		expect(passwordProblem('kurz')).not.toBeNull();
		expect(passwordProblem('zwölf Zeichen ok')).toBeNull();
	});
});

describe('Rechte: Rolle × Geltungsbereich × Aktion', () => {
	const perms: RolePermissions = new Map([
		['superadmin', new Set(['*'])],
		['moderator_regional', new Set(['admin.access', 'moderation.review', 'content.moderate'])],
		['moderator_topic', new Set(['admin.access', 'content.moderate'])],
		['group_moderator', new Set(['admin.access', 'protected_group.read'])]
	]);
	const a = (role: string, scope_type: Assignment['scope_type'], scope_id: string | null, extra: Partial<Assignment> = {}): Assignment => ({
		role_key: role,
		scope_type,
		scope_id,
		expires_at: null,
		revoked_at: null,
		...extra
	});
	const bremenStadt = { regionPath: ['de', '04', '04011'] };
	const niedersachsen = { regionPath: ['de', '03'] };

	it('Regionalmoderation Bremen gilt in Bremen-Stadt, nicht in Niedersachsen, nicht global', () => {
		const r = [a('moderator_regional', 'region', '04')];
		expect(can(r, perms, 'content.moderate', bremenStadt)).toBe(true);
		expect(can(r, perms, 'content.moderate', niedersachsen)).toBe(false);
		expect(can(r, perms, 'content.moderate')).toBe(false);
		expect(can(r, perms, 'roles.assign')).toBe(false);
	});
	it('Region vererbt nur nach unten, nie nach oben', () => {
		const r = [a('moderator_regional', 'region', '04011')];
		expect(can(r, perms, 'content.moderate', { regionPath: ['de', '04'] })).toBe(false);
	});
	it('Geschützte Gruppen öffnen sich nicht über Regionsrechte', () => {
		const r = [a('moderator_regional', 'region', '04'), a('moderator_topic', 'topic', 'kinderwagen')];
		expect(can(r, perms, 'protected_group.read', { ...bremenStadt, group: 'alleinerziehend-hb' })).toBe(false);
	});
	it('Gruppenmoderation nur für die zugewiesene Gruppe', () => {
		const r = [a('group_moderator', 'group', 'alleinerziehend-hb')];
		expect(can(r, perms, 'protected_group.read', { group: 'alleinerziehend-hb' })).toBe(true);
		expect(can(r, perms, 'protected_group.read', { group: 'trennung-hb' })).toBe(false);
	});
	it('Themenrechte gelten nur für das Thema', () => {
		const r = [a('moderator_topic', 'topic', 'kinderwagen')];
		expect(can(r, perms, 'content.moderate', { topic: 'kinderwagen' })).toBe(true);
		expect(can(r, perms, 'content.moderate', { topic: 'schule' })).toBe(false);
	});
	it('Abgelaufene und widerrufene Zuweisungen zählen nicht', () => {
		const past = new Date(Date.now() - 1000);
		expect(can([a('superadmin', 'global', null, { expires_at: past })], perms, 'roles.assign')).toBe(false);
		expect(can([a('superadmin', 'global', null, { revoked_at: past })], perms, 'roles.assign')).toBe(false);
	});
	it('Betreiber darf alles', () => {
		const r = [a('superadmin', 'global', null)];
		expect(can(r, perms, 'roles.assign')).toBe(true);
		expect(can(r, perms, 'protected_group.read', { group: 'x' })).toBe(true);
	});
	it('Ohne Rolle kein Adminzugang', () => {
		expect(can([], perms, 'admin.access')).toBe(false);
	});
});

describe('Weiterleitungen', () => {
	it('nur relative Ziele', () => {
		expect(safeRedirectTarget('/admin', '/')).toBe('/admin');
		expect(safeRedirectTarget('//evil.example', '/')).toBe('/');
		expect(safeRedirectTarget('https://evil.example', '/')).toBe('/');
		expect(safeRedirectTarget('/\\evil', '/')).toBe('/');
	});
});
