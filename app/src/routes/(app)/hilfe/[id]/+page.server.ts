import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { userCan } from '$lib/server/roles';
import { PostError } from '$lib/server/community/posts';
import { report } from '$lib/server/community/moderation';
import { isUuid } from '$lib/server/angebote/common';
import { getHelp, respondHelp, setHelpStatus } from '$lib/server/alltag/help';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404, 'Diesen Eintrag gibt es nicht.');
	const sql = db();
	const moderator = await userCan(sql, user.id, 'content.moderate');
	const h = await getHelp(sql, user.id, event.params.id, { moderator });
	if (!h || (h.status === 'entfernt' && !moderator)) error(404, 'Diesen Eintrag gibt es nicht (mehr).');
	return { h, held: event.url.searchParams.has('pruefung'), crisis: event.url.searchParams.has('krise') || h.crisis };
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
	antworten: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`hilfe-antwort:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Antworten. Bitte morgen weitermachen.' });
		const f = await event.request.formData();
		return run(async () => ({ responded: (await respondHelp(db(), user.id, event.params.id, String(f.get('message') ?? ''))).direct ? 'direkt' : 'angefragt' }));
	},
	status: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const s = String(f.get('status'));
		return run(async () => {
			await setHelpStatus(db(), user.id, event.params.id, s === 'erledigt' ? 'erledigt' : s === 'entfernt' ? 'entfernt' : 'offen');
			return { ok: s === 'erledigt' ? 'Als erledigt markiert. Danke!' : s === 'entfernt' ? 'Gelöscht.' : 'Wieder geöffnet (30 Tage).' };
		});
	},
	melden: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`melden:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Meldungen.' });
		const f = await event.request.formData();
		return run(async () => {
			await report(db(), user.id, 'help', event.params.id, String(f.get('reason') ?? ''), cleanText(f.get('message'), 500));
			return { reported: true };
		});
	}
};
