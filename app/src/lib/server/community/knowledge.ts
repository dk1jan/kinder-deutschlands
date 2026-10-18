// Wissen aus der Community (M19): redaktionell geprüfte Einträge mit Quellen und Prüfdatum.
// Übernahme aus einem Beitrag nur aus offenen Bereichen (keine Gruppen) und nur mit Zustimmung der Autorin/des Autors.
import type { Sql } from '../db';
import { userCan } from '../roles';
import { audit } from '../audit';
import { notify, PostError } from './posts';

export interface Source {
	title: string;
	url: string;
}

export async function listKnowledge(sql: Sql, opts: { member: boolean; editor: boolean; topic?: string | null; q?: string | null }) {
	const q = opts.q?.trim().slice(0, 100) || null;
	const rows = await sql`select k.slug, k.title, k.summary, k.topic_key, t.name as topic_name, k.visibility, k.status, k.reviewed_at, k.updated_at
		from knowledge k left join topics t on t.key = k.topic_key
		where ${opts.editor ? sql`k.status <> 'archiviert'` : sql`k.status = 'veroeffentlicht'`}
			${opts.member || opts.editor ? sql`` : sql`and k.visibility = 'oeffentlich'`}
			${opts.topic ? sql`and k.topic_key = ${opts.topic}` : sql``}
			${q ? sql`and (k.title ilike ${'%' + q + '%'} or k.summary ilike ${'%' + q + '%'} or k.body ilike ${'%' + q + '%'})` : sql``}
		order by k.status = 'entwurf' desc, k.updated_at desc limit 200`;
	return rows.map((r) => ({
		slug: r.slug as string,
		title: r.title as string,
		summary: r.summary as string,
		topic: r.topic_key ? { key: r.topic_key as string, name: r.topic_name as string } : null,
		visibility: r.visibility as string,
		status: r.status as string,
		reviewedAt: r.reviewed_at as Date | null
	}));
}

export async function getKnowledge(sql: Sql, slug: string, opts: { member: boolean; editor: boolean }) {
	const [k] = await sql`select k.*, t.name as topic_name from knowledge k left join topics t on t.key = k.topic_key where k.slug = ${slug}`;
	if (!k) return null;
	if (!opts.editor && (k.status !== 'veroeffentlicht' || (k.visibility !== 'oeffentlich' && !opts.member))) return null;
	return {
		id: k.id as string,
		slug: k.slug as string,
		title: k.title as string,
		summary: k.summary as string,
		body: k.body as string,
		topic_name: k.topic_name as string | null,
		visibility: k.visibility as string,
		status: k.status as string,
		reviewed_at: k.reviewed_at as Date | null,
		sources: (k.sources ?? []) as Source[]
	};
}

export interface KnowledgeInput {
	slug: string;
	title: string;
	summary: string;
	body: string;
	sources: Source[];
	topicKey: string | null;
	regionCode: string | null;
	visibility: string;
	publish: boolean;
}

export function slugify(s: string) {
	return s
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

export function parseSources(raw: string): Source[] {
	const out: Source[] = [];
	for (const line of raw.split('\n')) {
		const m = /^(.*?)\s*(https?:\/\/\S+)\s*$/.exec(line.trim());
		if (!m) continue;
		try {
			const u = new URL(m[2]);
			if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
			out.push({ title: (m[1] || u.hostname).replace(/[-–:|]\s*$/, '').trim().slice(0, 200), url: u.toString() });
		} catch {
			/* ungültig */
		}
	}
	return out.slice(0, 20);
}

export async function saveKnowledge(sql: Sql, editorId: string, id: string | null, k: KnowledgeInput) {
	if (!(await userCan(sql, editorId, 'knowledge.edit'))) throw new PostError('Keine Berechtigung für Wissenseinträge.');
	if (!/^[a-z0-9-]{3,100}$/.test(k.slug)) throw new PostError('Kurzname: 3–100 Zeichen a–z, 0–9, Bindestrich.');
	if (k.title.trim().length < 5) throw new PostError('Titel zu kurz.');
	if (k.summary.trim().length < 20) throw new PostError('Bitte eine Zusammenfassung (mindestens 20 Zeichen).');
	if (!['mitglieder', 'oeffentlich'].includes(k.visibility)) throw new PostError('Ungültige Sichtbarkeit.');
	if (k.publish && !k.sources.length) throw new PostError('Zum Veröffentlichen mindestens eine Quelle angeben.');
	if (id) {
		const [cur] = await sql`select consent from knowledge where id = ${id}`;
		if (k.publish && cur && cur.consent !== 'nicht_noetig' && cur.consent !== 'erteilt') throw new PostError('Veröffentlichen erst nach Zustimmung der Autorin/des Autors des Beitrags.');
		await sql`update knowledge set slug = ${k.slug}, title = ${k.title.trim()}, summary = ${k.summary.trim()}, body = ${k.body}, sources = ${sql.json(k.sources as never)},
			topic_key = ${k.topicKey}, region_code = ${k.regionCode}, visibility = ${k.visibility},
			status = ${k.publish ? 'veroeffentlicht' : 'entwurf'}, reviewed_at = ${k.publish ? sql`now()` : sql`reviewed_at`}, reviewed_by = ${k.publish ? editorId : sql`reviewed_by`}, updated_at = now()
			where id = ${id}`;
		await audit(sql, { actorId: editorId, action: k.publish ? 'knowledge.published' : 'knowledge.saved', targetType: 'knowledge', targetId: id });
		return id;
	}
	const [row] = await sql`insert into knowledge (slug, title, summary, body, sources, topic_key, region_code, visibility, status, reviewed_at, reviewed_by, created_by)
		values (${k.slug}, ${k.title.trim()}, ${k.summary.trim()}, ${k.body}, ${sql.json(k.sources as never)}, ${k.topicKey}, ${k.regionCode}, ${k.visibility},
			${k.publish ? 'veroeffentlicht' : 'entwurf'}, ${k.publish ? sql`now()` : null}, ${k.publish ? editorId : null}, ${editorId}) returning id`;
	await audit(sql, { actorId: editorId, action: 'knowledge.created', targetType: 'knowledge', targetId: row.id });
	return row.id as string;
}

/** Entwurf aus einem Beitrag – nur aus offenen Bereichen, Zustimmung wird angefragt. */
export async function draftFromPost(sql: Sql, editorId: string, postId: string) {
	if (!(await userCan(sql, editorId, 'knowledge.edit'))) throw new PostError('Keine Berechtigung.');
	const [p] = await sql`select p.id, p.title, p.body, p.topic_key, p.region_code, p.group_id, p.author_id, p.status from posts p where p.id = ${postId}`;
	if (!p || p.status !== 'sichtbar') throw new PostError('Beitrag nicht gefunden.');
	if (p.group_id) throw new PostError('Beiträge aus Gruppen werden nicht in Wissenseinträge übernommen.');
	const comments = await sql`select body from comments where post_id = ${postId} and status = 'sichtbar' order by helpful desc, created_at limit 5`;
	let slug = slugify(p.title) || 'eintrag';
	const [taken] = await sql`select 1 as x from knowledge where slug = ${slug}`;
	if (taken) slug = `${slug}-${Date.now().toString(36)}`;
	const body = `${p.body}\n\n${comments.map((c) => `> ${String(c.body).split('\n').join('\n> ')}`).join('\n\n')}`.trim();
	const [row] = await sql`insert into knowledge (slug, title, summary, body, topic_key, region_code, from_post_id, consent, created_by)
		values (${slug}, ${p.title}, ${'Zusammenfassung folgt.'}, ${body}, ${p.topic_key}, ${p.region_code}, ${postId}, 'angefragt', ${editorId}) returning id, slug`;
	await notify(sql, p.author_id, 'wissen', `Die Redaktion möchte deinen Beitrag „${p.title}“ als Wissenseintrag aufbereiten. Bitte stimme zu oder lehne ab.`, `/community/wissen/zustimmung/${row.id}`);
	await audit(sql, { actorId: editorId, action: 'knowledge.consent.requested', targetType: 'knowledge', targetId: row.id });
	return row.slug as string;
}

export async function consentInfo(sql: Sql, userId: string, id: string) {
	const [k] = await sql`select k.id, k.title, k.consent, p.author_id, p.title as post_title from knowledge k join posts p on p.id = k.from_post_id where k.id = ${id}`;
	if (!k || k.author_id !== userId) return null;
	return { id: k.id as string, title: k.title as string, postTitle: k.post_title as string, consent: k.consent as string };
}

export async function giveConsent(sql: Sql, userId: string, id: string, yes: boolean) {
	const info = await consentInfo(sql, userId, id);
	if (!info) throw new PostError('Anfrage nicht gefunden.');
	await sql`update knowledge set consent = ${yes ? 'erteilt' : 'abgelehnt'}, status = case when ${yes} then status else 'archiviert' end where id = ${id}`;
	await audit(sql, { actorId: userId, action: yes ? 'knowledge.consent.given' : 'knowledge.consent.denied', targetType: 'knowledge', targetId: id });
}
