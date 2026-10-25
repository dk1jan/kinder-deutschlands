import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rateLimit } from '$lib/server/ratelimit';
import { warningsAt } from '$lib/server/warnings/store';

// F-056: Gilt an diesem Kartenpunkt gerade eine Wetterwarnung (Stufe 2+)? Für „Lieber drinnen“ auf der Karte.
// Öffentlich wie /warnungen. Der Punkt wird nicht gespeichert; Rundung auf ~1 km (0,01°) schützt den Zwischenspeicher.
const cache = new Map<string, { at: number; body: unknown }>();
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`warnhier:${getClientAddress()}`, 60, 60_000)) error(429, 'Zu viele Anfragen.');
	const lon = Number(url.searchParams.get('lon'));
	const lat = Number(url.searchParams.get('lat'));
	if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 5 || lon > 16 || lat < 47 || lat > 56) error(400, 'Ungültiger Punkt.');
	const key = `${lon.toFixed(2)}:${lat.toFixed(2)}`;
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < 60_000) return json(hit.body, { headers: { 'cache-control': 'public, max-age=60' } });
	const list = await warningsAt(db(), Number(lon.toFixed(2)), Number(lat.toFixed(2)));
	const body = { n: list.length, top: list[0] ?? null };
	if (cache.size > 500) cache.clear();
	cache.set(key, { at: Date.now(), body });
	return json(body, { headers: { 'cache-control': 'public, max-age=60' } });
};
