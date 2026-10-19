import type { PageServerLoad } from './$types';
import { requireMember } from '$lib/server/guard';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	return { mit: (event.url.searchParams.get('mit') ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 9) };
};
