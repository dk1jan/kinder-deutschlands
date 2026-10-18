import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userCan } from '$lib/server/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
	const u = locals.user;
	let canAdmin = false;
	let unread = 0;
	if (u && locals.session?.mfaVerified) {
		const sql = db();
		const [can, [n]] = await Promise.all([userCan(sql, u.id, 'admin.access'), sql`select count(*)::int as n from notifications where user_id = ${u.id} and read_at is null`]);
		canAdmin = can;
		unread = n.n;
	}
	return {
		theme: locals.theme,
		user: u ? { mfaVerified: !!locals.session?.mfaVerified } : null,
		canAdmin,
		unread
	};
};
