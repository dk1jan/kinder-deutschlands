import type { LayoutServerLoad } from './$types';
import { requireAction } from '$lib/server/guard';
import { db } from '$lib/server/db';
import { userCan } from '$lib/server/roles';

export const load: LayoutServerLoad = async (event) => {
	const user = await requireAction(event, 'admin.access');
	const sql = db();
	const [users, rights, audit, settings, data, moderation, groups, knowledge] = await Promise.all([
		userCan(sql, user.id, 'users.view'),
		userCan(sql, user.id, 'roles.assign'),
		userCan(sql, user.id, 'audit.view'),
		userCan(sql, user.id, 'settings.manage'),
		userCan(sql, user.id, 'data.view'),
		sql`select exists(select 1 from role_assignments a join role_permissions p on p.role_key = a.role_key where a.user_id = ${user.id} and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()) and p.action in ('*', 'content.moderate', 'protected_group.moderate')) as x`.then((r) => !!r[0].x),
		userCan(sql, user.id, 'group.manage'),
		userCan(sql, user.id, 'knowledge.edit')
	]);
	return { adminEmail: user.email, may: { users, rights, audit, settings, data, moderation, groups, knowledge } };
};
