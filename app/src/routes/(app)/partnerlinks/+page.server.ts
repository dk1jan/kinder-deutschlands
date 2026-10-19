import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getAffiliate } from '$lib/server/affiliate';

export const load: PageServerLoad = async () => {
	const a = await getAffiliate(db());
	return { enabled: a.enabled && !!a.amazon_tag };
};
