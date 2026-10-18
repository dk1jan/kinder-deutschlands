import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'knowledge.edit');
	const rows = await db()`select k.slug, k.title, k.status, k.visibility, k.consent, k.reviewed_at, k.updated_at, t.name as topic from knowledge k left join topics t on t.key = k.topic_key
		where k.status <> 'archiviert' order by k.updated_at desc`;
	return { rows };
};
