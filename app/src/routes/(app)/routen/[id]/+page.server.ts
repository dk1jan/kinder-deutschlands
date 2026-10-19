import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { PostError } from '$lib/server/community/posts';
import { isUuid } from '$lib/server/angebote/common';
import { endReports, getRoute, removeRoute, reportRoute, reviewRoute } from '$lib/server/routes';
import { tileState } from '$lib/server/import/tiles';
import { cleanText } from '$lib/server/validate';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!isUuid(params.id)) error(404, 'Diese Route gibt es nicht.');
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const r = await getRoute(sql, viewer, params.id);
	if (!r) error(404, 'Diese Route gibt es nicht (mehr).');
	const tiles = await tileState(sql).catch(() => null);
	return { r, member: !!viewer, tiles: !!tiles?.present, isNew: url.searchParams.get('neu') === '1' };
};

async function run(fn: () => Promise<unknown>, ok: string) {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	erfahrung: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`route-meldung:${user.id}`, 20, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Meldungen.' });
		const f = await event.request.formData();
		return run(() => reportRoute(db(), user.id, event.params.id, String(f.get('kind') ?? ''), cleanText(f.get('text'), 300)), 'Danke für deine Erfahrung!');
	},
	pruefen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return run(() => reviewRoute(db(), user.id, event.params.id, f.get('decision') === 'ja', String(f.get('note') ?? '')), f.get('decision') === 'ja' ? 'Veröffentlicht.' : 'Nicht veröffentlicht.');
	},
	hinweiseErledigt: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		return run(() => endReports(db(), user.id, event.params.id), 'Hinweise als erledigt markiert.');
	},
	entfernen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const r = await run(() => removeRoute(db(), user.id, event.params.id), '');
		if ('error' in (r as object)) return r;
		redirect(303, '/routen');
	}
};
