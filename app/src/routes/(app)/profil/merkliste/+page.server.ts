import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { isUuid } from '$lib/server/angebote/common';
import { calendarFeed, hasCalendarFeed, merkliste, revokeCalendarFeed, toggleSaved, type SavedKind } from '$lib/server/angebote/saved';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [items, feed] = await Promise.all([merkliste(sql, user.id), hasCalendarFeed(sql, user.id)]);
	return {
		items: items.map((i) => ({ ...i, when: i.when?.toISOString() ?? null, end: i.end?.toISOString() ?? null, deadline: i.deadline?.toISOString() ?? null, remindAt: i.remindAt?.toISOString() ?? null })),
		feed
	};
};

export const actions: Actions = {
	entfernen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const kind = String(f.get('kind')) as SavedKind;
		const id = String(f.get('id') ?? '');
		const occ = String(f.get('am') ?? '') || null;
		if (!['event', 'offer', 'notice', 'listing'].includes(kind) || !isUuid(id)) return fail(400, { error: 'Ungültig.' });
		try {
			const on = await toggleSaved(db(), user.id, kind, id, occ);
			// toggle hat wieder angelegt (Doppelklick) → nochmal entfernen
			if (on) await toggleSaved(db(), user.id, kind, id, occ);
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
		return { removed: true };
	},
	kalender: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const url = await calendarFeed(db(), user.id, f.get('neu') === '1');
		return { feedUrl: url || null };
	},
	kalenderAus: async (event) => {
		const user = requireMember(event);
		await revokeCalendarFeed(db(), user.id);
		return { feedOff: true };
	}
};
