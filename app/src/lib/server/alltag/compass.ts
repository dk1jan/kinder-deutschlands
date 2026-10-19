// Lebenslagen-Kompass (M15): Einstiege mit Schritten, offiziellen Informationen, Beratungsstellen, Wissen und Gruppen.
// Die Auswahl wird nicht gespeichert (keine Sitzung, kein Profil, kein Protokoll) – nur die Adresse der Seite.
import type { Sql } from '../db';
import { PostError } from '../community/posts';
import { cleanUrl, subtree } from '../angebote/common';
import { userCan } from '../roles';
import { audit } from '../audit';

export async function situations(sql: Sql) {
	return (await sql`select s.key, s.title, s.intro, s.sensitive, (select count(*)::int from life_items i where i.situation = s.key) as items from life_situations s order by s.sort`).map((s) => ({
		key: s.key as string,
		title: s.title as string,
		intro: s.intro as string,
		sensitive: s.sensitive as boolean,
		items: s.items as number
	}));
}

export async function situation(sql: Sql, key: string, opts: { region: string | null; member: boolean; viewerId: string | null }) {
	const [s] = await sql`select * from life_situations where key = ${key}`;
	if (!s) return null;
	const items = await sql`select id, kind, section, title, body, url, source, reviewed_at from life_items where situation = ${key} order by sort, title`;
	const orgs = (s.org_kinds as string[]).length
		? await sql`select o.slug, o.name, o.kind, r.name as region_name from organizations o left join regions r on r.code = o.region_code
			where o.status = 'verifiziert' and o.kind = any(${s.org_kinds}) ${opts.region ? sql`and o.region_code in ${subtree(sql, opts.region)}` : sql``}
			order by o.name limit 20`
		: [];
	const knowledge = s.topic_key
		? await sql`select slug, title, summary, reviewed_at from knowledge where status = 'veroeffentlicht' and topic_key = ${s.topic_key}
			${opts.member ? sql`` : sql`and visibility = 'oeffentlich'`} order by reviewed_at desc nulls last limit 8`
		: [];
	const groups = s.topic_key && opts.member
		? await sql`select slug, name, kind, description from community_groups where status = 'aktiv' and topic_key = ${s.topic_key} order by name limit 8`
		: [];
	return {
		key: s.key as string,
		title: s.title as string,
		intro: s.intro as string,
		topicKey: s.topic_key as string | null,
		sensitive: s.sensitive as boolean,
		steps: items.filter((i) => i.kind === 'schritt').map(row),
		infos: items.filter((i) => i.kind === 'info').map(row),
		orgs: orgs.map((o) => ({ slug: o.slug as string, name: o.name as string, kind: o.kind as string, regionName: o.region_name as string | null })),
		knowledge: knowledge.map((k) => ({ slug: k.slug as string, title: k.title as string, summary: k.summary as string })),
		groups: groups.map((g) => ({ slug: g.slug as string, name: g.name as string, kind: g.kind as string, description: g.description as string }))
	};
}

const row = (i: Record<string, unknown>) => ({
	id: i.id as string,
	section: i.section as string | null,
	title: i.title as string,
	body: i.body as string,
	url: i.url as string | null,
	source: i.source as string | null,
	reviewedAt: i.reviewed_at as Date | null
});

export interface ItemInput {
	situation: string;
	kind: 'schritt' | 'info';
	section: string | null;
	title: string;
	body: string;
	url: string | null;
	source: string | null;
	sort: number;
}

export async function saveItem(sql: Sql, userId: string, id: string | null, i: ItemInput) {
	if (!(await userCan(sql, userId, 'compass.edit'))) throw new PostError('Keine Berechtigung.');
	if (!['schritt', 'info'].includes(i.kind)) throw new PostError('Ungültige Art.');
	if (i.title.trim().length < 3) throw new PostError('Titel zu kurz.');
	if (!i.source?.trim()) throw new PostError('Bitte die Quelle angeben (z. B. „Familienportal (BMFSFJ)“).');
	const url = cleanUrl(i.url, 'Link');
	const [s] = await sql`select key from life_situations where key = ${i.situation}`;
	if (!s) throw new PostError('Lebenslage nicht gefunden.');
	if (id) {
		await sql`update life_items set kind = ${i.kind}, section = ${i.section?.trim() || null}, title = ${i.title.trim()}, body = ${i.body.trim()}, url = ${url},
			source = ${i.source.trim()}, reviewed_at = current_date, sort = ${i.sort}, updated_by = ${userId}, updated_at = now() where id = ${id}`;
	} else {
		const [r] = await sql`insert into life_items (situation, kind, section, title, body, url, source, reviewed_at, sort, updated_by)
			values (${i.situation}, ${i.kind}, ${i.section?.trim() || null}, ${i.title.trim()}, ${i.body.trim()}, ${url}, ${i.source.trim()}, current_date, ${i.sort}, ${userId}) returning id`;
		id = r.id as string;
	}
	await audit(sql, { actorId: userId, action: 'compass.item.saved', targetType: 'life_item', targetId: id });
	return id;
}

export async function deleteItem(sql: Sql, userId: string, id: string) {
	if (!(await userCan(sql, userId, 'compass.edit'))) throw new PostError('Keine Berechtigung.');
	await sql`delete from life_items where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'compass.item.deleted', targetType: 'life_item', targetId: id });
}

export async function allItems(sql: Sql) {
	return (await sql`select i.*, s.title as situation_title from life_items i join life_situations s on s.key = i.situation order by s.sort, i.sort, i.title`).map((i) => ({
		...row(i),
		situation: i.situation as string,
		situationTitle: i.situation_title as string,
		kind: i.kind as string,
		sort: i.sort as number
	}));
}
