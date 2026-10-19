// Familien helfen Familien (M16): „Ich brauche Hilfe“ / „Ich kann helfen“ – private Erfahrung, keine Fachberatung.
// Kinderbetreuung durch Fremde wird hier nicht vermittelt (Hinweis auf geprüfte Wege). Akute Krisen: offizielle Stellen.
import type { Sql } from '../db';
import { audit } from '../audit';
import { PostError, notify } from '../community/posts';
import { checkText, holdMessage } from '../community/automod';
import { areContacts, isBlockedEither } from '../profiles';
import { ContactError, sendRequest } from '../contacts';
import { subtree } from '../angebote/common';
import { HELP_CATEGORIES, HELP_KINDS } from '$lib/alltag';

export interface HelpInput {
	kind: string;
	category: string;
	title: string;
	body: string;
	regionCode: string | null;
}

// Fremdbetreuung von Kindern (Babysitten, Aufpassen, Tagesmutter privat) – nicht ungeprüft vermitteln
const CHILDCARE = [/babysitt/, /\b(auf|nach) (mein|unser|dein|euer|ihr)\w* (kind|kinder|sohn|tochter|baby|kleine\w*) (auf)?passen/, /\bkinder ?betreu\w* (suche|biete|gesucht|angeboten|privat)/, /\b(suche|biete)\w* \w* ?kinder ?betreuung/, /\bleih ?oma|leih ?opa/, /\bnanny\b/, /\b(kind|kinder|kids|baby|babys|sohn|tochter|kleine[nr]?)\b (\w+ )?(auf ?passen|aufpassen|hüten|hueten|betreuen)\b/, /\b(aufpassen|hüten|hueten|betreuen) (auf )?(\w+ )?(kind|kinder|kids|baby|babys)\b/, /\b(aufpassen|hüten|hueten) (auf )?(mein|unser|dein|euer)\w* (kind|kinder|kleine)/];
// Hinweise auf akute Krisen – führt zur Anzeige der offiziellen Nummern (keine Speicherung des Treffers)
const CRISIS = [/\bsuizid/, /\bselbstmord/, /\bumbringen\b/, /\bnicht mehr leben\b/, /\bschlägt (mich|uns|mein)/, /\bschlaegt (mich|uns|mein)/, /\bgewalt\b/, /\bmissbrauch/, /\bnotfall\b/, /\bkeine kraft mehr\b/];

const norm = (s: string) => s.toLowerCase();
export const mentionsChildcare = (t: string) => CHILDCARE.some((r) => r.test(norm(t)));
export const mentionsCrisis = (t: string) => CRISIS.some((r) => r.test(norm(t)));

function validate(i: HelpInput) {
	if (!(i.kind in HELP_KINDS)) throw new PostError('Bitte wählen: Ich brauche Hilfe oder Ich kann helfen.');
	if (!(i.category in HELP_CATEGORIES)) throw new PostError('Bitte ein Thema wählen.');
	if (i.title.trim().length < 3 || i.title.length > 120) throw new PostError('Titel: 3 bis 120 Zeichen.');
	if (i.body.length > 3000) throw new PostError('Text zu lang.');
	if (!i.regionCode) throw new PostError('Bitte die Gegend angeben.');
}

export async function createHelp(sql: Sql, userId: string, i: HelpInput) {
	validate(i);
	const text = `${i.title}\n${i.body}`;
	if (mentionsChildcare(text))
		throw new PostError('Kinderbetreuung durch fremde Personen vermitteln wir hier nicht – dafür gibt es geprüfte Wege (z. B. Kindertagespflege über das Jugendamt, Familienzentren, Babysitter-Kurse mit Nachweis). Erfahrungen und Fragen dazu sind in der Community willkommen.');
	const [{ n }] = await sql`select count(*)::int as n from help_posts where user_id = ${userId} and created_at > now() - interval '1 day'`;
	if (n >= 5) throw new PostError('Heute schon mehrere Einträge. Bitte morgen weitermachen.');
	const flags = checkText(text);
	const hold = flags.some((f) => f.hold);
	const [h] = await sql`insert into help_posts (user_id, kind, category, title, body, region_code, status)
		values (${userId}, ${i.kind}, ${i.category}, ${i.title.trim()}, ${i.body.trim()}, ${i.regionCode}, ${hold ? 'pruefung' : 'offen'}) returning id`;
	if (flags.length) {
		const top = [...flags].sort((a, b) => a.priority - b.priority)[0];
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, priority, region_code)
			values ('help', ${h.id}, 'automatisch', ${top.reason}, ${flags.map((f) => f.detail).join(' · ').slice(0, 500)}, ${top.priority}, ${i.regionCode})`;
	}
	await audit(sql, { actorId: userId, action: 'help.created', targetType: 'help', targetId: h.id });
	return { id: h.id as string, held: hold ? holdMessage(flags) : null, crisis: mentionsCrisis(text) };
}

export async function listHelp(sql: Sql, viewerId: string, f: { kind?: string | null; category?: string | null; region?: string | null; q?: string | null; mine?: boolean }) {
	const q = f.q?.trim().slice(0, 80) || null;
	const rows = await sql`select h.id, h.kind, h.category, h.title, left(h.body, 240) as teaser, h.status, h.created_at, h.user_id, r.name as region_name
		from help_posts h left join regions r on r.code = h.region_code join users u on u.id = h.user_id and u.status = 'active'
		where ${f.mine ? sql`h.user_id = ${viewerId} and h.status <> 'entfernt'` : sql`h.status = 'offen' and h.expires_at > now()
			and not exists(select 1 from blocks b where (b.blocker = h.user_id and b.blocked = ${viewerId}) or (b.blocker = ${viewerId} and b.blocked = h.user_id))`}
			${f.kind && f.kind in HELP_KINDS ? sql`and h.kind = ${f.kind}` : sql``}
			${f.category && f.category in HELP_CATEGORIES ? sql`and h.category = ${f.category}` : sql``}
			${f.region ? sql`and h.region_code in ${subtree(sql, f.region)}` : sql``}
			${q ? sql`and (h.title ilike ${'%' + q + '%'} or h.body ilike ${'%' + q + '%'})` : sql``}
		order by h.created_at desc limit 200`;
	return rows.map((h) => ({ id: h.id as string, kind: h.kind as string, category: h.category as string, title: h.title as string, teaser: h.teaser as string, status: h.status as string, createdAt: h.created_at as Date, regionName: h.region_name as string | null, mine: h.user_id === viewerId }));
}

export async function getHelp(sql: Sql, viewerId: string, id: string, opts: { moderator?: boolean } = {}) {
	const [h] = await sql`select h.*, r.name as region_name, p.display_name, p.visibility, p.contact_id, u.status as user_status
		from help_posts h left join regions r on r.code = h.region_code join users u on u.id = h.user_id join user_profiles p on p.user_id = h.user_id where h.id = ${id}`;
	if (!h) return null;
	const mine = h.user_id === viewerId;
	if (!mine && !opts.moderator) {
		if (!['offen', 'erledigt', 'abgelaufen'].includes(h.status) || h.user_status !== 'active') return null;
		if (await isBlockedEither(sql, viewerId, h.user_id)) return null;
	}
	const contact = mine ? null : (await areContacts(sql, viewerId, h.user_id)) ? 'kontakt' : (await sql`select 1 as x from contact_requests where from_user = ${viewerId} and to_user = ${h.user_id} and status = 'offen'`).length ? 'angefragt' : 'keiner';
	const nameVisible = ['alle', 'mitglieder'].includes(h.visibility?.display_name) && !!h.display_name;
	return {
		id: h.id as string,
		kind: h.kind as string,
		category: h.category as string,
		title: h.title as string,
		body: h.body as string,
		status: h.status as string,
		regionCode: h.region_code as string | null,
		regionName: h.region_name as string | null,
		createdAt: h.created_at as Date,
		expiresAt: h.expires_at as Date,
		author: nameVisible ? (h.display_name as string) : 'Mitglied',
		contactId: contact === 'kontakt' ? (h.contact_id as string) : null,
		mine,
		contact: contact as 'kontakt' | 'angefragt' | 'keiner' | null,
		crisis: mentionsCrisis(`${h.title}\n${h.body}`)
	};
}

export async function respondHelp(sql: Sql, viewerId: string, id: string, message: string) {
	const h = await getHelp(sql, viewerId, id);
	if (!h || h.mine || h.status !== 'offen') throw new PostError('Eintrag nicht gefunden oder schon erledigt.');
	if (h.contact === 'kontakt') return { direct: true };
	const text = message.trim().slice(0, 500);
	if (text.length < 5) throw new PostError('Bitte kurz schreiben, wie du helfen kannst bzw. was du brauchst.');
	if (checkText(text).some((f) => f.hold)) throw new PostError('Bitte keine Telefonnummern, E-Mail- oder Kontonummern – nach der Annahme könnt ihr im Chat alles klären.');
	const [owner] = await sql`select user_id from help_posts where id = ${id}`;
	try {
		await sendRequest(sql, viewerId, owner.user_id, `Zu „${h.title}“: ${text}`, 'hilfe', { kind: 'help', id });
	} catch (e) {
		if (e instanceof ContactError) throw new PostError(e.message === 'Du hast dieser Familie schon eine Anfrage geschickt.' ? 'Du hast dieser Person schon eine Anfrage geschickt. Sobald sie annimmt, könnt ihr im Chat schreiben.' : e.message);
		throw e;
	}
	await notify(sql, owner.user_id, 'hilfe', `Antwort auf „${h.title}“ – bitte unter Kontakte annehmen`, '/nachrichten?ansicht=kontakte', { pushKind: 'community', pushBody: 'Neue Antwort auf deinen Eintrag' });
	return { direct: false };
}

export async function setHelpStatus(sql: Sql, userId: string, id: string, status: 'offen' | 'erledigt' | 'entfernt') {
	const [h] = await sql`select user_id, status from help_posts where id = ${id}`;
	if (!h || h.user_id !== userId || h.status === 'entfernt') throw new PostError('Eintrag nicht gefunden.');
	if (h.status === 'pruefung' && status !== 'entfernt') throw new PostError('Der Eintrag wird noch geprüft.');
	await sql`update help_posts set status = ${status}, expires_at = case when ${status} = 'offen' then now() + interval '30 days' else expires_at end,
		body = case when ${status} = 'entfernt' then '' else body end, updated_at = now() where id = ${id}`;
}

export async function expireHelp(sql: Sql): Promise<number> {
	const rows = await sql`update help_posts set status = 'abgelaufen', updated_at = now() where status = 'offen' and expires_at < now() returning id, user_id, title`;
	for (const r of rows) await notify(sql, r.user_id, 'hilfe', `Dein Eintrag „${r.title}“ ist nach 30 Tagen abgelaufen. Du kannst ihn wieder öffnen.`, `/hilfe/${r.id}`, { noPush: true });
	return rows.length;
}
