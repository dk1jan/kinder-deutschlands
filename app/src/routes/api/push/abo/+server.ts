// Push auf diesem Gerät an- oder abmelden.
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { subscribe, unsubscribe, validSubscription } from '$lib/server/push';
import { ChatError } from '$lib/server/chat/synapse';

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(
		event,
		async (sql, userId) => {
			if (!validSubscription(b.subscription)) throw new ChatError('Ungültige Push-Anmeldung.');
			return { pushkey: await subscribe(sql, userId, b.subscription, typeof b.label === 'string' ? b.label : null) };
		},
		{ needsChat: false }
	);
};

export const DELETE: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(
		event,
		async (sql, userId) => {
			await unsubscribe(sql, userId, String(b.endpoint ?? ''));
			return { ok: true };
		},
		{ needsChat: false }
	);
};
