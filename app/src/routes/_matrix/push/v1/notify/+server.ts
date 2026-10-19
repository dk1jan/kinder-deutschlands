// Push-Gateway für den Chat-Server (Matrix Push Gateway API). Erhält nur Raum- und Ereigniskennung, keinen Inhalt.
// Erreichbar nur aus dem internen Netz (siehe hooks.server.ts); die Push-Schlüssel sind zufällig und geheim.
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { gateway } from '$lib/server/push';

export const POST: RequestHandler = async ({ request }) => {
	let body: Parameters<typeof gateway>[1];
	try {
		body = await request.json();
	} catch {
		return Response.json({ rejected: [] }, { status: 400 });
	}
	try {
		return Response.json(await gateway(db(), body));
	} catch (e) {
		console.error('[push] Gateway:', (e as Error).message);
		return Response.json({ rejected: [] });
	}
};
