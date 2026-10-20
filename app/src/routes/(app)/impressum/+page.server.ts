import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getLegal, imprintComplete, legalBlocks } from '$lib/server/legal';

export const load: PageServerLoad = async () => {
	const l = await getLegal(db());
	return { i: l.imprint, complete: imprintComplete(l.imprint), extra: legalBlocks(l.imprint_extra), checkedAt: l.checked_at };
};
