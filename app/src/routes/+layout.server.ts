import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userCan } from '$lib/server/roles';

export const load: LayoutServerLoad = async ({ locals }) => {
	const u = locals.user;
	let canAdmin = false;
	if (u && locals.session?.mfaVerified) {
		canAdmin = await userCan(db(), u.id, 'admin.access');
	}
	return {
		theme: locals.theme,
		user: u ? { mfaVerified: !!locals.session?.mfaVerified } : null,
		canAdmin
	};
};
