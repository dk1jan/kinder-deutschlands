import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { isUuid } from '$lib/server/angebote/common';
import { organizerView, updateInvitation } from '$lib/server/alltag/invitations';
import { invitationFromForm } from '$lib/server/alltag/forms';
import { dateToLocal, formValues } from '$lib/server/angebote/forms';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	const sql = db();
	let v;
	try {
		v = await organizerView(sql, user.id, event.params.id);
	} catch {
		error(404, 'Diese Einladung gibt es nicht (mehr).');
	}
	const i = v.inv;
	const [p] = i.placeId ? await sql`select id, name from places where id = ${i.placeId}` : [];
	const s = (x: unknown) => (x === null || x === undefined || x === '' ? [] : [String(x)]);
	return {
		id: i.id,
		title: i.title,
		place: p ? { id: p.id as string, name: (p.name as string | null) ?? 'Ort aus der Karte' } : null,
		values: {
			title: [i.title], message: [i.message], start: [dateToLocal(i.startsAt)], end: s(i.endsAt ? dateToLocal(i.endsAt) : null), place_text: s(i.placeText),
			address_after_rsvp: i.addressAfterRsvp ? ['on'] : ['off'], place_id: s(i.placeId), rsvp_until: s(i.rsvpUntil ? dateToLocal(i.rsvpUntil, true) : null),
			max_guests: s(i.maxGuests), guests_see_list: i.guestsSeeList ? ['on'] : ['off']
		} as Record<string, string[]>
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		try {
			await updateInvitation(db(), user.id, event.params.id, invitationFromForm(f));
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
		redirect(303, `/einladungen/${event.params.id}`);
	}
};
