import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { gridCell, placesGrid } from '$lib/server/places';
import { rateLimit } from '$lib/server/ratelimit';

// Deutschland-Übersicht der Karte (weit herausgezoomt): Anzahl Orte je Rasterfeld. Nur Zählungen, keine Personen.
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`orte-ueb:${getClientAddress()}`, 120, 60_000)) error(429, 'Zu viele Anfragen.');
	const z = Number(url.searchParams.get('z'));
	if (!Number.isFinite(z) || z < 0 || z > 22) error(400, 'Ungültige Zoomstufe.');
	const list = (k: string) => (url.searchParams.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
	const data = await placesGrid(db(), list('k'), list('m'), gridCell(z));
	return json(data, { headers: { 'cache-control': 'public, max-age=300' } });
};
