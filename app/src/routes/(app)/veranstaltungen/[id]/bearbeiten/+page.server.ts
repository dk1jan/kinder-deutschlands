import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { getEvent, ruleToChoice, updateEvent } from '$lib/server/angebote/events';
import { eventFromForm, eventValues, formValues } from '$lib/server/angebote/forms';
import { isUuid } from '$lib/server/angebote/common';
import { tileState } from '$lib/server/import/tiles';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	const sql = db();
	const d = await getEvent(sql, { id: user.id }, event.params.id, null);
	if (!d || d.needsLogin || !d.editor) error(404, 'Termin nicht gefunden oder keine Berechtigung.');
	const [r] = await sql`select e.region_code, r.name, e.source_key from events e left join regions r on r.code = e.region_code where e.id = ${event.params.id}`;
	const e = d.event;
	const tiles = await tileState(sql).catch(() => null);
	return {
		id: e.id,
		title: e.title,
		imported: !!r?.source_key,
		owner: e.org ? 'org' : e.origin === 'mitglied' ? 'ich' : 'redaktion',
		ownerLabel: e.org ? e.org.name : e.origin === 'mitglied' ? 'Ich als Mitglied' : 'Redaktion',
		values: eventValues(e, ruleToChoice(e.rrule, e.startsAt), r?.region_code ?? null),
		region: r?.region_code ? { code: r.region_code as string, name: r.name as string } : null,
		place: e.place,
		center: (e.lat !== null && e.lon !== null ? [e.lon, e.lat] : [8.8017, 53.0793]) as [number, number],
		tiles: !!tiles?.present
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		try {
			await updateEvent(db(), user.id, event.params.id, eventFromForm(f));
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
		redirect(303, `/veranstaltungen/${event.params.id}`);
	}
};
