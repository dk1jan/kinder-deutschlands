import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getKnowledge } from '$lib/server/community/knowledge';
import { userCan } from '$lib/server/roles';

export const load: PageServerLoad = async ({ locals, params }) => {
	const sql = db();
	const uid = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const editor = uid ? await userCan(sql, uid, 'knowledge.edit') : false;
	const k = await getKnowledge(sql, params.slug, { member: !!uid, editor });
	if (!k) error(404, uid ? 'Eintrag nicht gefunden.' : 'Eintrag nicht gefunden oder nur für Mitglieder.');
	return { k, editor };
};
