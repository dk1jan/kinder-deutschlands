import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { FREQUENCIES, INCLUDE, deleteProfile, getProfile, saveProfile, select, setPaused } from '$lib/server/angebote/radar';
import { formValues, profileFromForm } from '$lib/server/angebote/forms';
import { profileValues, regionNames } from '$lib/server/angebote/radarpage';
import { isUuid } from '$lib/server/angebote/common';
import { mailConfigured } from '$lib/server/mailer';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	const sql = db();
	const p = await getProfile(sql, user.id, event.params.id);
	if (!p) error(404, 'Dieses Radar-Profil gibt es nicht.');
	const items = await select(sql, user.id, p, { days: 30 });
	return {
		profile: { id: p.id, name: p.name, paused: p.paused, lastSentAt: p.lastSentAt },
		values: profileValues(p),
		regions: await regionNames(sql, p.regions),
		items: items.map((i) => ({ ...i, when: i.when?.toISOString() ?? null, deadline: i.deadline?.toISOString() ?? null, url: i.url.replace(/^https?:\/\/[^/]+/, '') })),
		include: INCLUDE,
		frequencies: FREQUENCIES,
		mail: mailConfigured()
	};
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		try {
			await saveProfile(db(), user.id, event.params.id, profileFromForm(f));
			return { ok: 'Gespeichert.' };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f), regions: await regionNames(db(), f.getAll('regions').map(String).filter(Boolean)) });
			throw e;
		}
	},
	pause: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		await setPaused(db(), user.id, event.params.id, f.get('paused') === '1');
		return { ok: f.get('paused') === '1' ? 'Pausiert.' : 'Wieder aktiv.' };
	},
	loeschen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		await deleteProfile(db(), user.id, event.params.id);
		redirect(303, '/radar');
	}
};
