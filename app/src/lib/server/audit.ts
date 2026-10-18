import type { Sql } from './db';

export interface AuditEntry {
	actorId: string | null;
	action: string;
	targetType?: string;
	targetId?: string;
	reason?: string;
	/** Nur technische Metadaten – keine privaten Inhalte, keine Passwörter, keine Tokens. */
	meta?: Record<string, string | number | boolean | null>;
	ipHash?: string | null;
}

export async function audit(sql: Sql, e: AuditEntry) {
	await sql`insert into audit_log (actor_id, action, target_type, target_id, reason, meta, ip_hash)
		values (${e.actorId}, ${e.action}, ${e.targetType ?? null}, ${e.targetId ?? null},
		        ${e.reason ?? null}, ${sql.json(e.meta ?? {})}, ${e.ipHash ?? null})`;
}
