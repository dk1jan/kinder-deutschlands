import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { cleanText } from '$lib/server/validate';
import { isUuid } from '$lib/server/angebote/common';
import { cancelInvitation, deleteInvitation, organizerView, renewLink, revokeLink } from '$lib/server/alltag/invitations';
import { chatEnabled } from '$lib/server/chat/synapse';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const v = await organizerView(db(), user.id, event.params.id);
		return { ...v, isNew: event.url.searchParams.get('neu') === '1', chat: chatEnabled() };
	} catch (e) {
		if (e instanceof PostError) error(404, 'Diese Einladung gibt es nicht (mehr).');
		throw e;
	}
};

async function run<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	erneuern: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		return run(async () => ({ renewed: await renewLink(db(), user.id, event.params.id) }));
	},
	abschalten: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		return run(async () => {
			await revokeLink(db(), user.id, event.params.id);
			return { revoked: true };
		});
	},
	absagen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return run(async () => {
			await cancelInvitation(db(), user.id, event.params.id, cleanText(f.get('note'), 300) ?? '');
			return { cancelled: true };
		});
	},
	loeschen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		if (f.get('sicher') !== 'on') return fail(400, { error: 'Bitte bestätigen.' });
		const r = await run(async () => {
			await deleteInvitation(db(), user.id, event.params.id);
			return null;
		});
		if (r) return r;
		redirect(303, '/einladungen');
	}
};
