import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { createInvitation } from '$lib/server/alltag/invitations';
import { invitationFromForm } from '$lib/server/alltag/forms';
import { formValues } from '$lib/server/angebote/forms';
import { isUuid } from '$lib/server/angebote/common';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const ort = event.url.searchParams.get('ort');
	const [p] = isUuid(ort) ? await db()`select id, name from places where id = ${ort} and status = 'aktiv'` : [];
	return { place: p ? { id: p.id as string, name: (p.name as string | null) ?? 'Ort aus der Karte' } : null };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		let id: string;
		try {
			id = (await createInvitation(db(), user.id, invitationFromForm(f))).id;
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
		redirect(303, `/einladungen/${id}?neu=1`);
	}
};
