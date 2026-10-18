import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listKnowledge } from '$lib/server/community/knowledge';
import { feed } from '$lib/server/community/posts';
import { userCan } from '$lib/server/roles';

export const load: PageServerLoad = async ({ locals, url }) => {
	const sql = db();
	const uid = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const editor = uid ? await userCan(sql, uid, 'knowledge.edit') : false;
	const topic = url.searchParams.get('thema');
	const q = url.searchParams.get('q');
	const [entries, topics, solved] = await Promise.all([
		listKnowledge(sql, { member: !!uid, editor: false, topic, q }),
		sql`select key, name from topics order by sort`,
		uid ? feed(sql, uid, { mode: 'geloest', topic, q, limit: 10 }) : Promise.resolve(null)
	]);
	return { entries, topics, solved: solved?.items ?? [], member: !!uid, editor, topic, q };
};
