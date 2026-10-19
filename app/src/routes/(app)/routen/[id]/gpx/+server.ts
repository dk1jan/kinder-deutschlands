// Route als GPX-Datei (für Navigations- und Wander-Apps).
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appUrl } from '$lib/server/config';
import { isUuid } from '$lib/server/angebote/common';
import { getRoute, toGpx } from '$lib/server/routes';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.id)) error(404);
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const r = await getRoute(db(), viewer, params.id);
	if (!r) error(404);
	const name = r.title.replace(/[^A-Za-z0-9ÄÖÜäöüß -]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'route';
	return new Response(toGpx(r.title, r.coords, `${appUrl()}/routen/${r.id}`), {
		headers: { 'content-type': 'application/gpx+xml; charset=utf-8', 'content-disposition': `attachment; filename="${encodeURIComponent(name)}.gpx"` }
	});
};
