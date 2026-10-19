import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { applyOrg } from '$lib/server/angebote/orgs';
import { formValues, orgFromForm } from '$lib/server/angebote/forms';
import { tileState } from '$lib/server/import/tiles';
import { cleanText } from '$lib/server/validate';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const tiles = await tileState(db()).catch(() => null);
	return { tiles: !!tiles?.present };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		if (f.get('ok') !== 'on') return fail(400, { error: 'Bitte bestätige, dass du für die Einrichtung handeln darfst.', values: formValues(f) });
		try {
			const o = await applyOrg(db(), user.id, orgFromForm(f), { role: cleanText(f.get('role'), 200) ?? '', proof: cleanText(f.get('proof'), 1000) ?? '' });
			return { done: o.slug };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
	}
};
