import type { PageServerLoad } from './$types';
import { requireMember } from '$lib/server/guard';
export const load: PageServerLoad = async (event) => {
	requireMember(event);
	return {};
};
