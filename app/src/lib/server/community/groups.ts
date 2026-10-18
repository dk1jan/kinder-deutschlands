// Gruppen (M04). Geschützte Gruppen: Beiträge und Mitglieder nur für aktive Mitglieder, Pseudonym statt Profilname,
// Mitgliedschaft erscheint nirgends sonst (Profil, Suche, Karte). Aufnahmeprüfung datensparsam: freie Antworten,
// die nach der Entscheidung gelöscht werden – keine Ausweise, keine Akten, keine absolute Garantie.
import type { Sql } from '../db';
import { userCan } from '../roles';
import { audit } from '../audit';
import { groupAccess, notify, PostError } from './posts';

export const GROUP_KINDS = {
	offen: { label: 'Offen', text: 'Alle Mitglieder können lesen und schreiben.' },
	beitritt: { label: 'Mit Beitritt', text: 'Lesen und Schreiben nach Beitrittsanfrage.' },
	geschuetzt: { label: 'Geschützt', text: 'Nur geprüfte Mitglieder, eigener Gruppenname, für andere unsichtbar.' }
} as const;

export async function listGroups(sql: Sql, userId: string) {
	const rows = await sql`select g.id, g.slug, g.name, g.description, g.kind, t.name as topic_name, r.name as region_name, m.status as my_status,
			(select count(*)::int from group_members x where x.group_id = g.id and x.status = 'aktiv') as members
		from community_groups g left join topics t on t.key = g.topic_key left join regions r on r.code = g.region_code
		left join group_members m on m.group_id = g.id and m.user_id = ${userId}
		where g.status = 'aktiv' order by (m.status = 'aktiv') desc nulls last, g.name`;
	return rows.map((g) => ({
		id: g.id as string,
		slug: g.slug as string,
		name: g.name as string,
		description: g.description as string,
		kind: g.kind as keyof typeof GROUP_KINDS,
		topic: g.topic_name as string | null,
		region: g.region_name as string | null,
		myStatus: g.my_status as string | null,
		// Mitgliederzahl geschützter Gruppen nur für Mitglieder, und nur grob
		members: g.kind === 'geschuetzt' && g.my_status !== 'aktiv' ? null : (g.members as number)
	}));
}

export async function groupBySlug(sql: Sql, userId: string, slug: string) {
	const [g] = await sql`select g.*, t.name as topic_name, r.name as region_name from community_groups g
		left join topics t on t.key = g.topic_key left join regions r on r.code = g.region_code where g.slug = ${slug} and g.status = 'aktiv'`;
	if (!g) return null;
	const access = (await groupAccess(sql, userId, g.id))!;
	const [{ n }] = await sql`select count(*)::int as n from group_members where group_id = ${g.id} and status = 'aktiv'`;
	return {
		id: g.id as string,
		slug: g.slug as string,
		name: g.name as string,
		description: g.description as string,
		rules: g.rules as string | null,
		kind: g.kind as keyof typeof GROUP_KINDS,
		topic: g.topic_name as string | null,
		topicKey: g.topic_key as string | null,
		region: g.region_name as string | null,
		admission: (g.admission ?? []) as string[],
		members: g.kind === 'geschuetzt' && !access.member && !access.moderator ? null : n,
		access
	};
}

export async function join(sql: Sql, userId: string, groupId: string, pseudonym: string | null, answers: string[]) {
	const [g] = await sql`select id, kind, name, admission, slug from community_groups where id = ${groupId} and status = 'aktiv'`;
	if (!g) throw new PostError('Gruppe nicht gefunden.');
	const [m] = await sql`select status from group_members where group_id = ${groupId} and user_id = ${userId}`;
	if (m?.status === 'aktiv') throw new PostError('Du bist schon Mitglied.');
	if (m?.status === 'angefragt') throw new PostError('Deine Anfrage wird schon geprüft.');
	if (m?.status === 'entfernt') throw new PostError('Du wurdest aus dieser Gruppe entfernt. Bitte wende dich an die Moderation.');
	let pseudo: string | null = null;
	if (g.kind === 'geschuetzt') {
		pseudo = (pseudonym ?? '').trim().replace(/\s+/g, ' ');
		if (pseudo.length < 3 || pseudo.length > 30 || !/^[\p{L}\p{N} ._-]+$/u.test(pseudo)) throw new PostError('Gruppenname: 3 bis 30 Zeichen, Buchstaben, Zahlen, Leerzeichen, Punkt, Strich.');
		const [taken] = await sql`select 1 from group_members where group_id = ${groupId} and lower(pseudonym) = lower(${pseudo})`;
		if (taken) throw new PostError('Dieser Gruppenname ist schon vergeben.');
		const qs = (g.admission ?? []) as string[];
		if (qs.length && answers.filter((a) => a.trim()).length < qs.length) throw new PostError('Bitte alle Fragen kurz beantworten.');
	}
	const status = g.kind === 'offen' ? 'aktiv' : 'angefragt';
	const application = g.kind === 'geschuetzt' ? ((g.admission ?? []) as string[]).map((q, i) => ({ q, a: (answers[i] ?? '').trim().slice(0, 600) })) : null;
	await sql`insert into group_members (group_id, user_id, status, pseudonym, application) values (${groupId}, ${userId}, ${status}, ${pseudo}, ${application ? sql.json(application as never) : null})
		on conflict (group_id, user_id) do update set status = excluded.status, pseudonym = excluded.pseudonym, application = excluded.application, decided_at = null, decided_by = null, created_at = now()`;
	return status;
}

export async function leave(sql: Sql, userId: string, groupId: string) {
	await sql`delete from group_members where group_id = ${groupId} and user_id = ${userId} and status in ('aktiv', 'angefragt', 'abgelehnt')`;
}

async function requireGroupMod(sql: Sql, userId: string, groupId: string) {
	const a = await groupAccess(sql, userId, groupId);
	if (!a?.moderator) throw new PostError('Nur die Moderation dieser Gruppe darf das.');
	return a;
}

export async function pendingRequests(sql: Sql, modId: string, groupId: string) {
	const a = await requireGroupMod(sql, modId, groupId);
	const prot = a.kind === 'geschuetzt';
	const rows = await sql`select m.user_id, m.pseudonym, m.application, m.created_at, p.contact_id from group_members m
		left join user_profiles p on p.user_id = m.user_id where m.group_id = ${groupId} and m.status = 'angefragt' order by m.created_at`;
	// Geschützte Gruppen: auch die Moderation sieht nur das Pseudonym, nicht das Profil (keine Verknüpfung)
	return rows.map((r) => ({ userId: r.user_id as string, pseudonym: r.pseudonym as string | null, application: (r.application ?? []) as { q: string; a: string }[], at: r.created_at as Date, contactId: prot ? null : (r.contact_id as string | null) }));
}

export async function members(sql: Sql, modId: string, groupId: string) {
	const a = await requireGroupMod(sql, modId, groupId);
	const prot = a.kind === 'geschuetzt';
	const rows = await sql`select m.user_id, m.pseudonym, m.created_at, p.display_name, p.contact_id from group_members m
		left join user_profiles p on p.user_id = m.user_id where m.group_id = ${groupId} and m.status = 'aktiv' order by m.created_at`;
	return rows.map((r) => ({ userId: r.user_id as string, pseudonym: r.pseudonym as string | null, name: prot ? null : (r.display_name as string | null), contactId: prot ? null : (r.contact_id as string | null), since: r.created_at as Date }));
}

export async function decideRequest(sql: Sql, modId: string, groupId: string, userId: string, accept: boolean) {
	const g = await requireGroupMod(sql, modId, groupId);
	const r = await sql`update group_members set status = ${accept ? 'aktiv' : 'abgelehnt'}, application = null, decided_by = ${modId}, decided_at = now()
		where group_id = ${groupId} and user_id = ${userId} and status = 'angefragt'`;
	if (!r.count) throw new PostError('Anfrage nicht (mehr) offen.');
	await audit(sql, { actorId: modId, action: accept ? 'group.member.accepted' : 'group.member.rejected', targetType: 'group', targetId: groupId });
	await notify(sql, userId, 'gruppe', accept ? `Willkommen in der Gruppe „${g.name}“.` : `Deine Anfrage für „${g.name}“ wurde nicht angenommen.`, accept ? `/community/g/${g.slug}` : '/community/gruppen');
}

export async function removeMember(sql: Sql, modId: string, groupId: string, userId: string) {
	const g = await requireGroupMod(sql, modId, groupId);
	await sql`update group_members set status = 'entfernt', decided_by = ${modId}, decided_at = now() where group_id = ${groupId} and user_id = ${userId}`;
	await audit(sql, { actorId: modId, action: 'group.member.removed', targetType: 'group', targetId: groupId });
	await notify(sql, userId, 'gruppe', `Du wurdest aus der Gruppe „${g.name}“ entfernt.`, '/community/gruppen');
}

export interface GroupInput {
	slug: string;
	name: string;
	description: string;
	rules: string | null;
	kind: string;
	topicKey: string | null;
	regionCode: string | null;
	admission: string[];
}

export async function saveGroup(sql: Sql, actorId: string, id: string | null, g: GroupInput) {
	if (!(await userCan(sql, actorId, 'group.manage'))) throw new PostError('Keine Berechtigung für Gruppen.');
	if (!/^[a-z0-9-]{3,60}$/.test(g.slug)) throw new PostError('Kurzname: 3–60 Zeichen, a–z, 0–9, Bindestrich.');
	if (g.name.trim().length < 3 || g.name.length > 80) throw new PostError('Name: 3 bis 80 Zeichen.');
	if (!(g.kind in GROUP_KINDS)) throw new PostError('Ungültige Gruppenart.');
	if (g.description.trim().length < 10) throw new PostError('Bitte kurz beschreiben, worum es geht.');
	const admission = g.admission.map((q) => q.trim()).filter(Boolean).slice(0, 5);
	if (id) {
		await sql`update community_groups set slug = ${g.slug}, name = ${g.name.trim()}, description = ${g.description.trim()}, rules = ${g.rules}, kind = ${g.kind},
			topic_key = ${g.topicKey}, region_code = ${g.regionCode}, admission = ${sql.json(admission)} where id = ${id}`;
		await audit(sql, { actorId, action: 'group.updated', targetType: 'group', targetId: id });
		return id;
	}
	const [row] = await sql`insert into community_groups (slug, name, description, rules, kind, topic_key, region_code, admission, created_by)
		values (${g.slug}, ${g.name.trim()}, ${g.description.trim()}, ${g.rules}, ${g.kind}, ${g.topicKey}, ${g.regionCode}, ${sql.json(admission)}, ${actorId}) returning id`;
	await audit(sql, { actorId, action: 'group.created', targetType: 'group', targetId: row.id });
	return row.id as string;
}
