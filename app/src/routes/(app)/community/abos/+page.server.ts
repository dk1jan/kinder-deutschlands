import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError, setSubscription, subscriptions } from '$lib/server/community/posts';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [subs, topics] = await Promise.all([subscriptions(sql, user.id), sql`select key, name, description from topics order by sort`]);
	return { subs, topics };
};

export const actions: Actions = {
	setzen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		try {
			await setSubscription(db(), user.id, f.get('kind') === 'region' ? 'region' : 'topic', String(f.get('key') ?? ''), f.get('on') === '1');
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: true };
	}
};
