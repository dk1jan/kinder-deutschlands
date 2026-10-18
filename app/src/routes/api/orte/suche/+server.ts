import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { searchPlaces } from '$lib/server/places';
import { rateLimit } from '$lib/server/ratelimit';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`suche:${getClientAddress()}`, 60, 60_000)) error(429, 'Zu viele Anfragen.');
	return json(await searchPlaces(db(), url.searchParams.get('q') ?? ''), { headers: { 'cache-control': 'public, max-age=60' } });
};
