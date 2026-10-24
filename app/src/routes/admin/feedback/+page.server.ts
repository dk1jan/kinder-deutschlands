import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { FeedbackError, handleFeedback, listFeedback } from '$lib/server/feedback';
import { isUuid } from '$lib/server/contacts';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'feedback.manage');
	const status = event.url.searchParams.get('status') ?? '';
	const kind = event.url.searchParams.get('art') ?? '';
	return { items: await listFeedback(db(), { status, kind }), status, kind };
};

export const actions: Actions = {
	bearbeiten: async (event) => {
		const user = await requireAction(event, 'feedback.manage');
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Dieses Feedback gibt es nicht mehr.' });
		try {
			await handleFeedback(db(), user.id, id, { status: f.get('status'), reply: f.get('reply') });
		} catch (e) {
			if (e instanceof FeedbackError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: 'Gespeichert.' };
	}
};
