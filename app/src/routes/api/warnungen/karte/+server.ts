import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rateLimit } from '$lib/server/ratelimit';
import { mapData } from '$lib/server/warnings/store';

// Warnkarte (F-053): aktive Wetterwarnungen (DWD ab Stufe 2) als Flächen. Öffentlich wie /warnungen.
let cache: { at: number; body: unknown } | null = null;
export const GET: RequestHandler = async ({ getClientAddress }) => {
	if (!rateLimit(`warnkarte:${getClientAddress()}`, 60, 60_000)) error(429, 'Zu viele Anfragen.');
	if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), body: await mapData(db()) };
	return json(cache.body, { headers: { 'cache-control': 'public, max-age=60' } });
};
