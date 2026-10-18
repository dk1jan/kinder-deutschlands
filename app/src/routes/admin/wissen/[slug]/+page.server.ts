import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { parseSources, saveKnowledge, slugify } from '$lib/server/community/knowledge';
import { PostError } from '$lib/server/community/posts';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'knowledge.edit');
	const sql = db();
	const topics = await sql`select key, name from topics order by sort`;
	if (event.params.slug === 'neu') return { k: null, topics };
	const [k] = await sql`select k.*, r.name as region_name from knowledge k left join regions r on r.code = k.region_code where k.slug = ${event.params.slug}`;
	if (!k) error(404, 'Eintrag nicht gefunden.');
	return { k, topics };
};

export const actions: Actions = {
	default: async (event) => {
		const user = await requireAction(event, 'knowledge.edit');
		const f = await event.request.formData();
		const sql = db();
		const [cur] = event.params.slug === 'neu' ? [] : await sql`select id from knowledge where slug = ${event.params.slug}`;
		const title = String(f.get('title') ?? '');
		const slug = String(f.get('slug') ?? '').trim() || slugify(title);
		try {
			await saveKnowledge(sql, user.id, cur?.id ?? null, {
				slug,
				title,
				summary: String(f.get('summary') ?? ''),
				body: String(f.get('body') ?? ''),
				sources: parseSources(String(f.get('sources') ?? '')),
				topicKey: String(f.get('topic') ?? '') || null,
				regionCode: String(f.get('region_code') ?? '') || null,
				visibility: String(f.get('visibility') ?? 'mitglieder'),
				publish: f.get('publish') === '1'
			});
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			if ((e as { code?: string }).code === '23505') return fail(400, { error: 'Kurzname ist schon vergeben.' });
			throw e;
		}
		redirect(303, `/admin/wissen/${slug}?gespeichert=1`);
	}
};
