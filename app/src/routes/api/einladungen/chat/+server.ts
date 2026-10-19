// Gäste-Chat einer Einladung anmelden (der Browser hat den verschlüsselten Raum angelegt).
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { attachChat } from '$lib/server/alltag/invitations';
import { isUuid } from '$lib/server/angebote/common';
import { ChatError } from '$lib/server/chat/synapse';

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(event, async (sql, userId) => {
		const id = typeof b.invitationId === 'string' ? b.invitationId : '';
		if (!isUuid(id) || typeof b.roomId !== 'string') throw new ChatError('Ungültig.');
		await attachChat(sql, userId, id, b.roomId);
		return { ok: true };
	});
};
