import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { resolveQr } from '$lib/server/qr';
import { cardForViewer } from '$lib/server/cards';
import { rateLimit } from '$lib/server/ratelimit';
import { sendRequest, ContactError } from '$lib/server/contacts';
import { requireMember } from '$lib/server/guard';
import { cleanText } from '$lib/server/validate';

const GONE = 'Dieser QR-Code ist nicht (mehr) gültig. Vielleicht wurde er gesperrt oder ist abgelaufen.';

export const load: PageServerLoad = async ({ params, locals, getClientAddress, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!rateLimit(`qr:${getClientAddress()}`, 120, 3_600_000)) error(429, 'Zu viele Aufrufe. Bitte später erneut versuchen.');
	const sql = db();
	const qr = await resolveQr(sql, params.token);
	if (!qr) error(404, GONE);
	const viewerId = locals.session?.mfaVerified ? (locals.user?.id ?? null) : null;
	const res = await cardForViewer(sql, qr.userId, viewerId);
	if (!res) error(404, GONE);
	return { ...res, temporary: qr.kind === 'befristet' };
};

export const actions: Actions = {
	anfragen: async (event) => {
		const user = requireMember(event);
		const sql = db();
		const qr = await resolveQr(sql, event.params.token);
		if (!qr) return fail(404, { error: GONE });
		try {
			const r = await sendRequest(sql, user.id, qr.userId, cleanText((await event.request.formData()).get('message'), 300), 'qr');
			return { done: r };
		} catch (e) {
			if (e instanceof ContactError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
