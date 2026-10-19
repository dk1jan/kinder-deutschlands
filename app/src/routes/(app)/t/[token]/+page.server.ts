// Beitritt zu einem Treffen über den QR-Code (M06). Nur angemeldete Mitglieder.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { ticket, treffenByToken } from '$lib/server/chat/rooms';
import { chatEnabled, ChatError } from '$lib/server/chat/synapse';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	if (!chatEnabled()) return { treffen: null };
	const t = await treffenByToken(db(), event.params.token).catch(() => null);
	return { treffen: t ? { name: t.name ?? 'Treffen', members: t.members, expiresAt: t.expiresAt.toISOString() } : null };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		try {
			return { roomId: await ticket(db(), user.id, event.params.token) };
		} catch (e) {
			return fail(400, { error: e instanceof ChatError ? e.message : 'Beitritt gerade nicht möglich.' });
		}
	}
};
