import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { assignRole, loadAssignments, loadPermissions, revokeAssignment, RightsError } from '$lib/server/roles';
import { effectivePermissions, type ScopeType } from '$lib/server/rights';
import { ipHash } from '$lib/server/crypto';
import { key } from '$lib/server/config';

const SCOPES: ScopeType[] = ['global', 'region', 'topic', 'org', 'group'];

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'roles.assign');
	const sql = db();
	const [roles, perms, assignments, users, regions] = await Promise.all([
		sql`select key, name, description from roles order by name`,
		loadPermissions(sql),
		sql`select ra.id, ra.role_key, ra.scope_type, ra.scope_id, ra.granted_at, ra.expires_at, ra.note, u.email, u.id as user_id
			from role_assignments ra join users u on u.id = ra.user_id
			where ra.revoked_at is null order by u.email, ra.granted_at`,
		sql`select id, email from users where status = 'active' order by email limit 500`,
		sql`select code, name, level from regions order by code`
	]);
	const selected = event.url.searchParams.get('nutzer');
	let preview = null;
	if (selected && users.some((u) => u.id === selected)) {
		const a = await loadAssignments(sql, selected);
		preview = { email: users.find((u) => u.id === selected)!.email as string, rows: effectivePermissions(a, perms) };
	}
	return {
		roles: roles.map((r) => ({ key: r.key as string, name: r.name as string, description: r.description as string, actions: [...(perms.get(r.key) ?? [])].sort() })),
		assignments: assignments.map((a) => ({
			id: a.id as string,
			email: a.email as string,
			userId: a.user_id as string,
			role: a.role_key as string,
			scope: a.scope_type === 'global' ? 'überall' : `${a.scope_type}: ${a.scope_id}`,
			expires: a.expires_at ? new Date(a.expires_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'unbefristet',
			expired: !!a.expires_at && new Date(a.expires_at) <= new Date(),
			note: a.note as string | null
		})),
		users: users.map((u) => ({ id: u.id as string, email: u.email as string })),
		regions: regions.map((r) => ({ code: r.code as string, name: r.name as string, level: r.level as string })),
		preview,
		selected
	};
};

export const actions: Actions = {
	vergeben: async (event) => {
		const actor = await requireAction(event, 'roles.assign');
		const f = await event.request.formData();
		const scopeType = String(f.get('scope_type') ?? '') as ScopeType;
		if (!SCOPES.includes(scopeType)) return fail(400, { error: 'Unbekannter Geltungsbereich.' });
		const scopeIdRaw = String(f.get(scopeType === 'region' ? 'region_id' : 'scope_id') ?? '').trim();
		const expiresRaw = String(f.get('expires_at') ?? '').trim();
		const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
		if (expiresAt && (isNaN(expiresAt.getTime()) || expiresAt <= new Date())) return fail(400, { error: 'Das Ablaufdatum muss in der Zukunft liegen.' });
		try {
			await assignRole(db(), {
				actorId: actor.id,
				userId: String(f.get('user_id') ?? ''),
				roleKey: String(f.get('role_key') ?? ''),
				scopeType,
				scopeId: scopeType === 'global' ? null : scopeIdRaw || null,
				expiresAt,
				note: String(f.get('note') ?? '').trim().slice(0, 300) || null,
				ipHash: ipHash(event.getClientAddress(), key('ip'))
			});
		} catch (e) {
			if (e instanceof RightsError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: 'Rolle vergeben.' };
	},
	entziehen: async (event) => {
		const actor = await requireAction(event, 'roles.assign');
		const f = await event.request.formData();
		try {
			await revokeAssignment(db(), actor.id, String(f.get('id') ?? ''), String(f.get('reason') ?? '').trim() || null, ipHash(event.getClientAddress(), key('ip')));
		} catch (e) {
			if (e instanceof RightsError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: 'Rolle entzogen.' };
	}
};
