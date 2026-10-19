// Event-Chat anmelden (der Browser hat den verschlüsselten Raum angelegt).
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { attachEventChat } from '$lib/server/angebote/eventchat';
import { isUuid } from '$lib/server/angebote/common';
import { ChatError } from '$lib/server/chat/synapse';
import { PostError } from '$lib/server/community/posts';

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(event, async (sql, userId) => {
		const id = typeof b.eventId === 'string' ? b.eventId : '';
		const occ = typeof b.occurrence === 'string' ? b.occurrence : '';
		if (!isUuid(id) || typeof b.roomId !== 'string') throw new ChatError('Ungültig.');
		try {
			await attachEventChat(sql, userId, id, occ, b.roomId);
		} catch (e) {
			if (e instanceof PostError) throw new ChatError(e.message);
			throw e;
		}
		return { ok: true };
	});
};
