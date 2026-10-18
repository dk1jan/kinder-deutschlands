import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getPlace, reportPlace, toggleFavorite } from '$lib/server/places';
import { isUuid } from '$lib/server/contacts';
import { requireMember } from '$lib/server/guard';
import { userCan } from '$lib/server/roles';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { audit } from '$lib/server/audit';
import { REPORT_KINDS } from '$lib/places';
import { tileState } from '$lib/server/import/tiles';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!isUuid(params.id)) error(404, 'Diesen Ort gibt es nicht.');
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const p = await getPlace(sql, params.id, viewer);
	if (!p) error(404, 'Diesen Ort gibt es nicht.');
	if (p.status === 'zusammengefuehrt') {
		const [m] = await sql`select merged_into from places where id = ${p.id}`;
		if (m?.merged_into) redirect(301, `/orte/${m.merged_into}`);
	}
	const editor = viewer ? await userCan(sql, viewer, 'data.edit') : false;
	if (p.status !== 'aktiv' && !editor && !(p.status === 'pruefung' && p.createdBy === viewer)) error(404, 'Diesen Ort gibt es nicht (mehr).');
	const tiles = await tileState(sql);
	return { place: { ...p, createdBy: undefined }, editor, member: !!viewer, mine: !!viewer && p.createdBy === viewer, tiles: !!tiles?.present };
};

export const actions: Actions = {
	merken: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const on = await toggleFavorite(db(), user.id, event.params.id);
		return { favorite: on };
	},
	melden: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`meldung:${user.id}`, 10, 24 * 60 * 60 * 1000)) return fail(429, { reportError: 'Du hast heute schon viele Meldungen geschickt. Danke! Bitte morgen weiter.' });
		const f = await event.request.formData();
		const kind = String(f.get('kind') ?? '');
		if (!(kind in REPORT_KINDS)) return fail(400, { reportError: 'Bitte wähle aus, was nicht stimmt.' });
		const message = cleanText(f.get('message'), 1000) || null;
		const sql = db();
		const id = await reportPlace(sql, user.id, event.params.id, kind, message);
		if (!id) error(404);
		await audit(sql, { actorId: user.id, action: 'place.reported', targetType: 'place', targetId: event.params.id, meta: { kind } });
		return { reported: true };
	}
};
