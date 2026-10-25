import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/server/ratelimit';
import { regenAt, regenText, REGEN_ATTRIBUTION } from '$lib/server/regen';

// F-057: Regen in den nächsten 2 Stunden am Kartenpunkt (DWD-Radar RV über Bright Sky). Öffentlich, der Punkt wird nicht gespeichert;
// abgefragt wird nur vom Server aus, auf ~1 km gerundet. Bei Ausfall kommt „kein Hinweis“, kein Fehler.
export const GET: RequestHandler = async ({ url, getClientAddress }) => {
	if (!rateLimit(`regen:${getClientAddress()}`, 40, 60_000)) error(429, 'Zu viele Anfragen.');
	const lon = Number(url.searchParams.get('lon'));
	const lat = Number(url.searchParams.get('lat'));
	if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 5 || lon > 16 || lat < 47 || lat > 56) error(400, 'Ungültiger Punkt.');
	const r = await regenAt(lat, lon);
	return json({ text: regenText(r), now: r?.now ?? 0, peak: r?.peak ?? 0, source: REGEN_ATTRIBUTION }, { headers: { 'cache-control': 'public, max-age=120' } });
};
