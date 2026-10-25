// Community-Beiträge (M03/M04/M07). Grundregel: nur angemeldete Mitglieder lesen; Gruppenbeiträge nur aktive Gruppenmitglieder
// (bzw. zuständige Moderation). Jede Prüfung passiert hier auf dem Server.
import type { Sql } from '../db';
import { userCan, regionPath } from '../roles';
import { checkText, holdMessage, type Flag } from './automod';
import { buildCard, LinkError, safeGet, type LinkCard } from './linkcard';
import { storeImage } from './media';
import { excerpt, firstUrl } from '$lib/markup';
import { audit } from '../audit';

export const POST_KINDS = {
	frage: 'Frage',
	beitrag: 'Beitrag',
	erfahrung: 'Erfahrung',
	link: 'Link-Tipp',
	umfrage: 'Umfrage'
} as const;
export type PostKind = keyof typeof POST_KINDS;
export const LABELS = { werbung: 'Eigenwerbung/Anzeige', triggerwarnung: 'Belastendes Thema', erfahrungsbericht: 'Persönliche Erfahrung' } as const;

export class PostError extends Error {}

// ---------- Anzeige von Autorinnen und Autoren ----------

export interface AuthorView {
	name: string;
	pseudonym: boolean;
	contactId: string | null;
	region: string | null;
}

/** Name wie im Profil freigegeben; in geschützten Gruppen nur das Gruppenpseudonym (nie verknüpfbar). */
export async function authorViews(sql: Sql, viewerId: string, authorIds: string[], groupId: string | null, protectedGroup: boolean): Promise<Map<string, AuthorView>> {
	const ids = [...new Set(authorIds.filter(Boolean))];
	const out = new Map<string, AuthorView>();
	if (!ids.length) return out;
	if (protectedGroup && groupId) {
		const rows = await sql`select user_id, pseudonym from group_members where group_id = ${groupId} and user_id = any(${ids}::uuid[])`;
		const m = new Map(rows.map((r) => [r.user_id as string, r.pseudonym as string | null]));
		for (const id of ids) out.set(id, { name: m.get(id) ?? 'Gruppenmitglied', pseudonym: true, contactId: null, region: null });
		return out;
	}
	const rows = await sql`select p.user_id, p.display_name, p.contact_id, p.visibility, r.name as region_name, u.status,
			exists(select 1 from contacts c where (c.user_a = least(p.user_id, ${viewerId}::uuid) and c.user_b = greatest(p.user_id, ${viewerId}::uuid))) as contact
		from user_profiles p join users u on u.id = p.user_id left join regions r on r.code = p.region_code where p.user_id = any(${ids}::uuid[])`;
	for (const r of rows) {
		const vis = (r.visibility ?? {}) as Record<string, string>;
		const ok = (lvl: string | undefined) => r.user_id === viewerId || lvl === 'alle' || lvl === 'mitglieder' || (lvl === 'kontakte' && r.contact);
		out.set(r.user_id, {
			name: r.status === 'deleted' ? 'Ehemaliges Mitglied' : ok(vis.display_name) && r.display_name ? r.display_name : 'Ein Mitglied',
			pseudonym: false,
			contactId: r.status === 'active' ? r.contact_id : null,
			region: ok(vis.region) ? r.region_name : null
		});
	}
	for (const id of ids) if (!out.has(id)) out.set(id, { name: 'Ein Mitglied', pseudonym: false, contactId: null, region: null });
	return out;
}

// ---------- Rechte ----------

export interface GroupAccess {
	id: string;
	slug: string;
	name: string;
	kind: 'offen' | 'beitritt' | 'geschuetzt';
	member: boolean;
	status: string | null;
	pseudonym: string | null;
	moderator: boolean;
}

export async function groupAccess(sql: Sql, userId: string, groupId: string): Promise<GroupAccess | null> {
	const [g] = await sql`select g.id, g.slug, g.name, g.kind, m.status, m.pseudonym from community_groups g
		left join group_members m on m.group_id = g.id and m.user_id = ${userId} where g.id = ${groupId}`;
	if (!g) return null;
	const action = g.kind === 'geschuetzt' ? 'protected_group.moderate' : 'content.moderate';
	const moderator = await userCan(sql, userId, action, { group: g.id });
	return { id: g.id, slug: g.slug, name: g.name, kind: g.kind, member: g.status === 'aktiv', status: g.status ?? null, pseudonym: g.pseudonym ?? null, moderator };
}

/** Darf diese Person Inhalte dieser Zuständigkeit moderieren? Geschützte Gruppen nur mit ausdrücklicher Gruppenzuweisung. */
export async function canModerate(sql: Sql, userId: string, scope: { regionCode: string | null; topicKey: string | null; groupId: string | null }): Promise<boolean> {
	if (scope.groupId) {
		const [g] = await sql`select kind from community_groups where id = ${scope.groupId}`;
		if (g?.kind === 'geschuetzt') return userCan(sql, userId, 'protected_group.moderate', { group: scope.groupId });
		if (await userCan(sql, userId, 'content.moderate', { group: scope.groupId })) return true;
	}
	const target = {
		regionPath: scope.regionCode ? await regionPath(sql, scope.regionCode) : undefined,
		topic: scope.topicKey ?? undefined,
		group: scope.groupId ?? undefined
	};
	return userCan(sql, userId, 'content.moderate', target);
}

export async function mutedUntil(sql: Sql, userId: string): Promise<boolean> {
	const [r] = await sql`select 1 as x from user_restrictions where user_id = ${userId} and kind = 'stumm' and lifted_at is null and (until is null or until > now())`;
	return !!r;
}

// ---------- Moderationsfälle aus automatischer Prüfung ----------

async function autoCases(sql: Sql, type: 'post' | 'comment' | 'review', id: string, flags: Flag[], scope: { regionCode: string | null; topicKey: string | null; groupId: string | null }) {
	const seen = new Set<string>();
	for (const f of flags) {
		if (seen.has(f.reason)) continue;
		seen.add(f.reason);
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, priority, region_code, topic_key, group_id)
			values (${type}, ${id}, 'automatisch', ${f.reason}, ${f.detail}, ${f.priority}, ${scope.regionCode}, ${scope.topicKey}, ${scope.groupId})`;
	}
}

export async function notify(sql: Sql, userId: string | null, kind: string, text: string, link: string | null, opts: { pushKind?: 'community' | 'erinnerung' | 'radar' | 'markt' | 'wetter'; pushBody?: string; noPush?: boolean } = {}) {
	if (!userId) return;
	await sql`insert into notifications (user_id, kind, text, link) values (${userId}, ${kind}, ${text.slice(0, 300)}, ${link})`;
	// Push (falls gewünscht) ohne Inhalt, Fehler beim Senden stören den eigentlichen Vorgang nicht
	// (eigene Verbindung, da notify auch innerhalb von Transaktionen aufgerufen wird)
	if (opts.noPush) return;
	Promise.all([import('../push'), import('../db')])
		.then(([p, d]) => p.pushNotice(d.db(), userId, link, { kind: opts.pushKind ?? 'community', body: opts.pushBody }))
		.catch(() => {});
}

// ---------- Bundesland (F-023) ----------

/** Bundesland der Wohnregion im Profil (Code wie '04'), oder null. */
export async function userLand(sql: Sql, userId: string): Promise<{ code: string; name: string } | null> {
	const [r] = await sql`select l.code, l.name from user_profiles p join regions l on l.code = kd_land_of(p.region_code) where p.user_id = ${userId}`;
	return r ? { code: r.code as string, name: landName(r.name as string) } : null;
}
/** „Bremen (Land)“ → „Bremen“ für die Anzeige */
export const landName = (n: string) => n.replace(/\s*\(Land\)$/, '');

// ---------- Forum für Moderation und Verwaltung (Jan 24.10.) ----------

/** Gehört die Person zum Team (Moderation, Redaktion, Technik, Betreiber – egal für welche Region/welches Thema)? */
export async function isTeam(sql: Sql, userId: string): Promise<boolean> {
	const [r] = await sql`select kd_is_team(${userId}::uuid) as t`;
	return !!r?.t;
}

/** Darf diese Person den Beitrag lesen? Team-Forum nur fürs Team; Landes-Beiträge: Verfasserin, gleiches Land, eingeladen. */
async function landAccess(sql: Sql, viewerId: string, p: { id: string; land_code: string | null; author_id: string | null; team?: boolean }): Promise<boolean> {
	if (p.team) return isTeam(sql, viewerId);
	if (!p.land_code || p.author_id === viewerId) return true;
	const [r] = await sql`select (kd_land_of((select region_code from user_profiles where user_id = ${viewerId})) = ${p.land_code}) as same,
		exists(select 1 from post_invites where post_id = ${p.id} and user_id = ${viewerId}) as invited`;
	return !!(r?.same || r?.invited);
}

// ---------- Beitrag anlegen ----------

export interface NewPost {
	kind: PostKind;
	title: string;
	body: string;
	topicKey: string | null;
	regionCode: string | null;
	groupId: string | null;
	placeId: string | null;
	/** F-023: nur Mitglieder des eigenen Bundeslands (+ Eingeladene) lesen den Beitrag */
	landOnly?: boolean;
	/** Forum für Moderation und Verwaltung: nur das Team liest und schreibt */
	team?: boolean;
	labels: string[];
	tags: string[];
	linkUrl: string | null;
	poll: { options: string[]; multiple: boolean; days: number | null } | null;
	images: { data: Buffer; alt: string | null }[];
}

export function cleanTags(raw: string): string[] {
	return [...new Set(raw.split(/[,#\s]+/).map((t) => t.toLowerCase().replace(/[^a-z0-9äöüß-]/g, '').slice(0, 30)).filter((t) => t.length >= 2))].slice(0, 6);
}

async function linkPreview(sql: Sql, url: string, ownerId: string): Promise<(LinkCard & { imageId: string | null }) | null> {
	let card: LinkCard;
	try {
		card = await buildCard(url);
	} catch (e) {
		if (e instanceof LinkError) throw new PostError(`Link: ${e.message}`);
		return null;
	}
	let imageId: string | null = null;
	if (card.image) {
		try {
			const img = await safeGet(card.image, { maxBytes: 4_000_000, accept: 'image/*', timeoutMs: 6000 });
			if (/^image\//.test(img.type)) imageId = await storeImage(sql, img.body, { ownerId, purpose: 'linkvorschau', maxSide: 640 });
		} catch {
			imageId = null;
		}
	}
	return { ...card, image: null, imageId };
}

export async function createPost(sql: Sql, authorId: string, input: NewPost): Promise<{ id: string; held: string | null }> {
	let p = input;
	if (!(p.kind in POST_KINDS)) throw new PostError('Bitte eine Art wählen.');
	const title = p.title.trim().replace(/\s+/g, ' ');
	if (title.length < 3 || title.length > 160) throw new PostError('Der Titel braucht 3 bis 160 Zeichen.');
	if (p.body.length > 20000) throw new PostError('Der Text ist zu lang (höchstens 20 000 Zeichen).');
	if (await mutedUntil(sql, authorId)) throw new PostError('Du kannst gerade keine Beiträge schreiben (zeitweise eingeschränkt durch die Moderation).');
	if (p.topicKey) {
		const [t] = await sql`select 1 from topics where key = ${p.topicKey}`;
		if (!t) throw new PostError('Unbekanntes Thema.');
	}
	if (p.regionCode) {
		const [r] = await sql`select 1 from regions where code = ${p.regionCode}`;
		if (!r) throw new PostError('Unbekannte Region.');
	}
	if (p.groupId) {
		const g = await groupAccess(sql, authorId, p.groupId);
		if (!g || (!g.member && !g.moderator)) throw new PostError('Du bist nicht Mitglied dieser Gruppe.');
	}
	const team = !!p.team;
	if (team) {
		if (!(await isTeam(sql, authorId))) throw new PostError('Das Forum für Moderation und Verwaltung ist nur für das Team.');
		// Team-Beiträge hängen an keiner Gruppe, keinem Ort und keiner Region – sonst könnten sie dort auftauchen
		p = { ...p, groupId: null, placeId: null, regionCode: null, landOnly: false };
	}
	// Seit D-076 ist jeder Beitrag über „Ganz Deutschland“ bzw. das Bundesland auffindbar – Thema/Region sind freiwillig (F-030)
	let landCode: string | null = null;
	if (p.landOnly && !p.groupId) {
		const land = await userLand(sql, authorId);
		if (!land) throw new PostError('Für „Nur mein Bundesland“ bitte zuerst deine Wohnregion im Profil eintragen.');
		if (p.regionCode) {
			const [r] = await sql`select kd_land_of(${p.regionCode}) as l`;
			if (r?.l !== land.code) throw new PostError(`Die gewählte Region liegt nicht in ${land.name}. Wähle „Ganz Deutschland“ oder eine Region in ${land.name}.`);
		}
		landCode = land.code;
	}
	if (p.kind === 'umfrage') {
		const opts = (p.poll?.options ?? []).map((o) => o.trim()).filter(Boolean);
		if (opts.length < 2 || opts.length > 10) throw new PostError('Eine Umfrage braucht 2 bis 10 Antwortmöglichkeiten.');
		if (opts.some((o) => o.length > 120)) throw new PostError('Antwortmöglichkeiten höchstens 120 Zeichen.');
	}
	if (p.images.length > 4) throw new PostError('Höchstens 4 Bilder je Beitrag.');
	const url = p.linkUrl?.trim() || (p.kind === 'link' ? null : firstUrl(p.body));
	if (p.kind === 'link' && !p.linkUrl?.trim()) throw new PostError('Für einen Link-Tipp bitte den Link eintragen.');
	const flags = checkText(`${title}\n${p.body}${p.poll ? '\n' + p.poll.options.join('\n') : ''}`, { links: url ? [url, ...[...p.body.matchAll(/https?:\/\/\S+/g)].map((m) => m[0])] : undefined });
	// Drohungen und private Daten in geschützten Gruppen genauso zurückhalten
	const held = holdMessage(flags);
	const card = url ? await linkPreview(sql, url, authorId) : null;
	const labels = p.labels.filter((l) => l in LABELS);
	const [row] = await sql`insert into posts (kind, title, body, topic_key, region_code, group_id, place_id, author_id, labels, tags, link_url, link_card, status, land_code, team)
		values (${p.kind}, ${title}, ${p.body.trim()}, ${p.topicKey}, ${p.regionCode}, ${p.groupId}, ${p.placeId}, ${authorId}, ${labels}, ${p.tags},
			${card?.url ?? null}, ${card ? sql.json(card as never) : null}, ${held ? 'pruefung' : 'sichtbar'}, ${landCode}, ${team})
		returning id`;
	const id = row.id as string;
	if (team && !held) {
		// Das übrige Team erfährt es in der Glocke (Push nur, wer Community-Mitteilungen als Push will)
		const others = await sql`select distinct a.user_id from role_assignments a join role_permissions rp on rp.role_key = a.role_key join users u on u.id = a.user_id
			where rp.action in ('*', 'team.forum') and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()) and u.status = 'active' and a.user_id <> ${authorId}`;
		for (const o of others) await notify(sql, o.user_id as string, 'team', `Neuer Beitrag im Moderatoren-Forum: „${title}“`, `/community/b/${id}`);
	}
	if (p.kind === 'umfrage' && p.poll) {
		await sql`insert into polls (post_id, options, multiple, closes_at) values (${id}, ${p.poll.options.map((o) => o.trim()).filter(Boolean)}, ${p.poll.multiple},
			${p.poll.days ? sql`now() + make_interval(days => ${p.poll.days})` : null})`;
	}
	for (const img of p.images) await storeImage(sql, img.data, { ownerId: authorId, purpose: 'beitrag', postId: id, alt: img.alt });
	await autoCases(sql, 'post', id, flags, { regionCode: p.regionCode, topicKey: p.topicKey, groupId: p.groupId });
	return { id, held };
}

// ---------- Lesen ----------

/** SQL-Bedingung: für diese Person sichtbare Beiträge (Gruppen nur als aktives Mitglied). */
function visible(sql: Sql, viewerId: string) {
	return sql`p.status = 'sichtbar' and (p.group_id is null or p.group_id in (select group_id from group_members where user_id = ${viewerId} and status = 'aktiv'))
		and (not p.team or kd_is_team(${viewerId}::uuid))
		and (p.land_code is null or p.author_id = ${viewerId} or p.land_code = kd_land_of((select region_code from user_profiles where user_id = ${viewerId}))
			or exists(select 1 from post_invites i where i.post_id = p.id and i.user_id = ${viewerId}))`;
}

function subtree(sql: Sql, code: string) {
	return sql`(with recursive sub as (select code from regions where code = ${code} union all select r.code from regions r join sub on r.parent_code = sub.code) select code from sub)`;
}

export interface FeedQuery {
	mode: 'abos' | 'neu' | 'geloest' | 'lesezeichen';
	/** F-023: 'de' = ganz Deutschland (+ Einladungen), 'land' = Beiträge aus dem eigenen Bundesland, 'team' = Moderatoren-Forum */
	scope?: 'de' | 'land' | 'team' | null;
	topic?: string | null;
	region?: string | null;
	groupId?: string | null;
	q?: string | null;
	tag?: string | null;
	before?: string | null;
	limit?: number;
}

export async function feed(sql: Sql, viewerId: string, f: FeedQuery) {
	const limit = Math.min(f.limit ?? 20, 50);
	const before = f.before && !Number.isNaN(Date.parse(f.before)) ? new Date(f.before) : null;
	let subsNone = false;
	if (f.mode === 'abos' && !f.topic && !f.region && !f.groupId && !f.q) {
		const [{ n }] = await sql`select count(*)::int as n from subscriptions where user_id = ${viewerId}`;
		subsNone = n === 0;
	}
	const q = f.q?.trim().slice(0, 120) || null;
	const rows = await sql`
		select p.id, p.kind, p.title, p.body, p.topic_key, t.name as topic_name, p.region_code, r.name as region_name, p.group_id, g.name as group_name, g.kind as group_kind, g.slug as group_slug,
			p.land_code, (select name from regions where code = p.land_code) as land_name, p.team,
			exists(select 1 from post_invites i where i.post_id = p.id and i.user_id = ${viewerId}) as invited,
			p.author_id, p.labels, p.tags, p.link_card, p.pinned, p.closed, p.archived, p.solved_comment is not null as solved, p.comment_count, p.created_at, p.activity_at,
			(select count(*)::int from media m where m.post_id = p.id and m.status = 'sichtbar' and m.purpose = 'beitrag') as images,
			exists(select 1 from bookmarks b where b.post_id = p.id and b.user_id = ${viewerId}) as bookmarked
		from posts p left join topics t on t.key = p.topic_key left join regions r on r.code = p.region_code left join community_groups g on g.id = p.group_id
		where ${visible(sql, viewerId)}
			${f.mode === 'lesezeichen' ? sql`` : f.scope === 'team' ? sql`and p.team` : sql`and not p.team`}
			${f.scope === 'de' && !f.groupId && !f.region ? sql`and (p.land_code is null or exists(select 1 from post_invites i where i.post_id = p.id and i.user_id = ${viewerId}))` : sql``}
			${f.scope === 'land' && !f.groupId && !f.region
				? sql`and p.group_id is null and (p.land_code = kd_land_of((select region_code from user_profiles where user_id = ${viewerId}))
					or (p.land_code is null and p.region_code is not null and kd_land_of(p.region_code) = kd_land_of((select region_code from user_profiles where user_id = ${viewerId})))
					-- Angeheftete Beiträge für ganz Deutschland (z. B. Aufrufe der Redaktion) stehen auch im Landes-Feed oben (F-030)
					or (p.pinned and p.land_code is null and p.region_code is null))`
				: sql``}
			${f.mode !== 'lesezeichen' && !f.groupId ? sql`and not p.archived` : sql``}
			${f.topic ? sql`and p.topic_key = ${f.topic}` : sql``}
			${f.region ? sql`and p.region_code in ${subtree(sql, f.region)}` : sql``}
			${f.groupId ? sql`and p.group_id = ${f.groupId}` : f.topic || f.region ? sql`and p.group_id is null` : sql``}
			${f.tag ? sql`and ${f.tag} = any(p.tags)` : sql``}
			${q ? sql`and (p.search @@ websearch_to_tsquery('german', ${q}) or p.title ilike ${'%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%'} or ${q.toLowerCase()} = any(p.tags))` : sql``}
			${f.mode === 'geloest' ? sql`and (p.solved_comment is not null or p.kind in ('erfahrung', 'link'))` : sql``}
			${f.mode === 'lesezeichen' ? sql`and exists(select 1 from bookmarks b where b.post_id = p.id and b.user_id = ${viewerId})` : sql``}
			${f.mode === 'abos' && !subsNone && !f.topic && !f.region && !f.groupId && !q
				? sql`and (p.topic_key in (select key from subscriptions where user_id = ${viewerId} and kind = 'topic')
					or p.region_code in (with recursive sub as (select key as code from subscriptions where user_id = ${viewerId} and kind = 'region'
						union all select r2.code from regions r2 join sub on r2.parent_code = sub.code) select code from sub)
					or p.group_id is not null)`
				: sql``}
			${before ? sql`and p.activity_at < ${before} and not p.pinned` : sql``}
		order by ${!q ? sql`p.pinned desc,` : sql``} ${q ? sql`ts_rank(p.search, websearch_to_tsquery('german', ${q})) desc,` : sql``} p.activity_at desc
		limit ${limit + 1}`;
	const more = rows.length > limit;
	const list = rows.slice(0, limit);
	const authorsByGroup = new Map<string, string[]>();
	for (const r of list) {
		const k = r.group_kind === 'geschuetzt' ? r.group_id : '';
		if (!authorsByGroup.has(k)) authorsByGroup.set(k, []);
		authorsByGroup.get(k)!.push(r.author_id);
	}
	const names = new Map<string, Map<string, AuthorView>>();
	for (const [k, ids] of authorsByGroup) names.set(k, await authorViews(sql, viewerId, ids, k || null, !!k));
	return {
		subsNone,
		more,
		next: more ? (list[list.length - 1].activity_at as Date).toISOString() : null,
		items: list.map((r) => ({
			id: r.id as string,
			kind: r.kind as PostKind,
			title: r.title as string,
			excerpt: excerpt(r.body as string),
			topic: r.topic_key ? { key: r.topic_key as string, name: r.topic_name as string } : null,
			region: r.region_code ? { code: r.region_code as string, name: r.region_name as string } : null,
			group: r.group_id ? { slug: r.group_slug as string, name: r.group_name as string, kind: r.group_kind as string } : null,
			land: r.land_code ? { code: r.land_code as string, name: landName(r.land_name as string), invited: r.invited as boolean } : null,
			team: !!r.team,
			author: names.get(r.group_kind === 'geschuetzt' ? r.group_id : '')?.get(r.author_id) ?? { name: 'Ein Mitglied', pseudonym: false, contactId: null, region: null },
			labels: r.labels as string[],
			tags: r.tags as string[],
			card: r.link_card as (LinkCard & { imageId: string | null }) | null,
			pinned: r.pinned as boolean,
			closed: r.closed as boolean,
			solved: r.solved as boolean,
			comments: r.comment_count as number,
			images: r.images as number,
			bookmarked: r.bookmarked as boolean,
			createdAt: r.created_at as Date,
			activityAt: r.activity_at as Date
		}))
	};
}

/** Beitrag mit Antworten. Für Moderation auch ausgeblendete Inhalte (gekennzeichnet). */
export async function getPost(sql: Sql, viewerId: string, id: string) {
	const [p] = await sql`select p.*, t.name as topic_name, r.name as region_name, g.name as group_name, g.slug as group_slug, g.kind as group_kind
		from posts p left join topics t on t.key = p.topic_key left join regions r on r.code = p.region_code left join community_groups g on g.id = p.group_id
		where p.id = ${id}`;
	if (!p) return null;
	const scope = { regionCode: p.region_code, topicKey: p.topic_key, groupId: p.group_id };
	const moderator = await canModerate(sql, viewerId, scope);
	let member = true;
	if (p.group_id) {
		const g = await groupAccess(sql, viewerId, p.group_id);
		member = !!g?.member;
		if (!member && !moderator) return null;
	}
	const own = p.author_id === viewerId;
	if (p.status !== 'sichtbar' && !own && !moderator) return null;
	if (p.team && !(await isTeam(sql, viewerId))) return null;
	if (!moderator && !(await landAccess(sql, viewerId, p as never))) return null;
	const comments = await sql`select c.id, c.author_id, c.body, c.status, c.mod_note, c.helpful, c.created_at, c.edited_at,
			exists(select 1 from helpful_marks h where h.comment_id = c.id and h.user_id = ${viewerId}) as marked
		from comments c where c.post_id = ${id} ${moderator ? sql`` : sql`and (c.status = 'sichtbar' or c.author_id = ${viewerId})`}
		order by c.created_at limit 500`;
	const protectedGroup = p.group_kind === 'geschuetzt';
	const names = await authorViews(sql, viewerId, [p.author_id, ...comments.map((c) => c.author_id)], p.group_id, protectedGroup);
	const [poll] = await sql`select options, multiple, closes_at, (closes_at is not null and closes_at < now()) as closed from polls where post_id = ${id}`;
	let pollView = null;
	if (poll) {
		const votes = await sql`select choices from poll_votes where post_id = ${id}`;
		const counts = (poll.options as string[]).map(() => 0);
		for (const v of votes) for (const c of v.choices as number[]) if (c >= 0 && c < counts.length) counts[c]++;
		const [mine] = await sql`select choices from poll_votes where post_id = ${id} and user_id = ${viewerId}`;
		pollView = { options: poll.options as string[], multiple: poll.multiple as boolean, closesAt: poll.closes_at as Date | null, closed: poll.closed as boolean, counts, voters: votes.length, mine: (mine?.choices as number[] | undefined) ?? null };
	}
	const media = await sql`select id, width, height, alt, status from media where post_id = ${id} and purpose = 'beitrag' ${moderator || own ? sql`` : sql`and status = 'sichtbar'`} order by created_at`;
	const [bm] = await sql`select 1 as x from bookmarks where user_id = ${viewerId} and post_id = ${id}`;
	const [openAppeal] = own ? await sql`select 1 as x from mod_cases where target_type = 'post' and target_id = ${id} and source = 'einspruch' and status in ('offen', 'in_arbeit')` : [];
	const [landRow] = p.land_code ? await sql`select name from regions where code = ${p.land_code}` : [];
	const invites = own && p.land_code ? await listInvites(sql, viewerId, id) : [];
	const [inv] = p.land_code ? await sql`select 1 as x from post_invites where post_id = ${id} and user_id = ${viewerId}` : [];
	return {
		id: p.id as string,
		kind: p.kind as PostKind,
		title: p.title as string,
		body: p.body as string,
		topic: p.topic_key ? { key: p.topic_key as string, name: p.topic_name as string } : null,
		region: p.region_code ? { code: p.region_code as string, name: p.region_name as string } : null,
		group: p.group_id ? { id: p.group_id as string, slug: p.group_slug as string, name: p.group_name as string, kind: p.group_kind as string } : null,
		land: p.land_code ? { code: p.land_code as string, name: landName((landRow?.name as string) ?? p.land_code), invited: !!inv } : null,
		team: !!p.team,
		invites,
		placeId: p.place_id as string | null,
		author: names.get(p.author_id) ?? { name: 'Ein Mitglied', pseudonym: false, contactId: null, region: null },
		own,
		labels: p.labels as string[],
		tags: p.tags as string[],
		card: p.link_card as (LinkCard & { imageId: string | null }) | null,
		status: p.status as string,
		modNote: p.mod_note as string | null,
		pinned: p.pinned as boolean,
		closed: p.closed as boolean,
		archived: p.archived as boolean,
		solvedComment: p.solved_comment as string | null,
		createdAt: p.created_at as Date,
		editedAt: p.edited_at as Date | null,
		bookmarked: !!bm,
		moderator,
		canAppeal: own && (p.status === 'ausgeblendet' || p.status === 'entfernt') && !openAppeal,
		poll: pollView,
		media: media.map((m) => ({ id: m.id as string, width: m.width as number, height: m.height as number, alt: m.alt as string | null, status: m.status as string })),
		comments: comments.map((c) => ({
			id: c.id as string,
			author: names.get(c.author_id) ?? { name: 'Ein Mitglied', pseudonym: false, contactId: null, region: null },
			own: c.author_id === viewerId,
			body: c.body as string,
			status: c.status as string,
			modNote: c.mod_note as string | null,
			helpful: c.helpful as number,
			marked: c.marked as boolean,
			createdAt: c.created_at as Date,
			editedAt: c.edited_at as Date | null
		}))
	};
}

async function readablePost(sql: Sql, viewerId: string, postId: string) {
	const [p] = await sql`select p.id, p.author_id, p.status, p.closed, p.archived, p.group_id, p.region_code, p.topic_key, p.title, p.solved_comment, p.land_code, p.team from posts p where p.id = ${postId}`;
	if (!p) throw new PostError('Beitrag nicht gefunden.');
	if (!(await landAccess(sql, viewerId, p as never))) throw new PostError('Beitrag nicht gefunden.');
	if (p.group_id) {
		const g = await groupAccess(sql, viewerId, p.group_id);
		if (!g?.member && !g?.moderator) throw new PostError('Beitrag nicht gefunden.');
	}
	if (p.status !== 'sichtbar' && p.author_id !== viewerId) throw new PostError('Beitrag nicht gefunden.');
	return p;
}

export async function addComment(sql: Sql, userId: string, postId: string, body: string): Promise<{ id: string; held: string | null }> {
	const text = body.trim();
	if (!text) throw new PostError('Bitte etwas schreiben.');
	if (text.length > 8000) throw new PostError('Antwort ist zu lang (höchstens 8 000 Zeichen).');
	if (await mutedUntil(sql, userId)) throw new PostError('Du kannst gerade nicht antworten (zeitweise eingeschränkt durch die Moderation).');
	const p = await readablePost(sql, userId, postId);
	if (p.closed || p.archived) throw new PostError('Dieser Beitrag ist geschlossen.');
	if (p.status !== 'sichtbar') throw new PostError('Antworten sind erst nach der Prüfung möglich.');
	const flags = checkText(text);
	const held = holdMessage(flags);
	const [c] = await sql`insert into comments (post_id, author_id, body, status) values (${postId}, ${userId}, ${text}, ${held ? 'pruefung' : 'sichtbar'}) returning id`;
	if (!held) {
		await sql`update posts set comment_count = comment_count + 1, activity_at = now() where id = ${postId}`;
		if (p.author_id !== userId) await notify(sql, p.author_id, 'antwort', `Neue Antwort auf „${p.title}“`, `/community/b/${postId}#a-${c.id}`);
	}
	await autoCases(sql, 'comment', c.id, flags, { regionCode: p.region_code, topicKey: p.topic_key, groupId: p.group_id });
	return { id: c.id as string, held };
}

export async function editPost(sql: Sql, userId: string, postId: string, title: string, body: string) {
	const [p] = await sql`select author_id, status, region_code, topic_key, group_id from posts where id = ${postId}`;
	if (!p || p.author_id !== userId) throw new PostError('Nur eigene Beiträge können bearbeitet werden.');
	if (p.status === 'entfernt') throw new PostError('Entfernte Beiträge können nicht bearbeitet werden.');
	const t = title.trim().replace(/\s+/g, ' ');
	if (t.length < 3 || t.length > 160) throw new PostError('Der Titel braucht 3 bis 160 Zeichen.');
	if (body.length > 20000) throw new PostError('Der Text ist zu lang.');
	const flags = checkText(`${t}\n${body}`);
	const held = holdMessage(flags);
	await sql`update posts set title = ${t}, body = ${body.trim()}, edited_at = now(), status = ${held && p.status === 'sichtbar' ? 'pruefung' : p.status} where id = ${postId}`;
	await autoCases(sql, 'post', postId, flags, { regionCode: p.region_code, topicKey: p.topic_key, groupId: p.group_id });
	return held;
}

export async function editComment(sql: Sql, userId: string, commentId: string, body: string) {
	const [c] = await sql`select c.author_id, c.status, p.region_code, p.topic_key, p.group_id from comments c join posts p on p.id = c.post_id where c.id = ${commentId}`;
	if (!c || c.author_id !== userId) throw new PostError('Nur eigene Antworten können bearbeitet werden.');
	if (c.status === 'entfernt') throw new PostError('Entfernte Antworten können nicht bearbeitet werden.');
	const text = body.trim();
	if (!text || text.length > 8000) throw new PostError('Antwort leer oder zu lang.');
	const flags = checkText(text);
	const held = holdMessage(flags);
	await sql`update comments set body = ${text}, edited_at = now(), status = ${held && c.status === 'sichtbar' ? 'pruefung' : c.status} where id = ${commentId}`;
	await autoCases(sql, 'comment', commentId, flags, { regionCode: c.region_code, topicKey: c.topic_key, groupId: c.group_id });
	return held;
}

/** Eigenen Beitrag löschen: Inhalt verschwindet (Datensparsamkeit), außer es läuft ein Moderationsfall (Beweissicherung). */
export async function deleteOwnPost(sql: Sql, userId: string, postId: string) {
	const [p] = await sql`select author_id from posts where id = ${postId}`;
	if (!p || p.author_id !== userId) throw new PostError('Nur eigene Beiträge können gelöscht werden.');
	const [open] = await sql`select 1 as x from mod_cases where target_type = 'post' and target_id = ${postId} and status in ('offen', 'in_arbeit', 'eskaliert')`;
	if (open) await sql`update posts set status = 'entfernt', mod_note = 'Von der Autorin/dem Autor gelöscht' where id = ${postId}`;
	else await sql`update posts set status = 'entfernt', title = '[gelöscht]', body = '', link_card = null, link_url = null, mod_note = 'Von der Autorin/dem Autor gelöscht' where id = ${postId}`;
}

export async function deleteOwnComment(sql: Sql, userId: string, commentId: string) {
	const [c] = await sql`select author_id, post_id, status from comments where id = ${commentId}`;
	if (!c || c.author_id !== userId) throw new PostError('Nur eigene Antworten können gelöscht werden.');
	const [open] = await sql`select 1 as x from mod_cases where target_type = 'comment' and target_id = ${commentId} and status in ('offen', 'in_arbeit', 'eskaliert')`;
	await sql`update comments set status = 'entfernt', mod_note = 'Gelöscht', body = ${open ? sql`body` : sql`''`} where id = ${commentId}`;
	if (c.status === 'sichtbar') await sql`update posts set comment_count = greatest(comment_count - 1, 0) where id = ${c.post_id}`;
}

export async function toggleHelpful(sql: Sql, userId: string, commentId: string) {
	const [c] = await sql`select c.post_id, c.author_id from comments c where c.id = ${commentId} and c.status = 'sichtbar'`;
	if (!c) throw new PostError('Antwort nicht gefunden.');
	await readablePost(sql, userId, c.post_id);
	if (c.author_id === userId) throw new PostError('Eigene Antworten kann man nicht als hilfreich markieren.');
	const del = await sql`delete from helpful_marks where comment_id = ${commentId} and user_id = ${userId}`;
	if (!del.count) await sql`insert into helpful_marks (comment_id, user_id) values (${commentId}, ${userId})`;
	await sql`update comments set helpful = (select count(*) from helpful_marks where comment_id = ${commentId}) where id = ${commentId}`;
}

export async function markSolved(sql: Sql, userId: string, postId: string, commentId: string | null) {
	const [p] = await sql`select author_id, kind, title from posts where id = ${postId}`;
	if (!p || p.author_id !== userId) throw new PostError('Nur wer gefragt hat, kann eine Antwort als Lösung markieren.');
	if (commentId) {
		const [c] = await sql`select author_id from comments where id = ${commentId} and post_id = ${postId} and status = 'sichtbar'`;
		if (!c) throw new PostError('Antwort nicht gefunden.');
		await notify(sql, c.author_id, 'loesung', `Deine Antwort auf „${p.title}“ wurde als Lösung markiert.`, `/community/b/${postId}#a-${commentId}`);
	}
	await sql`update posts set solved_comment = ${commentId} where id = ${postId}`;
}

export async function vote(sql: Sql, userId: string, postId: string, choices: number[]) {
	const p = await readablePost(sql, userId, postId);
	if (p.closed || p.archived) throw new PostError('Umfrage ist geschlossen.');
	const [poll] = await sql`select options, multiple, (closes_at is not null and closes_at < now()) as ended from polls where post_id = ${postId}`;
	if (!poll) throw new PostError('Keine Umfrage.');
	if (poll.ended) throw new PostError('Die Umfrage ist beendet.');
	const n = (poll.options as string[]).length;
	const c = [...new Set(choices)].filter((x) => Number.isInteger(x) && x >= 0 && x < n);
	if (!c.length) throw new PostError('Bitte eine Antwort wählen.');
	if (!poll.multiple && c.length > 1) throw new PostError('Nur eine Antwort möglich.');
	await sql`insert into poll_votes (post_id, user_id, choices) values (${postId}, ${userId}, ${c})
		on conflict (post_id, user_id) do update set choices = excluded.choices, voted_at = now()`;
}

export async function toggleBookmark(sql: Sql, userId: string, postId: string): Promise<boolean> {
	await readablePost(sql, userId, postId);
	const del = await sql`delete from bookmarks where user_id = ${userId} and post_id = ${postId}`;
	if (del.count) return false;
	await sql`insert into bookmarks (user_id, post_id) values (${userId}, ${postId}) on conflict do nothing`;
	return true;
}

export async function subscriptions(sql: Sql, userId: string) {
	const rows = await sql`select s.kind, s.key, coalesce(t.name, r.name) as name, r.level from subscriptions s
		left join topics t on s.kind = 'topic' and t.key = s.key left join regions r on s.kind = 'region' and r.code = s.key
		where s.user_id = ${userId} order by s.kind, name`;
	return rows.map((r) => ({ kind: r.kind as 'region' | 'topic', key: r.key as string, name: (r.name as string) ?? r.key, level: r.level as string | null }));
}

export async function setSubscription(sql: Sql, userId: string, kind: 'region' | 'topic', key: string, on: boolean) {
	if (kind === 'topic') {
		const [t] = await sql`select 1 from topics where key = ${key}`;
		if (!t) throw new PostError('Unbekanntes Thema.');
	} else {
		const [r] = await sql`select 1 from regions where code = ${key}`;
		if (!r) throw new PostError('Unbekannte Region.');
	}
	if (on) {
		const [{ n }] = await sql`select count(*)::int as n from subscriptions where user_id = ${userId}`;
		if (n >= 40) throw new PostError('Höchstens 40 Abos.');
		await sql`insert into subscriptions (user_id, kind, key) values (${userId}, ${kind}, ${key}) on conflict do nothing`;
	} else await sql`delete from subscriptions where user_id = ${userId} and kind = ${kind} and key = ${key}`;
}

/** Darf diese Person das Bild sehen? (Beitragsbilder wie der Beitrag, Ortsfotos öffentlich nach Freigabe) */
export async function canSeeMedia(sql: Sql, viewerId: string | null, mediaId: string): Promise<boolean> {
	const [m] = await sql`select m.purpose, m.status, m.post_id, m.place_id, m.owner_id from media m where m.id = ${mediaId}`;
	if (!m || m.status === 'entfernt') return false;
	if (m.purpose === 'ort') return m.status === 'sichtbar' || (!!viewerId && (m.owner_id === viewerId || (await userCan(sql, viewerId, 'content.moderate'))));
	if (!viewerId) return false;
	if (m.purpose === 'linkvorschau') return true;
	if (m.purpose === 'markt') {
		const [l] = await sql`select l.id, l.user_id, l.status from media x join market_listings l on l.id = x.listing_id where x.id = ${mediaId}`;
		if (!l) return false;
		if (l.user_id === viewerId) return true;
		if (await userCan(sql, viewerId, 'content.moderate')) return true;
		if (m.status !== 'sichtbar' || !['verfuegbar', 'reserviert', 'abgegeben', 'abgelaufen'].includes(l.status)) return false;
		const [b] = await sql`select 1 as x from blocks where (blocker = ${l.user_id} and blocked = ${viewerId}) or (blocker = ${viewerId} and blocked = ${l.user_id})`;
		return !b;
	}
	if (!m.post_id) return false;
	try {
		const p = await readablePost(sql, viewerId, m.post_id);
		if (m.status !== 'sichtbar' && m.owner_id !== viewerId) return canModerate(sql, viewerId, { regionCode: p.region_code, topicKey: p.topic_key, groupId: p.group_id });
		return true;
	} catch {
		const [p] = await sql`select region_code, topic_key, group_id from posts where id = ${m.post_id}`;
		return p ? canModerate(sql, viewerId, { regionCode: p.region_code, topicKey: p.topic_key, groupId: p.group_id }) : false;
	}
}

// ---------- Einladungen in Landes-Beiträge (F-023) ----------

export const INVITES_PER_DAY = 20;

/** Jemanden per Familien-ID in einen Landes-Beitrag einladen: liest und antwortet genau dort. */
export async function inviteToPost(sql: Sql, inviterId: string, postId: string, contactInput: string): Promise<{ name: string }> {
	const p = await readablePost(sql, inviterId, postId);
	if (!p.land_code) throw new PostError('Dieser Beitrag ist für ganz Deutschland sichtbar – dafür braucht es keine Einladung. Teile einfach den Link.');
	if (p.status !== 'sichtbar') throw new PostError('Einladen geht erst, wenn der Beitrag sichtbar ist.');
	if (await mutedUntil(sql, inviterId)) throw new PostError('Du kannst gerade niemanden einladen (zeitweise eingeschränkt durch die Moderation).');
	const { normalizeContactId } = await import('../contactid');
	const cid = normalizeContactId(contactInput);
	if (!cid) throw new PostError('Bitte eine gültige Familien-ID eingeben (z. B. K7M 4QX 2HD).');
	const [t] = await sql`select p.user_id from user_profiles p join users u on u.id = p.user_id and u.status = 'active' where p.contact_id = ${cid}`;
	// Gleiche Antwort für „gibt es nicht“ und „blockiert“ – verrät nichts über fremde Konten
	const notFound = new PostError('Diese Familien-ID können wir nicht einladen.');
	if (!t || t.user_id === inviterId) throw notFound;
	const target = t.user_id as string;
	const [blocked] = await sql`select 1 as x from blocks where (blocker = ${target} and blocked = ${inviterId}) or (blocker = ${inviterId} and blocked = ${target})
		or (blocker = ${target} and blocked = ${p.author_id}) or (blocker = ${p.author_id} and blocked = ${target})`;
	if (blocked) throw notFound;
	if (await landAccess(sql, target, { id: postId, land_code: p.land_code, author_id: p.author_id })) throw new PostError('Diese Person kann den Beitrag schon lesen.');
	const [{ n }] = await sql`select count(*)::int as n from post_invites where invited_by = ${inviterId} and created_at > now() - interval '1 day'`;
	if (n >= INVITES_PER_DAY) throw new PostError(`Höchstens ${INVITES_PER_DAY} Einladungen am Tag. Bitte morgen weiter.`);
	await sql`insert into post_invites (post_id, user_id, invited_by) values (${postId}, ${target}, ${inviterId}) on conflict do nothing`;
	const [land] = await sql`select name from regions where code = ${p.land_code}`;
	const inviterName = (await authorViews(sql, target, [inviterId], null, false)).get(inviterId)?.name ?? 'Ein Mitglied';
	await notify(sql, target, 'einladung_beitrag', `${inviterName} lädt dich zu „${p.title}“ ein (${landName((land?.name as string) ?? '')})`, `/community/b/${postId}`);
	const targetName = (await authorViews(sql, inviterId, [target], null, false)).get(target)?.name ?? 'Ein Mitglied';
	return { name: targetName };
}

/** Eingeladene eines Beitrags – nur für die Verfasserin. */
export async function listInvites(sql: Sql, viewerId: string, postId: string) {
	const [p] = await sql`select author_id from posts where id = ${postId}`;
	if (!p || p.author_id !== viewerId) return [];
	const rows = await sql`select user_id, invited_by, created_at from post_invites where post_id = ${postId} order by created_at`;
	const names = await authorViews(sql, viewerId, rows.flatMap((r) => [r.user_id, r.invited_by].filter(Boolean)), null, false);
	return rows.map((r) => ({
		userId: r.user_id as string,
		name: names.get(r.user_id)?.name ?? 'Ein Mitglied',
		by: r.invited_by === viewerId ? 'dir' : (names.get(r.invited_by)?.name ?? 'einem Mitglied'),
		at: r.created_at as Date
	}));
}

/** Verfasserin nimmt eine Einladung zurück; die Person kann den Beitrag danach nicht mehr lesen. */
export async function revokeInvite(sql: Sql, authorId: string, postId: string, userId: string) {
	const [p] = await sql`select author_id from posts where id = ${postId}`;
	if (!p || p.author_id !== authorId) throw new PostError('Nur die Verfasserin oder der Verfasser kann Einladungen zurücknehmen.');
	await sql`delete from post_invites where post_id = ${postId} and user_id = ${userId}`;
}

/** Oben anheften / lösen (F-030) – nur wer den Beitrag moderieren darf. Keine Mitteilung an die Verfasserin, nur Protokoll. */
export async function togglePin(sql: Sql, userId: string, postId: string): Promise<boolean> {
	const p = await getPost(sql, userId, postId);
	if (!p?.moderator) throw new PostError('Keine Berechtigung.');
	const [r] = await sql`update posts set pinned = not pinned where id = ${postId} returning pinned`;
	await audit(sql, { actorId: userId, action: r.pinned ? 'post.pinned' : 'post.unpinned', targetType: 'post', targetId: postId });
	return r.pinned as boolean;
}
