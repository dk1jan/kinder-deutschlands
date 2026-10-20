import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { appUrl } from '$lib/server/config';
import { getLegal, legalBlocks, privacyDraft } from '$lib/server/legal';

export const load: PageServerLoad = async () => {
	const l = await getLegal(db());
	return { blocks: legalBlocks(l.privacy_text ?? privacyDraft(l, appUrl())), checkedAt: l.checked_at, updatedAt: l.updated_at };
};
