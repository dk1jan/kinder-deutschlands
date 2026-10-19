import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { allItems, deleteItem, saveItem, situations } from '$lib/server/alltag/compass';
import { isUuid } from '$lib/server/angebote/common';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'compass.edit');
	const sql = db();
	return { situations: await situations(sql), items: await allItems(sql), lage: event.url.searchParams.get('lage') ?? '' };
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'compass.edit');
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		try {
			await saveItem(db(), user.id, isUuid(id) ? id : null, {
				situation: String(f.get('situation') ?? ''),
				kind: f.get('kind') === 'info' ? 'info' : 'schritt',
				section: String(f.get('section') ?? '') || null,
				title: String(f.get('title') ?? '').slice(0, 200),
				body: String(f.get('body') ?? '').slice(0, 1000),
				url: String(f.get('url') ?? '') || null,
				source: String(f.get('source') ?? '').slice(0, 120) || null,
				sort: Number(f.get('sort')) || 100
			});
			return { ok: 'Gespeichert – Prüfdatum auf heute gesetzt.' };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	},
	loeschen: async (event) => {
		const user = await requireAction(event, 'compass.edit');
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		await deleteItem(db(), user.id, id);
		return { ok: 'Gelöscht.' };
	}
};
