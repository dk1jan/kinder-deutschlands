import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { parseBbox } from '$lib/server/places';
import { rateLimit } from '$lib/server/ratelimit';
import { isLayer, layerData } from '$lib/server/layers';

// Zusatzebenen der Familienkarte (Termine, Routen; Marktplatz/Hilfe nur angemeldet und je Gegend zusammengefasst).
export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
	if (!rateLimit(`ebenen:${getClientAddress()}`, 240, 60_000)) error(429, 'Zu viele Anfragen.');
	const b = parseBbox(url.searchParams.get('bbox'));
	if (!b) error(400, 'Ungültiger Kartenausschnitt.');
	const layers = (url.searchParams.get('e') ?? '').split(',').filter(isLayer);
	const days = Number(url.searchParams.get('tage') ?? 7);
	const data = await layerData(db(), locals.user?.id ?? null, b, [...new Set(layers)], { days: Number.isFinite(days) ? days : 7 });
	return json(data, { headers: { 'cache-control': locals.user ? 'private, no-store' : 'public, max-age=60' } });
};
