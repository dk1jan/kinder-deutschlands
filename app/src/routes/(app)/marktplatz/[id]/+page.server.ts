import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { userCan } from '$lib/server/roles';
import { PostError } from '$lib/server/community/posts';
import { MediaError } from '$lib/server/community/media';
import { report } from '$lib/server/community/moderation';
import { isUuid } from '$lib/server/angebote/common';
import { isSaved, toggleSaved } from '$lib/server/angebote/saved';
import { addImages, deleteListing, getListing, inquire, removeImage, renewListing, setStatus } from '$lib/server/alltag/market';
import { imagesFromForm } from '$lib/server/alltag/forms';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404, 'Diese Anzeige gibt es nicht.');
	const sql = db();
	const moderator = await userCan(sql, user.id, 'content.moderate');
	const l = await getListing(sql, user.id, event.params.id, { moderator });
	if (!l || (l.status === 'entfernt' && !moderator)) error(404, 'Diese Anzeige gibt es nicht (mehr).');
	return { l, saved: !!(await isSaved(sql, user.id, 'listing', l.id, null)), held: event.url.searchParams.has('pruefung') };
};

async function run<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof PostError || e instanceof MediaError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	anfragen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`markt-anfrage:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Anfragen. Bitte morgen weitermachen.' });
		const f = await event.request.formData();
		return run(async () => ({ inquired: (await inquire(db(), user.id, event.params.id, String(f.get('message') ?? ''))).direct ? 'direkt' : 'angefragt' }));
	},
	merken: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		return run(async () => ({ saved: await toggleSaved(db(), user.id, 'listing', event.params.id, null) }));
	},
	status: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return run(async () => {
			await setStatus(db(), user.id, event.params.id, String(f.get('status')) as 'verfuegbar');
			return { ok: 'Status geändert.' };
		});
	},
	verlaengern: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		return run(async () => {
			await renewListing(db(), user.id, event.params.id);
			return { ok: 'Um 30 Tage verlängert.' };
		});
	},
	bilder: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return run(async () => {
			await addImages(db(), user.id, event.params.id, await imagesFromForm(f));
			return { ok: 'Fotos hinzugefügt.' };
		});
	},
	bildWeg: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const mid = String(f.get('media') ?? '');
		if (!isUuid(mid)) return fail(400, { error: 'Ungültig.' });
		return run(async () => {
			await removeImage(db(), user.id, event.params.id, mid);
			return { ok: 'Foto entfernt.' };
		});
	},
	loeschen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const r = await run(async () => {
			await deleteListing(db(), user.id, event.params.id);
			return null;
		});
		if (r) return r;
		redirect(303, '/marktplatz?ansicht=meine');
	},
	melden: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`melden:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Meldungen.' });
		const f = await event.request.formData();
		return run(async () => {
			await report(db(), user.id, 'listing', event.params.id, String(f.get('reason') ?? ''), cleanText(f.get('message'), 500));
			return { reported: true };
		});
	}
};
