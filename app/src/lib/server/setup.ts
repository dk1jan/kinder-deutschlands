import type { Sql } from './db';
import { safeEqual, sha256hex } from './crypto';
import { audit } from './audit';

export class SetupLockedError extends Error {
	constructor() {
		super('Die Einrichtung ist bereits abgeschlossen.');
	}
}

export async function isSetupComplete(sql: Sql): Promise<boolean> {
	const [row] = await sql`select value from settings where key = 'setup'`;
	return !!row?.value?.completed_at;
}

export async function verifySetupToken(sql: Sql, token: string): Promise<boolean> {
	const [row] = await sql`select value from settings where key = 'setup_token'`;
	const hash: string | undefined = row?.value?.hash;
	if (!hash || !token) return false;
	return safeEqual(sha256hex(token.trim()), hash);
}

export interface FirstAdmin {
	email: string;
	passwordHash: string;
	totpSecretEnc: string;
	totpStep: number;
	ipHash: string | null;
}

/**
 * Legt den ersten Betreiber-Account an und sperrt die Einrichtung – atomar.
 * Zwei gleichzeitige Versuche: der zweite scheitert an der Zeilensperre bzw. am gesetzten completed_at.
 */
export async function completeSetup(sql: Sql, a: FirstAdmin): Promise<string> {
	return sql.begin(async (tx) => {
		const [row] = await tx`select value from settings where key = 'setup' for update`;
		if (row?.value?.completed_at) throw new SetupLockedError();
		const [user] = await tx`
			insert into users (email, password_hash, totp_secret_enc, totp_enabled_at, totp_last_step, email_verified_at)
			values (${a.email}, ${a.passwordHash}, ${a.totpSecretEnc}, now(), ${a.totpStep}, null)
			returning id`;
		await tx`insert into role_assignments (user_id, role_key, scope_type, scope_id, granted_by, note)
			values (${user.id}, 'superadmin', 'global', null, null, 'Einrichtung')`;
		await tx`update settings set value = ${tx.json({ completed_at: new Date().toISOString() })}, updated_at = now()
			where key = 'setup'`;
		await tx`delete from settings where key = 'setup_token'`;
		await audit(tx as unknown as Sql, {
			actorId: user.id,
			action: 'setup.completed',
			targetType: 'user',
			targetId: user.id,
			ipHash: a.ipHash
		});
		return user.id as string;
	}) as Promise<string>;
}
