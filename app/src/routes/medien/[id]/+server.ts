import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { isUuid } from '$lib/server/contacts';
import { canSeeMedia } from '$lib/server/community/posts';
import { readImage } from '$lib/server/community/media';

// Bilder nur mit Berechtigung: Beitragsbilder wie der Beitrag (Gruppen!), Ortsfotos nach Freigabe öffentlich.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!isUuid(params.id)) error(404, 'Nicht gefunden.');
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const sql = db();
	if (!(await canSeeMedia(sql, viewer, params.id))) error(404, 'Nicht gefunden.');
	const data = await readImage(params.id);
	if (!data) error(404, 'Nicht gefunden.');
	const [m] = await sql`select purpose, status from media where id = ${params.id}`;
	const publicImg = m?.purpose === 'ort' && m.status === 'sichtbar';
	return new Response(data as unknown as BodyInit, {
		headers: {
			'content-type': 'image/webp',
			'cache-control': publicImg ? 'public, max-age=604800' : 'private, max-age=3600',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; img-src 'self'"
		}
	});
};
