import type { Sql } from './db';
import { randomToken, sha256hex } from './crypto';

export const SESSION_COOKIE = 'kd_session';
const DAYS = 30;
const MS_DAY = 86_400_000;

export interface SessionUser {
	id: string;
	email: string;
	display_name: string | null;
	status: string;
	totp_enabled: boolean;
}

export interface SessionInfo {
	idHash: string;
	mfaVerified: boolean;
	expiresAt: Date;
}

export async function createSession(sql: Sql, userId: string, mfaVerified: boolean, userAgent: string | null) {
	const token = randomToken(32);
	const idHash = sha256hex(token);
	const expiresAt = new Date(Date.now() + DAYS * MS_DAY);
	await sql`insert into sessions (id_hash, user_id, mfa_verified, expires_at, user_agent)
		values (${idHash}, ${userId}, ${mfaVerified}, ${expiresAt}, ${userAgent ? userAgent.slice(0, 200) : null})`;
	return { token, expiresAt };
}

/** Prüft das Token, verlängert gleitend (höchstens einmal pro Stunde ein Schreibzugriff). */
export async function validateSession(sql: Sql, token: string): Promise<{ user: SessionUser; session: SessionInfo } | null> {
	if (!token || token.length > 100) return null;
	const idHash = sha256hex(token);
	const rows = await sql`
		select s.id_hash, s.mfa_verified, s.expires_at, s.last_seen_at,
		       u.id, u.email, u.display_name, u.status, (u.totp_enabled_at is not null) as totp_enabled
		from sessions s join users u on u.id = s.user_id
		where s.id_hash = ${idHash}`;
	const r = rows[0];
	if (!r) return null;
	const now = Date.now();
	if (new Date(r.expires_at).getTime() <= now || r.status !== 'active') {
		await sql`delete from sessions where id_hash = ${idHash}`;
		return null;
	}
	let expiresAt = new Date(r.expires_at);
	if (now - new Date(r.last_seen_at).getTime() > 3_600_000) {
		expiresAt = new Date(now + DAYS * MS_DAY);
		await sql`update sessions set last_seen_at = now(), expires_at = ${expiresAt} where id_hash = ${idHash}`;
	}
	return {
		user: { id: r.id, email: r.email, display_name: r.display_name, status: r.status, totp_enabled: r.totp_enabled },
		session: { idHash, mfaVerified: r.mfa_verified, expiresAt }
	};
}

export async function markMfaVerified(sql: Sql, idHash: string) {
	await sql`update sessions set mfa_verified = true where id_hash = ${idHash}`;
}

export async function deleteSession(sql: Sql, idHash: string) {
	await sql`delete from sessions where id_hash = ${idHash}`;
}

export async function purgeExpiredSessions(sql: Sql) {
	await sql`delete from sessions where expires_at < now()`;
}
