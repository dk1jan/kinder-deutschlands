import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { DataError, sourceDetail, updateSource } from '$lib/server/datacenter';
import { userCan } from '$lib/server/roles';

export const load: PageServerLoad = async (event) => {
	const user = await requireAction(event, 'data.view');
	const d = await sourceDetail(db(), event.params.key);
	if (!d) error(404, 'Quelle nicht gefunden.');
	return { ...d, mayEdit: await userCan(db(), user.id, 'data.import') };
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'data.import');
		try {
			await updateSource(db(), event.params.key, await event.request.formData(), user.id);
		} catch (e) {
			if (e instanceof DataError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: 'Gespeichert.' };
	}
};
