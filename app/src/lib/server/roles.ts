import type { Sql } from './db';
import { can, type Assignment, type RolePermissions, type ScopeType, type Target } from './rights';
import { audit } from './audit';

export async function loadPermissions(sql: Sql): Promise<RolePermissions> {
	const rows = await sql`select role_key, action from role_permissions`;
	const map: RolePermissions = new Map();
	for (const r of rows) {
		if (!map.has(r.role_key)) map.set(r.role_key, new Set());
		map.get(r.role_key)!.add(r.action);
	}
	return map;
}

export async function loadAssignments(sql: Sql, userId: string): Promise<(Assignment & { id: string })[]> {
	const rows = await sql`select id, role_key, scope_type, scope_id, expires_at, revoked_at
		from role_assignments where user_id = ${userId} and revoked_at is null
		order by granted_at`;
	return rows.map((r) => ({
		id: r.id,
		role_key: r.role_key,
		scope_type: r.scope_type,
		scope_id: r.scope_id,
		expires_at: r.expires_at ? new Date(r.expires_at) : null,
		revoked_at: null
	}));
}

export async function userCan(sql: Sql, userId: string, action: string, target?: Target): Promise<boolean> {
	const [perms, assignments] = await Promise.all([loadPermissions(sql), loadAssignments(sql, userId)]);
	return can(assignments, perms, action, target);
}

/** Pfad einer Region von oben nach unten, z. B. ['de','04','04011']. */
export async function regionPath(sql: Sql, code: string): Promise<string[]> {
	const rows = await sql`
		with recursive up as (
			select code, parent_code, 0 as depth from regions where code = ${code}
			union all
			select r.code, r.parent_code, up.depth + 1 from regions r join up on r.code = up.parent_code
		) select code from up order by depth desc`;
	return rows.map((r) => r.code as string);
}

export class RightsError extends Error {}

export interface AssignInput {
	actorId: string;
	userId: string;
	roleKey: string;
	scopeType: ScopeType;
	scopeId: string | null;
	expiresAt: Date | null;
	note: string | null;
	ipHash: string | null;
}

/** Rollenvergabe: nur mit globalem Recht 'roles.assign' (Phase 0: Betreiber). */
export async function assignRole(sql: Sql, i: AssignInput) {
	if (!(await userCan(sql, i.actorId, 'roles.assign'))) throw new RightsError('Keine Berechtigung zur Rechtevergabe.');
	const [role] = await sql`select key from roles where key = ${i.roleKey}`;
	if (!role) throw new RightsError('Unbekannte Rolle.');
	if (i.scopeType === 'global' && i.scopeId) throw new RightsError('Globaler Geltungsbereich hat keine Kennung.');
	if (i.scopeType !== 'global' && !i.scopeId) throw new RightsError('Für diesen Geltungsbereich fehlt die Kennung.');
	if (i.scopeType === 'region') {
		const [reg] = await sql`select code from regions where code = ${i.scopeId}`;
		if (!reg) throw new RightsError('Region nicht gefunden.');
	}
	if (i.roleKey === 'group_moderator' && i.scopeType !== 'group') {
		throw new RightsError('Moderation geschützter Gruppen nur mit Geltungsbereich „Gruppe“.');
	}
	if (i.roleKey === 'superadmin' && i.scopeType !== 'global') {
		throw new RightsError('Betreiberrolle nur global.');
	}
	const [row] = await sql`insert into role_assignments (user_id, role_key, scope_type, scope_id, granted_by, expires_at, note)
		values (${i.userId}, ${i.roleKey}, ${i.scopeType}, ${i.scopeId}, ${i.actorId}, ${i.expiresAt}, ${i.note})
		returning id`;
	await audit(sql, {
		actorId: i.actorId,
		action: 'role.assigned',
		targetType: 'user',
		targetId: i.userId,
		reason: i.note ?? undefined,
		meta: { role: i.roleKey, scope_type: i.scopeType, scope_id: i.scopeId, expires_at: i.expiresAt?.toISOString() ?? null },
		ipHash: i.ipHash
	});
	return row.id as string;
}

export async function revokeAssignment(sql: Sql, actorId: string, assignmentId: string, reason: string | null, ipHash: string | null) {
	if (!(await userCan(sql, actorId, 'roles.assign'))) throw new RightsError('Keine Berechtigung zur Rechtevergabe.');
	await sql.begin(async (tx) => {
		const [a] = await tx`select id, user_id, role_key from role_assignments where id = ${assignmentId} and revoked_at is null for update`;
		if (!a) throw new RightsError('Zuweisung nicht gefunden.');
		if (a.role_key === 'superadmin') {
			const [{ n }] = await tx`select count(*)::int as n from role_assignments
				where role_key = 'superadmin' and revoked_at is null and (expires_at is null or expires_at > now())`;
			if (n <= 1) throw new RightsError('Die letzte Betreiberrolle kann nicht entzogen werden.');
		}
		await tx`update role_assignments set revoked_at = now(), revoked_by = ${actorId} where id = ${assignmentId}`;
		await audit(tx as unknown as Sql, {
			actorId,
			action: 'role.revoked',
			targetType: 'user',
			targetId: a.user_id,
			reason: reason ?? undefined,
			meta: { role: a.role_key, assignment: assignmentId },
			ipHash
		});
	});
}
