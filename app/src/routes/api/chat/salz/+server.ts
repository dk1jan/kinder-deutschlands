import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { chatEnabled, chatLocalpart, mxid } from '$lib/server/chat/synapse';
import { rateLimit } from '$lib/server/ratelimit';

// Chat-Kennung als Salz für die Ableitung des Chat-Schlüssels im Browser (D-066). Auch im Zwischenschritt der
// Zwei-Faktor-Anmeldung abrufbar (Sitzung vorhanden, Code noch offen) – die Kennung ist kein Geheimnis.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || !locals.session) error(401, 'Bitte anmelden.');
	if (request.headers.get('content-type')?.includes('application/json') !== true) error(415, 'JSON erwartet.');
	if (!chatEnabled()) error(503, 'Chat nicht eingerichtet.');
	if (!rateLimit(`salz:${locals.user.id}`, 30, 3_600_000)) error(429, 'Zu viele Anfragen.');
	const lp = await chatLocalpart(db(), locals.user.id);
	return json({ mxid: mxid(lp) }, { headers: { 'cache-control': 'no-store' } });
};
