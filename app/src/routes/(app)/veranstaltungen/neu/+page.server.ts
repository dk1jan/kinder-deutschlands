import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { createEvent } from '$lib/server/angebote/events';
import { eventFromForm, formValues } from '$lib/server/angebote/forms';
import { ownerChoices, parseOwner } from '$lib/server/angebote/eventpage';
import { isUuid } from '$lib/server/angebote/common';
import { tileState } from '$lib/server/import/tiles';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const owners = await ownerChoices(sql, user.id);
	const slug = event.url.searchParams.get('einrichtung');
	const pre = slug ? owners.find((o) => o.slug === slug) : null;
	const ort = event.url.searchParams.get('ort');
	const [place] = isUuid(ort) ? await sql`select id, name, ST_X(location) as lon, ST_Y(location) as lat from places where id = ${ort} and status = 'aktiv'` : [];
	const tiles = await tileState(sql).catch(() => null);
	return {
		owners: owners.map(({ value, label }) => ({ value, label })),
		owner: pre?.value ?? owners[0].value,
		place: place ? { id: place.id as string, name: place.name as string } : null,
		values: (place ? { place_id: [place.id as string] } : {}) as Record<string, string[]>,
		center: (place ? [place.lon, place.lat] : [8.8017, 53.0793]) as [number, number],
		tiles: !!tiles?.present
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const sql = db();
		try {
			const owner = parseOwner(f.get('owner'));
			const r = await createEvent(sql, user.id, eventFromForm(f), owner);
			redirect(303, `/veranstaltungen/${r.id}?neu=1${r.shareToken ? `&t=${r.shareToken}` : ''}`);
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
	}
};
