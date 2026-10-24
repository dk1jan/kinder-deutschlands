import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { cleanPage, FeedbackError, submitFeedback } from '$lib/server/feedback';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const kind = event.url.searchParams.get('art');
	return { page: cleanPage(event.url.searchParams.get('seite')), kind: kind === 'fehler' || kind === 'korrektur' || kind === 'allgemein' ? kind : 'fehler' };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const values = { kind: String(f.get('kind') ?? ''), body: String(f.get('body') ?? ''), page: String(f.get('page') ?? '') };
		try {
			await submitFeedback(db(), user.id, values);
		} catch (e) {
			if (e instanceof FeedbackError) return fail(400, { error: e.message, values });
			throw e;
		}
		return { done: true };
	}
};
