// Moderatoren-Cockpit (M24): eine Warteschlange aus Meldungen, automatischen Markierungen und Einsprüchen.
// Jede Moderatorin sieht nur Fälle ihrer Zuständigkeit (Region inkl. Unterregionen, Thema, ausdrücklich zugewiesene Gruppe).
// Entscheidungen brauchen eine Begründung, werden protokolliert und der betroffenen Person mitgeteilt (mit Einspruchsmöglichkeit).
import type { Sql } from '../db';
import { loadAssignments, loadPermissions, regionPath } from '../roles';
import { can } from '../rights';
import { audit } from '../audit';
import { notify, PostError } from './posts';
import { REASON_LABEL } from './automod';

export const REPORT_REASONS = ['unangemessen', 'beleidigung', 'drohung', 'spam', 'betrugsverdacht', 'private_daten', 'kinderfoto', 'falsch', 'sonstiges'] as const;

export const ACTIONS = {
	freigeben: 'Freigeben (kein Verstoß)',
	kennzeichnen: 'Mit Hinweis kennzeichnen',
	ausblenden: 'Ausblenden',
	entfernen: 'Entfernen (Beweis bleibt gesichert)',
	wiederherstellen: 'Wiederherstellen',
	schliessen: 'Beitrag schließen',
	archivieren: 'Beitrag archivieren',
	anheften: 'Anheften / lösen',
	verschieben: 'Thema/Region ändern',
	verwarnen: 'Person verwarnen',
	stumm: 'Person zeitweise einschränken',
	sperren: 'Konto sperren',
	eskalieren: 'An Betreiber eskalieren'
} as const;
export type ModAction = keyof typeof ACTIONS;

interface Scope {
	regionCode: string | null;
	topicKey: string | null;
	groupId: string | null;
	groupKind: string | null;
	authorId: string | null;
}

async function scopeOf(sql: Sql, type: string, id: string): Promise<Scope | null> {
	if (type === 'post') {
		const [p] = await sql`select p.region_code, p.topic_key, p.group_id, g.kind as group_kind, p.author_id from posts p left join community_groups g on g.id = p.group_id where p.id = ${id}`;
		return p ? { regionCode: p.region_code, topicKey: p.topic_key, groupId: p.group_id, groupKind: p.group_kind, authorId: p.author_id } : null;
	}
	if (type === 'comment') {
		const [c] = await sql`select p.region_code, p.topic_key, p.group_id, g.kind as group_kind, c.author_id from comments c join posts p on p.id = c.post_id
			left join community_groups g on g.id = p.group_id where c.id = ${id}`;
		return c ? { regionCode: c.region_code, topicKey: c.topic_key, groupId: c.group_id, groupKind: c.group_kind, authorId: c.author_id } : null;
	}
	if (type === 'media') {
		const [m] = await sql`select m.owner_id, p.region_code, p.topic_key, p.group_id, g.kind as group_kind, pl.region_code as place_region from media m
			left join posts p on p.id = m.post_id left join community_groups g on g.id = p.group_id left join places pl on pl.id = m.place_id where m.id = ${id}`;
		return m ? { regionCode: m.region_code ?? m.place_region, topicKey: m.topic_key, groupId: m.group_id, groupKind: m.group_kind, authorId: m.owner_id } : null;
	}
	if (type === 'review') {
		const [r] = await sql`select pl.region_code, v.user_id from place_reviews v join places pl on pl.id = v.place_id where v.id = ${id}`;
		return r ? { regionCode: r.region_code, topicKey: null, groupId: null, groupKind: null, authorId: r.user_id } : null;
	}
	if (type === 'user') return { regionCode: null, topicKey: null, groupId: null, groupKind: null, authorId: id };
	if (type === 'event') {
		const [e] = await sql`select region_code, created_by, origin from events where id = ${id}`;
		return e ? { regionCode: e.region_code, topicKey: null, groupId: null, groupKind: null, authorId: e.origin === 'mitglied' ? e.created_by : null } : null;
	}
	if (type === 'offer') {
		const [o] = await sql`select region_code from offers where id = ${id}`;
		return o ? { regionCode: o.region_code, topicKey: null, groupId: null, groupKind: null, authorId: null } : null;
	}
	if (type === 'org') {
		const [o] = await sql`select region_code from organizations where id = ${id}`;
		return o ? { regionCode: o.region_code, topicKey: null, groupId: null, groupKind: null, authorId: null } : null;
	}
	if (type === 'chat') {
		// Verschlüsselte Chats: Absender vom Server bestätigt, Inhalt nur aus der Meldung (freigegeben von der meldenden Person)
		const [c] = await sql`select evidence->>'sender_user' as author from mod_cases where target_type = 'chat' and target_id = ${id} limit 1`;
		return c ? { regionCode: null, topicKey: null, groupId: null, groupKind: null, authorId: c.author ?? null } : null;
	}
	return null;
}

/** Meldung durch ein Mitglied. Doppelte Meldungen derselben Person zum selben Inhalt werden zusammengefasst. */
export async function report(sql: Sql, reporterId: string, type: 'post' | 'comment' | 'media' | 'review' | 'user' | 'event' | 'offer' | 'org', id: string, reason: string, message: string | null) {
	if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new PostError('Bitte einen Grund wählen.');
	const s = await scopeOf(sql, type, id);
	if (!s) throw new PostError('Inhalt nicht gefunden.');
	if (s.authorId === reporterId) throw new PostError('Eigene Inhalte kannst du selbst bearbeiten oder löschen.');
	const [dup] = await sql`select 1 as x from mod_cases where target_type = ${type} and target_id = ${id} and reporter_id = ${reporterId} and status in ('offen', 'in_arbeit')`;
	if (dup) return;
	const prio = reason === 'drohung' || reason === 'kinderfoto' ? 1 : reason === 'spam' ? 3 : 2;
	await sql`insert into mod_cases (target_type, target_id, source, reason, message, reporter_id, priority, region_code, topic_key, group_id)
		values (${type}, ${id}, 'meldung', ${reason}, ${message}, ${reporterId}, ${prio}, ${s.regionCode}, ${s.topicKey}, ${s.groupId})`;
}

/** Einspruch gegen Ausblenden/Entfernen eigener Inhalte – einmal je Entscheidung. */
export async function appeal(sql: Sql, userId: string, type: 'post' | 'comment', id: string, message: string) {
	const s = await scopeOf(sql, type, id);
	if (!s || s.authorId !== userId) throw new PostError('Nur eigene Inhalte.');
	const [t] = type === 'post' ? await sql`select status from posts where id = ${id}` : await sql`select status from comments where id = ${id}`;
	if (!t || (t.status !== 'ausgeblendet' && t.status !== 'entfernt')) throw new PostError('Hier gibt es nichts anzufechten.');
	const [open] = await sql`select 1 as x from mod_cases where target_type = ${type} and target_id = ${id} and source = 'einspruch' and status in ('offen', 'in_arbeit')`;
	if (open) throw new PostError('Dein Einspruch wird schon geprüft.');
	if (message.trim().length < 10) throw new PostError('Bitte kurz begründen (mindestens 10 Zeichen).');
	await sql`insert into mod_cases (target_type, target_id, source, reason, message, reporter_id, priority, region_code, topic_key, group_id)
		values (${type}, ${id}, 'einspruch', 'einspruch', ${message.trim().slice(0, 1000)}, ${userId}, 2, ${s.regionCode}, ${s.topicKey}, ${s.groupId})`;
}

/** Zuständigkeitsprüfung für einen Fall (Rechte einmal geladen, Regionspfade zwischengespeichert). */
async function checker(sql: Sql, userId: string) {
	const [perms, assignments] = await Promise.all([loadPermissions(sql), loadAssignments(sql, userId)]);
	const paths = new Map<string, string[]>();
	const kinds = new Map<string, string>();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (c: Record<string, any>) => {
		let path: string[] | undefined;
		if (c.region_code) {
			if (!paths.has(c.region_code)) paths.set(c.region_code, await regionPath(sql, c.region_code));
			path = paths.get(c.region_code);
		}
		if (c.group_id) {
			if (!kinds.has(c.group_id)) {
				const [g] = await sql`select kind from community_groups where id = ${c.group_id}`;
				kinds.set(c.group_id, g?.kind ?? 'offen');
			}
			if (kinds.get(c.group_id) === 'geschuetzt') return can(assignments, perms, 'protected_group.moderate', { group: c.group_id });
			if (can(assignments, perms, 'content.moderate', { group: c.group_id })) return true;
		}
		return can(assignments, perms, 'content.moderate', { regionPath: path, topic: c.topic_key ?? undefined, group: c.group_id ?? undefined });
	};
}

export interface QueueFilter {
	status?: string;
	type?: string;
	reason?: string;
	priority?: number;
	mine?: boolean;
}

export async function queue(sql: Sql, userId: string, f: QueueFilter) {
	const allowed = await checker(sql, userId);
	const status = f.status && ['offen', 'in_arbeit', 'erledigt', 'eskaliert'].includes(f.status) ? f.status : null;
	const rows = await sql`select c.*, r.name as region_name, t.name as topic_name, g.name as group_name,
			(select count(*)::int from mod_cases x where x.target_type = c.target_type and x.target_id = c.target_id) as reports
		from mod_cases c left join regions r on r.code = c.region_code left join topics t on t.key = c.topic_key left join community_groups g on g.id = c.group_id
		where ${status ? sql`c.status = ${status}` : sql`c.status in ('offen', 'in_arbeit', 'eskaliert')`}
			${f.type ? sql`and c.target_type = ${f.type}` : sql``}
			${f.reason ? sql`and c.reason = ${f.reason}` : sql``}
			${f.priority ? sql`and c.priority = ${f.priority}` : sql``}
			${f.mine ? sql`and c.assigned_to = ${userId}` : sql``}
		order by c.priority, c.created_at limit 300`;
	const out: (typeof rows)[number][] = [];
	for (const r of rows) if (await allowed(r)) out.push(r);
	// Kurzer Vorschautext je Fall (nur für die berechtigten Fälle), damit die Warteschlange ohne Klick einschätzbar ist
	const ids = (t: string) => out.filter((r) => r.target_type === t).map((r) => String(r.target_id));
	const preview = new Map<string, string>();
	const add = (rs: readonly Record<string, unknown>[]) => rs.forEach((x) => preview.set(String(x.id), String(x.t ?? '').replace(/\s+/g, ' ').slice(0, 90)));
	if (ids('post').length) add(await sql`select id, coalesce(nullif(title, ''), body) as t from posts where id::text = any(${ids('post')})`);
	if (ids('comment').length) add(await sql`select id, body as t from comments where id::text = any(${ids('comment')})`);
	if (ids('review').length) add(await sql`select id, stars || ' ★ ' || coalesce(body, '') as t from place_reviews where id::text = any(${ids('review')})`);
	if (ids('media').length) add(await sql`select id, coalesce(alt, 'Bild') as t from media where id::text = any(${ids('media')})`);
	if (ids('event').length) add(await sql`select id, title as t from events where id::text = any(${ids('event')})`);
	if (ids('offer').length) add(await sql`select id, title as t from offers where id::text = any(${ids('offer')})`);
	if (ids('org').length) add(await sql`select id, name as t from organizations where id::text = any(${ids('org')})`);
	for (const r of out) if (r.target_type === 'chat') preview.set(String(r.target_id), String((r.evidence?.messages ?? []).find((m: { reported?: boolean }) => m.reported)?.body ?? '').replace(/\s+/g, ' ').slice(0, 90));
	return out.map((r) => ({
		preview: preview.get(String(r.target_id)) ?? null,
		id: r.id as string,
		targetType: r.target_type as string,
		targetId: r.target_id as string,
		source: r.source as string,
		reason: r.reason as string,
		reasonLabel: REASON_LABEL[r.reason] ?? r.reason,
		message: r.message as string | null,
		priority: r.priority as number,
		status: r.status as string,
		assigned: r.assigned_to === userId ? 'ich' : r.assigned_to ? 'jemand' : null,
		region: r.region_name as string | null,
		topic: r.topic_name as string | null,
		group: r.group_name as string | null,
		reports: r.reports as number,
		createdAt: r.created_at as Date
	}));
}

export async function caseDetail(sql: Sql, userId: string, id: string) {
	const [c] = await sql`select * from mod_cases where id = ${id}`;
	if (!c) return null;
	if (!(await (await checker(sql, userId))(c))) return null;
	const s = await scopeOf(sql, c.target_type, c.target_id);
	let content: { title?: string; body: string; status: string; link?: string; image?: string; stars?: number } | null = null;
	if (c.target_type === 'post') {
		const [p] = await sql`select title, body, status, id from posts where id = ${c.target_id}`;
		if (p) content = { title: p.title, body: p.body, status: p.status, link: `/community/b/${p.id}` };
	} else if (c.target_type === 'comment') {
		const [x] = await sql`select c.body, c.status, c.post_id, p.title from comments c join posts p on p.id = c.post_id where c.id = ${c.target_id}`;
		if (x) content = { title: `Antwort zu „${x.title}“`, body: x.body, status: x.status, link: `/community/b/${x.post_id}#a-${c.target_id}` };
	} else if (c.target_type === 'media') {
		const [m] = await sql`select id, status, alt, place_id, post_id from media where id = ${c.target_id}`;
		if (m) content = { title: m.place_id ? 'Ortsfoto' : 'Bild im Beitrag', body: m.alt ?? '', status: m.status, image: `/medien/${m.id}`, link: m.place_id ? `/orte/${m.place_id}` : `/community/b/${m.post_id}` };
	} else if (c.target_type === 'review') {
		const [v] = await sql`select stars, body, status, place_id from place_reviews where id = ${c.target_id}`;
		if (v) content = { title: 'Bewertung eines Ortes', body: v.body ?? '', status: v.status, stars: v.stars, link: `/orte/${v.place_id}` };
	} else if (c.target_type === 'event') {
		const [e] = await sql`select id, title, description, status from events where id = ${c.target_id}`;
		if (e) content = { title: `Termin: ${e.title}`, body: e.description, status: e.status, link: `/veranstaltungen/${e.id}` };
	} else if (c.target_type === 'offer') {
		const [o] = await sql`select id, title, description, status from offers where id = ${c.target_id}`;
		if (o) content = { title: `Angebot: ${o.title}`, body: o.description, status: o.status, link: `/angebote/${o.id}` };
	} else if (c.target_type === 'org') {
		const [o] = await sql`select slug, name, description, status from organizations where id = ${c.target_id}`;
		if (o) content = { title: `Einrichtung: ${o.name}`, body: o.description, status: o.status, link: `/einrichtungen/${o.slug}` };
	} else if (c.target_type === 'chat') {
		const ev = (c.evidence ?? {}) as { messages?: { reported?: boolean; body?: string }[] };
		content = { title: 'Gemeldete Chatnachricht', body: ev.messages?.find((m) => m.reported)?.body ?? '', status: 'gemeldet' };
	}
	// Vorgeschichte der Person (nur Anzahl früherer Entscheidungen, keine Inhalte anderer Fälle)
	const [hist] = s?.authorId
		? await sql`select count(*) filter (where decision in ('ausblenden', 'entfernen'))::int as removed,
				(select count(*)::int from user_restrictions where user_id = ${s.authorId}) as restrictions
			from mod_cases where decided_at is not null and target_id in (
				select id::text from posts where author_id = ${s.authorId} union all select id::text from comments where author_id = ${s.authorId})`
		: [{ removed: 0, restrictions: 0 }];
	const related = await sql`select source, reason, message, created_at, status, decision from mod_cases where target_type = ${c.target_type} and target_id = ${c.target_id} and id <> ${id} order by created_at desc limit 20`;
	return { c, content, history: hist, related, authorKnown: !!s?.authorId };
}

export async function takeCase(sql: Sql, userId: string, id: string) {
	const d = await caseDetail(sql, userId, id);
	if (!d) throw new PostError('Fall nicht gefunden.');
	await sql`update mod_cases set assigned_to = ${userId}, status = case when status = 'offen' then 'in_arbeit' else status end where id = ${id}`;
}

export async function saveNote(sql: Sql, userId: string, id: string, note: string) {
	const d = await caseDetail(sql, userId, id);
	if (!d) throw new PostError('Fall nicht gefunden.');
	await sql`update mod_cases set internal_note = ${note.slice(0, 2000)} where id = ${id}`;
}

const TARGET_TABLE = { post: 'posts', comment: 'comments' } as const;

/** Entscheidung umsetzen. Betroffene Person wird informiert (außer bei Freigabe), Einspruch ist möglich. */
export async function decide(
	sql: Sql,
	modId: string,
	caseId: string,
	action: ModAction,
	reason: string,
	extra: { note?: string; days?: number; topicKey?: string | null; regionCode?: string | null } = {}
) {
	if (!(action in ACTIONS)) throw new PostError('Unbekannte Aktion.');
	if (reason.trim().length < 3) throw new PostError('Bitte die Entscheidung kurz begründen.');
	const d = await caseDetail(sql, modId, caseId);
	if (!d) throw new PostError('Fall nicht gefunden.');
	const c = d.c;
	const type = c.target_type as string;
	const s = await scopeOf(sql, type, c.target_id);
	const author = s?.authorId ?? null;
	const setStatus = async (status: string) => {
		if (type === 'post' || type === 'comment') {
			const before = (await sql.unsafe(`select status, ${type === 'comment' ? 'post_id' : 'id as post_id'} from ${TARGET_TABLE[type]} where id = $1`, [c.target_id]))[0];
			await sql.unsafe(`update ${TARGET_TABLE[type]} set status = $1, mod_note = $2 where id = $3`, [status, status === 'sichtbar' ? null : reason.trim(), c.target_id]);
			if (type === 'comment' && before) {
				const delta = (status === 'sichtbar' ? 1 : 0) - (before.status === 'sichtbar' ? 1 : 0);
				if (delta) await sql`update posts set comment_count = greatest(comment_count + ${delta}, 0) where id = ${before.post_id}`;
			}
		} else if (type === 'media') await sql`update media set status = ${status === 'ausgeblendet' ? 'entfernt' : status} where id = ${c.target_id}`;
		else if (type === 'review') await sql`update place_reviews set status = ${status} where id = ${c.target_id}`;
		else if (type === 'event') await sql`update events set status = ${status === 'sichtbar' ? 'aktiv' : 'entfernt'}, mod_note = ${status === 'sichtbar' ? null : reason.trim()}, updated_at = now() where id = ${c.target_id}`;
		else if (type === 'offer') await sql`update offers set status = ${status === 'sichtbar' ? 'aktiv' : 'entfernt'}, updated_at = now() where id = ${c.target_id}`;
		else if (type === 'org' && status !== 'sichtbar') await sql`update organizations set status = 'pausiert', decision_note = ${reason.trim()}, updated_at = now() where id = ${c.target_id} and status = 'verifiziert'`;
	};
	const postId = type === 'post' ? c.target_id : null;
	if (type === 'chat' && !['freigeben', 'verwarnen', 'stumm', 'sperren', 'eskalieren'].includes(action))
		throw new PostError('Chatnachrichten sind verschlüsselt und können nicht entfernt werden. Möglich: freigeben, verwarnen, einschränken, sperren, eskalieren.');
	switch (action) {
		case 'freigeben':
			if (d.content?.status === 'pruefung') await setStatus('sichtbar');
			break;
		case 'wiederherstellen':
			await setStatus('sichtbar');
			break;
		case 'ausblenden':
			await setStatus('ausgeblendet');
			break;
		case 'entfernen':
			await setStatus('entfernt');
			break;
		case 'kennzeichnen':
			if (type === 'post' || type === 'comment') await sql.unsafe(`update ${TARGET_TABLE[type]} set mod_note = $1 where id = $2`, [(extra.note || reason).trim().slice(0, 300), c.target_id]);
			if (d.content?.status === 'pruefung') await setStatus('sichtbar');
			break;
		case 'schliessen':
			if (!postId) throw new PostError('Nur für Beiträge.');
			await sql`update posts set closed = not closed where id = ${postId}`;
			break;
		case 'archivieren':
			if (!postId) throw new PostError('Nur für Beiträge.');
			await sql`update posts set archived = not archived where id = ${postId}`;
			break;
		case 'anheften':
			if (!postId) throw new PostError('Nur für Beiträge.');
			await sql`update posts set pinned = not pinned where id = ${postId}`;
			break;
		case 'verschieben':
			if (!postId) throw new PostError('Nur für Beiträge.');
			await sql`update posts set topic_key = ${extra.topicKey ?? null}, region_code = ${extra.regionCode ?? null} where id = ${postId}`;
			break;
		case 'verwarnen':
		case 'stumm':
			if (!author) throw new PostError('Keine Person zuzuordnen.');
			{
				const days = action === 'stumm' ? Math.min(Math.max(Math.round(extra.days ?? 7), 1), 90) : null;
				await sql`insert into user_restrictions (user_id, kind, reason, until, case_id, created_by)
					values (${author}, ${action === 'stumm' ? 'stumm' : 'verwarnung'}, ${reason.trim()}, ${days ? sql`now() + make_interval(days => ${days})` : null}, ${caseId}, ${modId})`;
			}
			break;
		case 'sperren':
			if (!author) throw new PostError('Keine Person zuzuordnen.');
			{
				const { userCan } = await import('../roles');
				if (!(await userCan(sql, modId, 'users.suspend'))) throw new PostError('Konten sperren darf nur der Betreiber – bitte eskalieren.');
				await sql`update users set status = 'suspended' where id = ${author} and status = 'active'`;
				await sql`delete from sessions where user_id = ${author}`;
				// Auch alle Chat-Geräte abmelden
				const chat = await import('../chat/synapse');
				const [acc] = await sql`select localpart from chat_accounts where user_id = ${author}`;
				if (acc && chat.chatEnabled()) await chat.logoutAll(sql, acc.localpart).catch(() => {});
			}
			break;
		case 'eskalieren':
			await sql`update mod_cases set status = 'eskaliert', internal_note = coalesce(internal_note || E'\n', '') || ${'Eskaliert: ' + reason.trim()} where id = ${caseId}`;
			await audit(sql, { actorId: modId, action: 'mod.escalated', targetType: 'case', targetId: caseId, reason: reason.trim() });
			return;
	}
	// Gleichartige offene Fälle zum selben Inhalt mit erledigen (eine Entscheidung je Inhalt)
	await sql`update mod_cases set status = 'erledigt', decision = ${action}, decision_reason = ${reason.trim()}, decided_by = ${modId}, decided_at = now(),
		assigned_to = coalesce(assigned_to, ${modId})
		where (id = ${caseId} or (target_type = ${type} and target_id = ${c.target_id} and status in ('offen', 'in_arbeit') and source <> 'einspruch'))`;
	await audit(sql, { actorId: modId, action: `mod.${action}`, targetType: type, targetId: String(c.target_id), reason: reason.trim(), meta: { case: caseId } });
	const msg: Partial<Record<ModAction, string>> = {
		ausblenden: 'Ein Inhalt von dir wurde von der Moderation ausgeblendet',
		entfernen: 'Ein Inhalt von dir wurde von der Moderation entfernt',
		kennzeichnen: 'Ein Inhalt von dir wurde mit einem Hinweis der Moderation versehen',
		verwarnen: 'Du hast eine Verwarnung der Moderation erhalten',
		stumm: `Du kannst ${extra.days ?? 7} Tage keine Beiträge, Antworten und Nachrichten in Gruppen oder Treffen schreiben`,
		wiederherstellen: 'Ein Inhalt von dir ist wieder sichtbar',
		sperren: 'Dein Konto wurde gesperrt'
	};
	if (author && msg[action]) {
		const link = type === 'post' ? `/community/b/${c.target_id}` : type === 'comment' && d.content?.link ? d.content.link : '/profil/mitteilungen';
		await notify(sql, author, 'moderation', `${msg[action]}. Begründung: ${reason.trim()}`, link);
	}
	if (c.source === 'meldung' && c.reporter_id && action !== 'freigeben') await notify(sql, c.reporter_id, 'meldung', 'Danke für deine Meldung – die Moderation hat sie bearbeitet.', null);
}

export async function liftRestriction(sql: Sql, modId: string, restrictionId: string) {
	await sql`update user_restrictions set lifted_at = now() where id = ${restrictionId} and lifted_at is null`;
	await audit(sql, { actorId: modId, action: 'mod.restriction.lifted', targetType: 'restriction', targetId: restrictionId });
}

export async function stats(sql: Sql) {
	const [r] = await sql`select
		count(*) filter (where status = 'offen')::int as offen,
		count(*) filter (where status = 'in_arbeit')::int as in_arbeit,
		count(*) filter (where status = 'eskaliert')::int as eskaliert,
		count(*) filter (where decided_at > now() - interval '7 days')::int as erledigt7,
		coalesce(round(extract(epoch from percentile_cont(0.5) within group (order by decided_at - created_at) filter (where decided_at > now() - interval '30 days')) / 3600)::int, 0) as median_h
		from mod_cases`;
	return r;
}
