import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { parseBbox, placesInBbox } from '$lib/server/places';
import { rateLimit } from '$lib/server/ratelimit';

// Öffentliche Kartenpunkte im Ausschnitt. Nur Orte, keine Personen.
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`orte:${getClientAddress()}`, 240, 60_000)) error(429, 'Zu viele Anfragen.');
	const b = parseBbox(url.searchParams.get('bbox'));
	if (!b) error(400, 'Ungültiger Kartenausschnitt.');
	const list = (k: string) => (url.searchParams.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
	const data = await placesInBbox(db(), b, list('k'), list('m'));
	return json(data, { headers: { 'cache-control': 'public, max-age=60' } });
};
