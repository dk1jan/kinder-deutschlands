import QRCode from 'qrcode';
import type { Sql } from './db';
import { randomToken } from './crypto';
import { audit } from './audit';
import { appUrl } from './config';

// QR-Codes zeigen auf /k/<token>. Token ≠ Kontakt-ID ≠ Konto-ID. Widerruf macht alte Ausdrucke wirkungslos.

export async function ensurePermanentQr(sql: Sql, userId: string) {
	const [q] = await sql`select id from qr_tokens where user_id = ${userId} and kind = 'dauerhaft' and revoked_at is null`;
	if (q) return;
	await sql`insert into qr_tokens (token, user_id, kind, label) values (${randomToken(16)}, ${userId}, 'dauerhaft', 'Mein QR-Code')`;
}

export async function listQr(sql: Sql, userId: string) {
	return sql`select id, token, kind, label, created_at, expires_at, revoked_at, last_scanned_at
		from qr_tokens where user_id = ${userId} order by revoked_at nulls first, created_at desc limit 30`;
}

export async function createTemporaryQr(sql: Sql, userId: string, hours: number, label: string | null) {
	const allowed = [1, 3, 24, 168];
	if (!allowed.includes(hours)) throw new Error('Ungültige Dauer');
	const [{ n }] = await sql`select count(*)::int as n from qr_tokens where user_id = ${userId} and kind = 'befristet'
		and revoked_at is null and expires_at > now()`;
	if (n >= 5) throw new Error('Es können höchstens 5 befristete Codes gleichzeitig aktiv sein.');
	await sql`insert into qr_tokens (token, user_id, kind, label, expires_at)
		values (${randomToken(16)}, ${userId}, 'befristet', ${label}, ${new Date(Date.now() + hours * 3_600_000)})`;
	await audit(sql, { actorId: userId, action: 'qr.created', meta: { kind: 'befristet', hours } });
}

export async function revokeQr(sql: Sql, userId: string, id: string) {
	const [r] = await sql`update qr_tokens set revoked_at = now() where id = ${id} and user_id = ${userId} and revoked_at is null returning kind`;
	if (!r) return;
	await audit(sql, { actorId: userId, action: 'qr.revoked', meta: { kind: r.kind as string } });
}

/** Neuer dauerhafter Code; der alte funktioniert ab sofort nicht mehr. */
export async function replacePermanentQr(sql: Sql, userId: string) {
	await sql.begin(async (tx) => {
		await tx`update qr_tokens set revoked_at = now() where user_id = ${userId} and kind = 'dauerhaft' and revoked_at is null`;
		await tx`insert into qr_tokens (token, user_id, kind, label) values (${randomToken(16)}, ${userId}, 'dauerhaft', 'Mein QR-Code')`;
		await audit(tx as unknown as Sql, { actorId: userId, action: 'qr.replaced' });
	});
}

/** Gültiger Code → Inhaber. Abgelaufen, widerrufen oder unbekannt → null. */
export async function resolveQr(sql: Sql, token: string): Promise<{ userId: string; kind: string } | null> {
	if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
	const [q] = await sql`update qr_tokens set last_scanned_at = now()
		where token = ${token} and revoked_at is null and (expires_at is null or expires_at > now())
		returning user_id, kind`;
	return q ? { userId: q.user_id as string, kind: q.kind as string } : null;
}

export function qrUrl(token: string): string {
	return `${appUrl()}/k/${token}`;
}

export async function qrSvg(token: string, dark = '#0f2238'): Promise<string> {
	return QRCode.toString(qrUrl(token), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark, light: '#00000000' } });
}
