// Persönlicher Kalender-Link (Abo): nur gemerkte Termine und Fristen. Der Link ist geheim und jederzeit erneuerbar.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { feedIcs } from '$lib/server/angebote/saved';

export const GET: RequestHandler = async ({ params }) => {
	const ics = await feedIcs(db(), params.token);
	if (!ics) error(404, 'Dieser Kalender-Link ist nicht (mehr) gültig.');
	return new Response(ics, {
		headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
	});
};
