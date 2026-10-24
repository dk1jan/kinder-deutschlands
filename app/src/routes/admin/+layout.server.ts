import type { LayoutServerLoad } from './$types';
import { requireAction } from '$lib/server/guard';
import { db } from '$lib/server/db';
import { userCan } from '$lib/server/roles';

export const load: LayoutServerLoad = async (event) => {
	const user = await requireAction(event, 'admin.access');
	const sql = db();
	const [users, rights, audit, settings, data, moderation, groups, knowledge, orgs, notices, compass, approvals, stats, affiliate, routes, broadcast, team, feedback] = await Promise.all([
		userCan(sql, user.id, 'users.view'),
		userCan(sql, user.id, 'roles.assign'),
		userCan(sql, user.id, 'audit.view'),
		userCan(sql, user.id, 'settings.manage'),
		userCan(sql, user.id, 'data.view'),
		sql`select exists(select 1 from role_assignments a join role_permissions p on p.role_key = a.role_key where a.user_id = ${user.id} and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()) and p.action in ('*', 'content.moderate', 'protected_group.moderate')) as x`.then((r) => !!r[0].x),
		userCan(sql, user.id, 'group.manage'),
		userCan(sql, user.id, 'knowledge.edit'),
		userCan(sql, user.id, 'orgs.verify'),
		sql`select exists(select 1 from role_assignments a join role_permissions p on p.role_key = a.role_key where a.user_id = ${user.id} and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()) and p.action in ('*', 'notices.edit')) as x`.then((r) => !!r[0].x),
		userCan(sql, user.id, 'compass.edit'),
		import('$lib/server/approvals').then((a) => a.openCount(sql, user.id)),
		userCan(sql, user.id, 'stats.view'),
		userCan(sql, user.id, 'settings.manage'),
		userCan(sql, user.id, 'routes.edit'),
		import('$lib/server/broadcasts').then((b) => b.broadcastRights(sql, user.id)).then((r) => r.any),
		sql`select kd_is_team(${user.id}::uuid) as t`.then((r) => !!r[0]?.t),
		userCan(sql, user.id, 'feedback.manage')
	]);
	const openFeedback = feedback ? await import('$lib/server/feedback').then((f) => f.openFeedbackCount(sql)) : 0;
	const approver = rights || (await userCan(sql, user.id, 'users.suspend'));
	const [me] = await sql`select contact_id from user_profiles where user_id = ${user.id}`;
	return { adminId: me ? `${me.contact_id.slice(0, 3)}-${me.contact_id.slice(3, 6)}-${me.contact_id.slice(6)}` : '', may: { users, rights, audit, settings, data, moderation, groups, knowledge, orgs, notices, compass, approvals: approver, stats, affiliate, routes, broadcast, team, feedback }, openApprovals: approvals, openFeedback };
};
