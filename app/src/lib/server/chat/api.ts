import { error, json, type RequestEvent } from '@sveltejs/kit';
import { requireSameOrigin } from '../api';
import { db, type Sql } from '../db';
import { PostError } from '../community/posts';
import { ChatError, chatEnabled } from './synapse';

/** Gemeinsamer Rahmen für Chat-Endpunkte: gleiche Herkunft, vollständig angemeldet, aktives Konto, verständliche Fehler. */
export async function chatApi<T>(event: RequestEvent, fn: (sql: Sql, userId: string) => Promise<T>, opts: { needsChat?: boolean } = {}) {
	// Schreibende Aufrufe: Origin muss stimmen. Lesende (GET) senden Browser ohne Origin – dort Fetch-Metadaten prüfen.
	if (event.request.method !== 'GET') requireSameOrigin(event);
	else {
		const site = event.request.headers.get('sec-fetch-site');
		if (site && site !== 'same-origin' && site !== 'none') error(403, 'Anfrage von fremder Herkunft.');
	}
	const { user, session } = event.locals;
	if (!user || !session?.mfaVerified) error(401, 'Bitte zuerst anmelden.');
	if (user.status !== 'active') error(403, 'Konto nicht aktiv.');
	if (opts.needsChat !== false && !chatEnabled()) return json({ error: 'Chat ist auf diesem Server noch nicht eingerichtet.' }, { status: 503 });
	try {
		return json(await fn(db(), user.id));
	} catch (e) {
		if (e instanceof ChatError || e instanceof PostError) return json({ error: e.message }, { status: 400 });
		console.error('[chat] API:', (e as Error).message);
		return json({ error: 'Chat-Server gerade nicht erreichbar. Bitte gleich noch einmal versuchen.' }, { status: 502 });
	}
}

export async function body(event: RequestEvent): Promise<Record<string, unknown>> {
	try {
		const b = await event.request.json();
		return b && typeof b === 'object' ? b : {};
	} catch {
		return {};
	}
}
