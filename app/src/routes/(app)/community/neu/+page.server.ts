import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { cleanTags, createPost, PostError, userLand, type PostKind } from '$lib/server/community/posts';
import { MediaError } from '$lib/server/community/media';
import { rateLimit } from '$lib/server/ratelimit';
import { audit } from '$lib/server/audit';
import { isUuid } from '$lib/server/contacts';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const q = event.url.searchParams;
	const [topics, groups] = await Promise.all([
		sql`select key, name from topics order by sort`,
		sql`select g.id, g.slug, g.name, g.kind, m.pseudonym from group_members m join community_groups g on g.id = m.group_id where m.user_id = ${user.id} and m.status = 'aktiv' order by g.name`
	]);
	const regionCode = q.get('region');
	const [region] = regionCode ? await sql`select code, name from regions where code = ${regionCode}` : [];
	const [profileRegion] = await sql`select r.code, r.name from user_profiles p join regions r on r.code = p.region_code where p.user_id = ${user.id}`;
	const ort = q.get('ort');
	const [place] = ort && isUuid(ort) ? await sql`select id, name, kind from places where id = ${ort} and status = 'aktiv'` : [];
	// Teilen-Menü des Handys (PWA share_target): url/text/title
	const shared = [q.get('url'), q.get('text')].filter(Boolean).join(' ');
	const sharedUrl = /https?:\/\/\S+/.exec(shared)?.[0] ?? null;
	const land = await userLand(sql, user.id);
	const { getAffiliate } = await import('$lib/server/affiliate');
	const aff = await getAffiliate(sql);
	return {
		affiliate: aff.enabled && !!aff.amazon_tag,
		land,
		topics,
		groups,
		prefill: {
			topic: q.get('thema') ?? '',
			group: groups.find((g) => g.slug === q.get('gruppe'))?.id ?? '',
			region: region ?? profileRegion ?? null,
			place: place ?? null,
			kind: sharedUrl ? 'link' : (q.get('art') ?? 'frage'),
			title: (q.get('title') ?? '').slice(0, 160),
			link: sharedUrl,
			body: sharedUrl ? (q.get('text') ?? '').replace(sharedUrl, '').trim() : ''
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		if (!rateLimit(`beitrag:${user.id}`, 20, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Beiträge – bitte morgen weiter.' });
		const f = await event.request.formData();
		const files = f.getAll('images').filter((x): x is File => x instanceof File && x.size > 0);
		const total = files.reduce((a, x) => a + x.size, 0);
		const values = {
			kind: String(f.get('kind') ?? 'frage'),
			title: String(f.get('title') ?? ''),
			body: String(f.get('body') ?? ''),
			topic: String(f.get('topic') ?? ''),
			group: String(f.get('group') ?? ''),
			region: String(f.get('region_code') ?? ''),
			link: String(f.get('link') ?? ''),
			tags: String(f.get('tags') ?? ''),
			poll: f.getAll('poll').map(String),
			sichtbar: f.get('sichtbar') === 'de' ? 'de' : 'land'
		};
		if (total > 24 * 1024 * 1024) return fail(400, { error: 'Bilder zusammen höchstens 24 MB.', values });
		const sql = db();
		try {
			const r = await createPost(sql, user.id, {
				kind: values.kind as PostKind,
				title: values.title,
				body: values.body,
				topicKey: values.topic || null,
				regionCode: values.region || null,
				groupId: isUuid(values.group) ? values.group : null,
				placeId: isUuid(String(f.get('place') ?? '')) ? String(f.get('place')) : null,
				landOnly: values.sichtbar === 'land' && f.has('sichtbar'),
				labels: f.getAll('labels').map(String),
				tags: cleanTags(values.tags),
				linkUrl: values.link.trim() || null,
				poll: values.kind === 'umfrage' ? { options: values.poll, multiple: f.get('multiple') === 'on', days: Number(f.get('days')) || null } : null,
				images: await Promise.all(files.slice(0, 4).map(async (x, i) => ({ data: Buffer.from(await x.arrayBuffer()), alt: String(f.getAll('alt')[i] ?? '').slice(0, 200) || null })))
			});
			await audit(sql, { actorId: user.id, action: 'post.created', targetType: 'post', targetId: r.id });
			redirect(303, `/community/b/${r.id}${r.held ? '?pruefung=1' : ''}`);
		} catch (e) {
			if (e instanceof PostError || e instanceof MediaError) return fail(400, { error: e.message, values });
			throw e;
		}
	}
};
