import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { aerialLoaded, aerialTile, loadAerial } from '$lib/server/aerial';
import { rateLimit } from '$lib/server/ratelimit';

// Durchsichtige Kachel für „kein Luftbild hier“ – die Karte darunter bleibt sichtbar
const EMPTY = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64');

// Luftbildkacheln über den eigenen Server (Datenschutz: Besucher-IP geht nicht an den Anbieter).
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	if (!rateLimit(`luftbild:${getClientAddress()}`, 1500, 60_000)) error(429, 'Zu viele Anfragen.');
	const z = Number(params.z);
	const x = Number(params.x);
	const y = Number(params.y.replace(/\.jpg$/, ''));
	if (!aerialLoaded()) await loadAerial(db()).catch(() => {});
	let t;
	try {
		t = await aerialTile(z, x, y);
	} catch {
		error(502, 'Luftbild gerade nicht erreichbar.');
	}
	if (!t) return new Response(EMPTY, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
	return new Response(t.body as unknown as BodyInit, {
		headers: { 'content-type': t.type, 'cache-control': t.cache === 'kurz' ? 'public, max-age=86400' : 'public, max-age=2592000' }
	});
};
