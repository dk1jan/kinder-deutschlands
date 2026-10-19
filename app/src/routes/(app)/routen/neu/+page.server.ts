import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { createRoute, routeFromForm } from '$lib/server/routes';
import { userCan } from '$lib/server/roles';
import { tileState } from '$lib/server/import/tiles';
import { formValues } from '$lib/server/angebote/forms';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [u] = await sql`select ST_X(coalesce(r.center, ST_PointOnSurface(r.geom))) as lon, ST_Y(coalesce(r.center, ST_PointOnSurface(r.geom))) as lat
		from user_profiles p join regions r on r.code = p.region_code where p.user_id = ${user.id}`;
	const tiles = await tileState(sql).catch(() => null);
	return {
		center: (u?.lon != null ? [u.lon, u.lat] : [8.8017, 53.0793]) as [number, number],
		tiles: !!tiles?.present,
		redaktion: await userCan(sql, user.id, 'routes.edit')
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		let r: { id: string; held: boolean };
		try {
			r = await createRoute(db(), user.id, routeFromForm(f), { asRedaktion: f.get('redaktion') === 'on' });
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
		redirect(303, `/routen/${r.id}${r.held ? '?neu=1' : ''}`);
	}
};
