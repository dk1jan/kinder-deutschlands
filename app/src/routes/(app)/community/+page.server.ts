import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { feed, isTeam, PostError, setSubscription, subscriptions, userLand } from '$lib/server/community/posts';
import { listKnowledge } from '$lib/server/community/knowledge';

const MODES = ['abos', 'neu', 'geloest', 'lesezeichen'] as const;

export const load: PageServerLoad = async ({ locals, url }) => {
	const sql = db();
	const topics = await sql`select key, name, description from topics order by sort`;
	if (!locals.user || !locals.session?.mfaVerified) {
		// Ohne Anmeldung: keine Beiträge (nicht im offenen Internet), nur öffentliche Wissenseinträge
		return { member: false as const, topics, knowledge: (await listKnowledge(sql, { member: false, editor: false })).slice(0, 6) };
	}
	const uid = locals.user.id;
	const m = url.searchParams.get('ansicht');
	const topic = url.searchParams.get('thema');
	const region = url.searchParams.get('region');
	const q = url.searchParams.get('q');
	const tag = url.searchParams.get('schlagwort');
	let mode = (MODES as readonly string[]).includes(m ?? '') ? (m as (typeof MODES)[number]) : topic || region || q || tag ? 'neu' : 'abos';
	// F-023: „Ganz Deutschland“ oder das eigene Bundesland (Standard, wenn eins eingetragen ist)
	const [land, team] = await Promise.all([userLand(sql, uid), isTeam(sql, uid)]);
	const b = url.searchParams.get('bereich');
	// Dritter Bereich nur fürs Team: Forum für Moderation und Verwaltung (Jan 24.10.)
	const scope: 'de' | 'land' | 'team' = b === 'team' && team ? 'team' : b === 'de' || !land ? 'de' : 'land';
	// Im Team-Forum gibt es keine Abos – „Für dich“ zeigt dort einfach alles Neue
	if (scope === 'team' && mode === 'abos') mode = 'neu';
	const [f, subs, groups, regionRow, topicRow] = await Promise.all([
		feed(sql, uid, { mode, topic, region, q, tag, scope: region ? null : scope, before: url.searchParams.get('vor') }),
		subscriptions(sql, uid),
		sql`select g.slug, g.name, g.kind from group_members m join community_groups g on g.id = m.group_id where m.user_id = ${uid} and m.status = 'aktiv' order by g.name`,
		region ? sql`select code, name, level from regions where code = ${region}` : Promise.resolve([]),
		topic ? sql`select key, name, description from topics where key = ${topic}` : Promise.resolve([])
	]);
	return {
		member: true as const,
		topics,
		mode,
		land,
		team,
		scope,
		filter: { topic: topicRow[0] ?? null, region: regionRow[0] ?? null, q, tag },
		feed: f,
		subs,
		groups
	};
};

export const actions: Actions = {
	abo: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const kind = f.get('kind') === 'region' ? 'region' : 'topic';
		try {
			await setSubscription(db(), user.id, kind, String(f.get('key') ?? ''), f.get('on') === '1');
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: true };
	}
};
