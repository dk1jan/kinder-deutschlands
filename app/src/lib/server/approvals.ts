// Zweite Freigabe für kritische Aktionen (M24, D-057): Betreiber-/Technikrolle vergeben oder entziehen, Konto sperren.
// Eine berechtigte Person beantragt, eine ZWEITE berechtigte Person führt aus (nie dieselbe). Gibt es nur eine
// berechtigte Person, wird sofort ausgeführt und das im Protokoll vermerkt – sonst könnte sich niemand aussperren.
import type { Sql } from './db';
import { audit } from './audit';
import { assignRole, revokeAssignment, RightsError, userCan } from './roles';
import type { ScopeType } from './rights';

export class ApprovalError extends Error {}

/** Rollen, deren Vergabe/Entzug zwei Personen braucht. */
export const CRITICAL_ROLES = ['superadmin', 'tech_admin'];

export type ApprovalAction = 'role.assign' | 'role.revoke' | 'user.suspend';
const PERMISSION: Record<ApprovalAction, string> = { 'role.assign': 'roles.assign', 'role.revoke': 'roles.assign', 'user.suspend': 'users.suspend' };

export interface AssignPayload {
	userId: string;
	roleKey: string;
	scopeType: ScopeType;
	scopeId: string | null;
	expiresAt: string | null;
	note: string | null;
}
export interface RevokePayload {
	assignmentId: string;
}
export interface SuspendPayload {
	userId: string;
	caseId: string | null;
}

/** Wie viele aktive Personen haben dieses Recht (global)? */
export async function holders(sql: Sql, permission: string): Promise<string[]> {
	const rows = await sql`select distinct a.user_id from role_assignments a join role_permissions p on p.role_key = a.role_key
		join users u on u.id = a.user_id and u.status = 'active'
		where a.revoked_at is null and (a.expires_at is null or a.expires_at > now()) and a.scope_type = 'global' and p.action in ('*', ${permission})`;
	return rows.map((r) => r.user_id as string);
}

export async function needsSecond(sql: Sql, action: ApprovalAction, actorId: string): Promise<boolean> {
	const h = await holders(sql, PERMISSION[action]);
	return h.filter((x) => x !== actorId).length > 0;
}

async function execute(sql: Sql, action: ApprovalAction, payload: Record<string, unknown>, actorId: string, ipHash: string | null) {
	if (action === 'role.assign') {
		const p = payload as unknown as AssignPayload;
		await assignRole(sql, { actorId, userId: p.userId, roleKey: p.roleKey, scopeType: p.scopeType, scopeId: p.scopeId, expiresAt: p.expiresAt ? new Date(p.expiresAt) : null, note: p.note, ipHash });
	} else if (action === 'role.revoke') {
		const p = payload as unknown as RevokePayload;
		await revokeAssignment(sql, actorId, p.assignmentId, null, ipHash);
	} else {
		const p = payload as unknown as SuspendPayload;
		await suspendUser(sql, actorId, p.userId);
	}
}

/** Konto sperren: Anmeldung, Sitzungen und Chat-Geräte enden. */
export async function suspendUser(sql: Sql, actorId: string, userId: string) {
	const [r] = await sql`update users set status = 'suspended' where id = ${userId} and status = 'active' returning id`;
	if (!r) throw new ApprovalError('Konto nicht aktiv oder nicht gefunden.');
	await sql`delete from sessions where user_id = ${userId}`;
	const chat = await import('./chat/synapse');
	const [acc] = await sql`select localpart from chat_accounts where user_id = ${userId}`;
	if (acc && chat.chatEnabled()) await chat.logoutAll(sql, acc.localpart).catch(() => {});
	await audit(sql, { actorId, action: 'user.suspended', targetType: 'user', targetId: userId });
}

/**
 * Kritische Aktion beantragen. Ist eine zweite Person nötig, entsteht ein Antrag (Rückgabe 'beantragt'),
 * sonst wird sofort ausgeführt (Rückgabe 'ausgefuehrt', Vermerk „ohne zweite Freigabe“).
 */
export async function request(sql: Sql, actorId: string, action: ApprovalAction, payload: Record<string, unknown>, summary: string, reason: string, ipHash: string | null = null): Promise<'beantragt' | 'ausgefuehrt'> {
	if (!(await userCan(sql, actorId, PERMISSION[action]))) throw new ApprovalError('Keine Berechtigung.');
	if (reason.trim().length < 5) throw new ApprovalError('Bitte begründen (mindestens ein paar Worte) – die zweite Person entscheidet danach.');
	if (!(await needsSecond(sql, action, actorId))) {
		await execute(sql, action, payload, actorId, ipHash);
		await audit(sql, { actorId, action: 'approval.single', targetType: 'approval', targetId: action, reason: reason.trim(), meta: { summary, hinweis: 'ohne zweite Freigabe – nur eine berechtigte Person vorhanden' } });
		return 'ausgefuehrt';
	}
	const [dup] = await sql`select id from approvals where status = 'offen' and action = ${action} and payload = ${sql.json(payload as never)} and expires_at > now()`;
	if (dup) throw new ApprovalError('Genau dieser Antrag wartet schon auf Freigabe.');
	const [a] = await sql`insert into approvals (action, permission, payload, summary, reason, requested_by)
		values (${action}, ${PERMISSION[action]}, ${sql.json(payload as never)}, ${summary.slice(0, 300)}, ${reason.trim().slice(0, 500)}, ${actorId}) returning id`;
	await audit(sql, { actorId, action: 'approval.requested', targetType: 'approval', targetId: a.id, reason: reason.trim(), meta: { action, summary } });
	const others = (await holders(sql, PERMISSION[action])).filter((x) => x !== actorId);
	const { notify } = await import('./community/posts');
	for (const o of others) await notify(sql, o, 'freigabe', `Zweite Freigabe nötig: ${summary}`, '/admin/freigaben', { pushKind: 'community', pushBody: 'Eine Aktion wartet auf deine Freigabe' });
	return 'beantragt';
}

export async function decide(sql: Sql, actorId: string, id: string, approve: boolean, note: string, ipHash: string | null = null) {
	const [a] = await sql`select * from approvals where id = ${id}`;
	if (!a || a.status !== 'offen') throw new ApprovalError('Antrag nicht (mehr) offen.');
	if (new Date(a.expires_at) < new Date()) {
		await sql`update approvals set status = 'abgelaufen' where id = ${id}`;
		throw new ApprovalError('Antrag ist abgelaufen (72 Stunden).');
	}
	if (a.requested_by === actorId) throw new ApprovalError('Die zweite Freigabe muss eine andere Person geben.');
	if (!(await userCan(sql, actorId, a.permission))) throw new ApprovalError('Keine Berechtigung.');
	if (!approve) {
		await sql`update approvals set status = 'abgelehnt', decided_by = ${actorId}, decided_at = now(), decision_note = ${note.trim().slice(0, 500) || null} where id = ${id}`;
		await audit(sql, { actorId, action: 'approval.rejected', targetType: 'approval', targetId: id, reason: note.trim() || undefined });
		return 'abgelehnt' as const;
	}
	// Erst als „ausgeführt“ markieren (verhindert doppelte Ausführung bei gleichzeitigen Klicks), dann ausführen
	const [lock] = await sql`update approvals set status = 'ausgefuehrt', decided_by = ${actorId}, decided_at = now(), decision_note = ${note.trim().slice(0, 500) || null}
		where id = ${id} and status = 'offen' returning id`;
	if (!lock) throw new ApprovalError('Antrag wurde gerade schon entschieden.');
	try {
		await execute(sql, a.action, a.payload, actorId, ipHash);
	} catch (e) {
		const msg = e instanceof RightsError || e instanceof ApprovalError ? e.message : 'Ausführung fehlgeschlagen.';
		await sql`update approvals set status = 'fehler', decision_note = ${msg} where id = ${id}`;
		throw new ApprovalError(msg);
	}
	await audit(sql, { actorId, action: 'approval.executed', targetType: 'approval', targetId: id, meta: { action: a.action, requested_by: a.requested_by } });
	if (a.action === 'user.suspend' && a.payload.caseId) {
		await sql`update mod_cases set status = 'erledigt', decision = 'sperren', decided_by = ${actorId}, decided_at = now(), decision_reason = ${a.reason}
			where id = ${a.payload.caseId} and status <> 'erledigt'`;
		const { notify } = await import('./community/posts');
		await notify(sql, a.payload.userId, 'moderation', `Dein Konto wurde gesperrt. Begründung: ${a.reason}`, null, { noPush: true });
	}
	return 'ausgefuehrt' as const;
}

export async function withdraw(sql: Sql, actorId: string, id: string) {
	const [r] = await sql`update approvals set status = 'zurueckgezogen', decided_at = now() where id = ${id} and requested_by = ${actorId} and status = 'offen' returning id`;
	if (!r) throw new ApprovalError('Antrag nicht gefunden.');
	await audit(sql, { actorId, action: 'approval.withdrawn', targetType: 'approval', targetId: id });
}

export async function listApprovals(sql: Sql, viewerId: string) {
	await sql`update approvals set status = 'abgelaufen' where status = 'offen' and expires_at < now()`;
	const rows = await sql`select a.*, ru.email as requested_email, du.email as decided_email from approvals a
		left join users ru on ru.id = a.requested_by left join users du on du.id = a.decided_by
		order by (a.status = 'offen') desc, a.requested_at desc limit 100`;
	const out = [];
	for (const r of rows) {
		if (!(await userCan(sql, viewerId, r.permission))) continue;
		out.push({
			id: r.id as string,
			action: r.action as string,
			summary: r.summary as string,
			reason: r.reason as string,
			status: r.status as string,
			requestedBy: (r.requested_email as string | null) ?? 'gelöschtes Konto',
			mine: r.requested_by === viewerId,
			requestedAt: r.requested_at as Date,
			expiresAt: r.expires_at as Date,
			decidedBy: r.decided_email as string | null,
			decidedAt: r.decided_at as Date | null,
			note: r.decision_note as string | null
		});
	}
	return out;
}

export async function openCount(sql: Sql, viewerId: string) {
	const rows = await sql`select permission, count(*)::int as n from approvals where status = 'offen' and expires_at > now() and requested_by is distinct from ${viewerId} group by permission`;
	let n = 0;
	for (const r of rows) if (await userCan(sql, viewerId, r.permission)) n += r.n;
	return n;
}
