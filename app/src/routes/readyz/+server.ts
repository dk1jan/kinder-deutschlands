import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

// Bereit = Datenbank erreichbar. Gibt keine Details preis.
export const GET: RequestHandler = async () => {
	try {
		await db()`select 1`;
		return new Response('ready', { headers: { 'cache-control': 'no-store' } });
	} catch {
		return new Response('not ready', { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
