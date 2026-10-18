import type { Sql } from './db';
import { audit } from './audit';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UUID_LINE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Löschliste außerhalb der Datenbank (Sicherungs-Volume): überlebt eine Wiederherstellung aus einer älteren Sicherung. */
function deletionFile(): string | null {
	const dir = process.env.BACKUP_DIR;
	return dir ? join(dir, 'deletions.log') : null;
}

/** Alle gespeicherten Daten zur eigenen Person (DSGVO-Auskunft/Export). Keine Daten anderer Personen außer deren öffentlicher Kontakt-ID. */
export async function exportAccount(sql: Sql, userId: string) {
	const [user] = await sql`select id, email, email_verified_at, display_name, status, created_at, last_login_at,
		(totp_enabled_at is not null) as zwei_faktor from users where id = ${userId}`;
	const [profile] = await sql`select contact_id, display_name, can_help, looking_for, interests, child_ages, region_code,
		discoverable, privacy_preset, visibility, updated_at from user_profiles where user_id = ${userId}`;
	const qr = await sql`select kind, label, created_at, expires_at, revoked_at, last_scanned_at from qr_tokens where user_id = ${userId}`;
	const contacts = await sql`select p.contact_id, c.created_at from contacts c
		join user_profiles p on p.user_id = case when c.user_a = ${userId} then c.user_b else c.user_a end
		where c.user_a = ${userId} or c.user_b = ${userId}`;
	const requests = await sql`select r.status, r.via, r.message, r.created_at, r.decided_at,
		case when r.from_user = ${userId} then 'gesendet' else 'erhalten' end as richtung, p.contact_id as andere_id
		from contact_requests r join user_profiles p on p.user_id = case when r.from_user = ${userId} then r.to_user else r.from_user end
		where r.from_user = ${userId} or r.to_user = ${userId}`;
	const blocked = await sql`select p.contact_id, b.created_at from blocks b join user_profiles p on p.user_id = b.blocked where b.blocker = ${userId}`;
	const passkeys = await sql`select name, created_at, last_used_at from webauthn_credentials where user_id = ${userId}`;
	const sessions = await sql`select created_at, last_seen_at, expires_at, user_agent from sessions where user_id = ${userId}`;
	const roles = await sql`select role_key, scope_type, scope_id, granted_at, expires_at, revoked_at from role_assignments where user_id = ${userId}`;
	const log = await sql`select at, action from audit_log where actor_id = ${userId} order by at desc limit 500`;
	return {
		erstellt: new Date().toISOString(),
		hinweis: 'Export aller zu deinem Konto gespeicherten Daten bei Kinder Deutschlands.',
		konto: user,
		profil: profile ?? null,
		qr_codes: qr,
		kontakte: contacts,
		anfragen: requests,
		blockiert: blocked,
		passkeys,
		sitzungen: sessions,
		rollen: roles,
		protokoll_eigene_vorgaenge: log
	};
}

/**
 * Konto löschen: Profil, QR-Codes, Kontakte, Anfragen, Blockierungen, Passkeys, Sitzungen und Token werden entfernt.
 * Der Konto-Datensatz bleibt anonymisiert stehen (Protokoll-Verweise), E-Mail und Passwort werden unbrauchbar gemacht.
 * Die Löschung wird im Löschprotokoll vermerkt, damit sie nach einer Wiederherstellung erneut angewendet werden kann.
 */
export async function deleteAccount(sql: Sql, userId: string, opts: { fromLog?: boolean } = {}) {
	await sql.begin(async (tx) => {
		const [{ n }] = await tx`select count(*)::int as n from role_assignments
			where user_id = ${userId} and role_key = 'superadmin' and revoked_at is null`;
		if (n > 0) {
			const [{ total }] = await tx`select count(*)::int as total from role_assignments where role_key = 'superadmin' and revoked_at is null`;
			if (total <= 1) throw new Error('Das letzte Betreiberkonto kann nicht gelöscht werden.');
		}
		await tx`delete from user_profiles where user_id = ${userId}`;
		await tx`delete from qr_tokens where user_id = ${userId}`;
		await tx`delete from contacts where user_a = ${userId} or user_b = ${userId}`;
		await tx`delete from contact_requests where from_user = ${userId} or to_user = ${userId}`;
		await tx`delete from blocks where blocker = ${userId} or blocked = ${userId}`;
		await tx`delete from webauthn_credentials where user_id = ${userId}`;
		await tx`delete from sessions where user_id = ${userId}`;
		await tx`delete from email_tokens where user_id = ${userId}`;
		await tx`update role_assignments set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
		await tx`update users set status = 'deleted', email = ${'geloescht+' + userId + '@invalid'}, password_hash = '!',
			totp_secret_enc = null, totp_enabled_at = null, display_name = null where id = ${userId}`;
		await tx`insert into deletion_log (user_id) values (${userId})`;
		await audit(tx as unknown as Sql, { actorId: userId, action: opts.fromLog ? 'account.deletion_reapplied' : 'account.deleted', targetType: 'user', targetId: userId });
	});
	const f = deletionFile();
	if (f && !opts.fromLog) {
		try {
			appendFileSync(f, userId + '\n', { mode: 0o600 });
		} catch (e) {
			console.error('Löschliste konnte nicht geschrieben werden:', (e as Error).message);
		}
	}
}

/** Nach einer Wiederherstellung aus einer Sicherung: alle protokollierten Löschungen erneut anwenden. */
export async function reapplyDeletions(sql: Sql): Promise<number> {
	const ids = new Set<string>();
	const f = deletionFile();
	if (f) {
		try {
			for (const line of readFileSync(f, 'utf8').split('\n')) if (UUID_LINE.test(line.trim())) ids.add(line.trim());
		} catch {
			/* Datei existiert noch nicht */
		}
	}
	const logged = await sql`select distinct user_id from deletion_log`;
	for (const r of logged) ids.add(r.user_id as string);
	if (!ids.size) return 0;
	const open = await sql`select id from users where id = any(${[...ids]}::uuid[]) and status <> 'deleted'`;
	for (const r of open) await deleteAccount(sql, r.id as string, { fromLog: true });
	if (open.length) console.log(`Löschliste: ${open.length} Konto/Konten nach Wiederherstellung erneut gelöscht.`);
	return open.length;
}
