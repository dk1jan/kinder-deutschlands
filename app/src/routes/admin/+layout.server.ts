import type { LayoutServerLoad } from './$types';
import { requireAction } from '$lib/server/guard';
import { db } from '$lib/server/db';
import { userCan } from '$lib/server/roles';

export const load: LayoutServerLoad = async (event) => {
	const user = await requireAction(event, 'admin.access');
	const sql = db();
	const [users, rights, audit] = await Promise.all([
		userCan(sql, user.id, 'users.view'),
		userCan(sql, user.id, 'roles.assign'),
		userCan(sql, user.id, 'audit.view')
	]);
	return { adminEmail: user.email, may: { users, rights, audit } };
};
