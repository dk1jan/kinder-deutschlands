// Einladung per Link (M21): öffnen und antworten auch ohne Konto. Gäste ohne Konto bekommen einen Schlüssel im Cookie,
// damit sie ihre eigene Antwort ändern können.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { PostError } from '$lib/server/community/posts';
import { GUEST_COOKIE, chatTicket, guestView, rsvp, type Guest } from '$lib/server/alltag/invitations';
import { ChatError } from '$lib/server/chat/synapse';

function guest(event: Pick<RequestEvent, 'locals' | 'cookies'>): Guest {
	const userId = event.locals.user && event.locals.session?.mfaVerified ? event.locals.user.id : null;
	return { userId, keyFor: (id) => event.cookies.get(GUEST_COOKIE(id)) ?? null };
}

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow' });
	const v = await guestView(db(), event.params.token, guest(event));
	return { inv: v, member: !!guest(event).userId, token: event.params.token };
};

export const actions: Actions = {
	antworten: async (event) => {
		const ip = event.getClientAddress();
		if (!rateLimit(`einladung:${ip}`, 30, 3600_000)) return fail(429, { error: 'Zu viele Versuche. Bitte später noch einmal.' });
		const f = await event.request.formData();
		const g = guest(event);
		try {
			const r = await rsvp(db(), event.params.token, g, {
				name: String(f.get('name') ?? ''),
				answer: String(f.get('answer') ?? ''),
				kids: Number(f.get('kids') || 0),
				adults: Number(f.get('adults') || 0),
				note: String(f.get('note') ?? '') || null
			});
			if (r.guestKey)
				event.cookies.set(GUEST_COOKIE(r.invitationId), r.guestKey, { path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:', maxAge: 400 * 86_400 });
			return { saved: String(f.get('answer')) };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	},
	chat: async (event) => {
		const user = requireMember(event);
		try {
			return { roomId: await chatTicket(db(), event.params.token, user.id) };
		} catch (e) {
			if (e instanceof PostError || e instanceof ChatError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
