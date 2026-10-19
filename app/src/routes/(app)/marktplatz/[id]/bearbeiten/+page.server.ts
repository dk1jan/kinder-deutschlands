import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { getListing, updateListing } from '$lib/server/alltag/market';
import { listingFromForm } from '$lib/server/alltag/forms';
import { formValues } from '$lib/server/angebote/forms';
import { isUuid } from '$lib/server/angebote/common';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	const l = await getListing(db(), user.id, event.params.id);
	if (!l || !l.mine || l.status === 'entfernt') error(404, 'Anzeige nicht gefunden.');
	const s = (x: unknown) => (x === null || x === undefined ? [] : [String(x)]);
	return {
		id: l.id,
		title: l.title,
		region: l.regionCode ? { code: l.regionCode, name: l.regionName ?? l.regionCode } : null,
		values: {
			kind: [l.kind], category: [l.category], title: [l.title], description: [l.description], price: s(l.priceCents !== null ? (l.priceCents / 100).toString().replace('.', ',') : null),
			negotiable: l.negotiable ? ['on'] : [], condition: s(l.condition), size: s(l.sizeText), age_min: s(l.ageMin), age_max: s(l.ageMax), region_code: s(l.regionCode),
			safety_ack: l.safetyAck ? ['on'] : [], private: ['on']
		} as Record<string, string[]>
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		let held: string | null;
		try {
			held = await updateListing(db(), user.id, event.params.id, listingFromForm(f));
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
		redirect(303, `/marktplatz/${event.params.id}${held ? '?pruefung=1' : ''}`);
	}
};
