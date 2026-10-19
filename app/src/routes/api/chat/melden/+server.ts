// Chatnachricht melden – die meldende Person gibt den Wortlaut ausdrücklich frei (Häkchen in der Oberfläche).
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { reportChat } from '$lib/server/chat/report';
import { rateLimit } from '$lib/server/ratelimit';
import { ChatError } from '$lib/server/chat/synapse';

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(event, async (sql, userId) => {
		if (b.consent !== true) throw new ChatError('Bitte bestätige, dass du die Nachricht zur Prüfung freigibst.');
		if (!rateLimit(`chatmelden:${userId}`, 20, 24 * 3600 * 1000)) throw new ChatError('Heute schon viele Meldungen – danke!');
		await reportChat(sql, userId, {
			roomId: String(b.roomId ?? ''),
			eventId: String(b.eventId ?? ''),
			reason: String(b.reason ?? ''),
			message: typeof b.message === 'string' && b.message.trim() ? b.message.trim() : null,
			messages: Array.isArray(b.messages) ? (b.messages as never[]) : []
		});
		return { ok: true };
	});
};
