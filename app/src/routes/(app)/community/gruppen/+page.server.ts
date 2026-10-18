import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { listGroups } from '$lib/server/community/groups';
import { userCan } from '$lib/server/roles';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	return { groups: await listGroups(sql, user.id), mayCreate: await userCan(sql, user.id, 'group.manage') };
};
