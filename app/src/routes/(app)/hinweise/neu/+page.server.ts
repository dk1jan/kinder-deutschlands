import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { archiveNotice, myProposals, proposeNotice } from '$lib/server/angebote/notices';
import { isUuid } from '$lib/server/angebote/common';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [u] = await sql`select r.code, r.name from user_profiles p join regions r on r.code = p.region_code where p.user_id = ${user.id}`;
	return { mine: await myProposals(sql, user.id), region: u ? { code: u.code as string, name: u.name as string } : null };
};

export const actions: Actions = {
	vorschlagen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const values = { kind: String(f.get('kind') ?? ''), title: String(f.get('title') ?? ''), body: String(f.get('body') ?? ''), source_url: String(f.get('source_url') ?? ''), days: String(f.get('days') ?? '14') };
		try {
			await proposeNotice(db(), user.id, {
				kind: values.kind,
				title: values.title.slice(0, 200),
				body: values.body.slice(0, 1200),
				regionCode: String(f.get('region_code') ?? '') || null,
				sourceUrl: values.source_url.trim() || null,
				days: Number(values.days)
			});
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values });
			throw e;
		}
		return { ok: true };
	},
	beenden: async (event) => {
		const user = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		try {
			await archiveNotice(db(), user.id, id);
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
		return { ended: true };
	}
};
