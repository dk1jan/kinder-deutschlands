import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { FREQUENCIES, INCLUDE, saveProfile } from '$lib/server/angebote/radar';
import { formValues, profileFromForm } from '$lib/server/angebote/forms';
import { regionNames } from '$lib/server/angebote/radarpage';
import { mailConfigured } from '$lib/server/mailer';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [u] = await sql`select region_code from user_profiles where user_id = ${user.id}`;
	return { regions: await regionNames(sql, u?.region_code ? [u.region_code] : []), include: INCLUDE, frequencies: FREQUENCIES, mail: mailConfigured() };
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		let id: string;
		try {
			id = await saveProfile(db(), user.id, null, profileFromForm(f));
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f), regions: await regionNames(db(), f.getAll('regions').map(String).filter(Boolean)) });
			throw e;
		}
		redirect(303, `/radar/${id}`);
	}
};
