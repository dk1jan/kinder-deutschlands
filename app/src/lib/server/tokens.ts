import type { Sql } from './db';
import { randomToken, sha256hex } from './crypto';

// Einmal-Token per E-Mail. In der Datenbank liegt nur der Hash.
const TTL = { verify: 24 * 3_600_000, reset: 3_600_000 } as const;
export type Purpose = keyof typeof TTL;

export async function createEmailToken(sql: Sql, userId: string, purpose: Purpose): Promise<string> {
	const token = randomToken(32);
	// Ältere offene Token derselben Art entwerten
	await sql`update email_tokens set used_at = now() where user_id = ${userId} and purpose = ${purpose} and used_at is null`;
	await sql`insert into email_tokens (token_hash, user_id, purpose, expires_at)
		values (${sha256hex(token)}, ${userId}, ${purpose}, ${new Date(Date.now() + TTL[purpose])})`;
	return token;
}

/** Löst ein Token genau einmal ein. Gibt die Nutzer-ID zurück oder null (unbekannt, abgelaufen, schon benutzt). */
export async function consumeEmailToken(sql: Sql, token: string, purpose: Purpose): Promise<string | null> {
	if (!token || token.length > 100) return null;
	const [row] = await sql`update email_tokens set used_at = now()
		where token_hash = ${sha256hex(token)} and purpose = ${purpose} and used_at is null and expires_at > now()
		returning user_id`;
	return (row?.user_id as string) ?? null;
}

/** Prüft ohne einzulösen (für die Anzeige des Formulars „Neues Passwort“). */
export async function peekEmailToken(sql: Sql, token: string, purpose: Purpose): Promise<boolean> {
	if (!token || token.length > 100) return false;
	const [row] = await sql`select 1 from email_tokens
		where token_hash = ${sha256hex(token)} and purpose = ${purpose} and used_at is null and expires_at > now()`;
	return !!row;
}
