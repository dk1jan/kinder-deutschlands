import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { consentInfo, giveConsent } from '$lib/server/community/knowledge';
import { isUuid } from '$lib/server/contacts';
import { PostError } from '$lib/server/community/posts';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	const info = await consentInfo(db(), user.id, event.params.id);
	if (!info) error(404, 'Anfrage nicht gefunden.');
	return { info };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		try {
			await giveConsent(db(), user.id, event.params.id, f.get('yes') === '1');
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
		return { done: f.get('yes') === '1' ? 'ja' : 'nein' };
	}
};
