import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { createHelp } from '$lib/server/alltag/help';
import { helpFromForm } from '$lib/server/alltag/forms';
import { formValues } from '$lib/server/angebote/forms';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const [u] = await db()`select p.region_code as code, r.name from user_profiles p left join regions r on r.code = p.region_code where p.user_id = ${user.id}`;
	return { region: u?.code ? { code: u.code as string, name: u.name as string } : null, kind: event.url.searchParams.get('art') === 'biete' ? 'biete' : 'brauche' };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		let r: { id: string; held: string | null; crisis: boolean };
		try {
			r = await createHelp(db(), user.id, helpFromForm(f));
		} catch (e) {
			if (e instanceof PostError) {
				const v = formValues(f);
				const [reg] = v.region_code?.[0] ? await db()`select code, name from regions where code = ${v.region_code[0]}` : [];
				return fail(400, { error: e.message, values: v, region: reg ? { code: reg.code as string, name: reg.name as string } : null });
			}
			throw e;
		}
		const q = [r.held ? 'pruefung=1' : '', r.crisis ? 'krise=1' : ''].filter(Boolean).join('&');
		redirect(303, `/hilfe/${r.id}${q ? `?${q}` : ''}`);
	}
};
