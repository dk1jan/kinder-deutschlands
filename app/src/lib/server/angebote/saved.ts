// Merkliste, Erinnerungen und eigener Kalender-Link (M18).
// Kein vollständiger Familienkalender bei uns: gespeichert wird nur, was man ausdrücklich merkt.
// Erinnerungen gibt es nur, wenn man sie an einem Eintrag selbst einstellt.
import type { Sql } from '../db';
import { randomToken, sha256hex } from '../crypto';
import { notify, PostError } from '../community/posts';
import { appUrl } from '../config';
import { buildIcs, type IcsEvent } from './ics';
import { expand } from './recurrence';
import { getEvent, pgDate } from './events';

export type SavedKind = 'event' | 'offer' | 'notice';
const NONE = '1900-01-01';

export const REMINDERS = {
	'': 'Keine Erinnerung',
	'1h': '1 Stunde vorher',
	'1d': '1 Tag vorher',
	'3d': '3 Tage vorher',
	'1w': '1 Woche vorher'
} as const;
const OFFSET: Record<string, number> = { '1h': 3600_000, '1d': 86_400_000, '3d': 3 * 86_400_000, '1w': 7 * 86_400_000 };

export async function isSaved(sql: Sql, userId: string, kind: SavedKind, itemId: string, occurrence: string | null) {
	const [r] = await sql`select remind_at from saved_items where user_id = ${userId} and kind = ${kind} and item_id = ${itemId} and occurrence = ${occurrence ?? NONE}`;
	return r ? { remindAt: r.remind_at as Date | null } : null;
}

export async function toggleSaved(sql: Sql, userId: string, kind: SavedKind, itemId: string, occurrence: string | null): Promise<boolean> {
	const occ = occurrence ?? NONE;
	const [d] = await sql`delete from saved_items where user_id = ${userId} and kind = ${kind} and item_id = ${itemId} and occurrence = ${occ} returning 1 as x`;
	if (d) return false;
	const [{ n }] = await sql`select count(*)::int as n from saved_items where user_id = ${userId}`;
	if (n >= 500) throw new PostError('Die Merkliste ist voll (500 Einträge).');
	await sql`insert into saved_items (user_id, kind, item_id, occurrence) values (${userId}, ${kind}, ${itemId}, ${occ}) on conflict do nothing`;
	return true;
}

/** Erinnerung relativ zum Termin bzw. zur Anmeldefrist setzen (oder entfernen). */
export async function setReminder(sql: Sql, userId: string, kind: SavedKind, itemId: string, occurrence: string | null, offset: string, base: 'beginn' | 'frist' = 'beginn') {
	const occ = occurrence ?? NONE;
	if (offset && !(offset in OFFSET)) throw new PostError('Ungültige Erinnerung.');
	let at: Date | null = null;
	if (offset) {
		let ref: Date | null = null;
		if (kind === 'event') {
			const d = await getEvent(sql, { id: userId }, itemId, null);
			if (!d || d.needsLogin) throw new PostError('Termin nicht gefunden.');
			if (base === 'frist') ref = d.event.registrationDeadline;
			else ref = d.occurrences.find((o) => o.date === occurrence)?.start ?? (occurrence ? null : d.event.startsAt);
		} else if (kind === 'notice') {
			const [n] = await sql`select deadline from notices where id = ${itemId}`;
			ref = n?.deadline ? new Date(`${pgDate(n.deadline)}T08:00:00+01:00`) : null;
		}
		if (!ref) throw new PostError('Dafür gibt es keinen Zeitpunkt.');
		at = new Date(ref.getTime() - OFFSET[offset]);
		if (at.getTime() < Date.now()) throw new PostError('Dieser Zeitpunkt liegt schon in der Vergangenheit.');
	}
	await sql`insert into saved_items (user_id, kind, item_id, occurrence, remind_at) values (${userId}, ${kind}, ${itemId}, ${occ}, ${at})
		on conflict (user_id, kind, item_id, occurrence) do update set remind_at = excluded.remind_at, reminded_at = null`;
	return at;
}

/** Zeitplan: fällige Erinnerungen als Mitteilung (und Push, wenn erlaubt – ohne Inhalt). */
export async function sendReminders(sql: Sql): Promise<number> {
	const due = await sql`select s.user_id, s.kind, s.item_id, s.occurrence, coalesce(e.title, n.title, f.title) as title
		from saved_items s left join events e on s.kind = 'event' and e.id = s.item_id left join notices n on s.kind = 'notice' and n.id = s.item_id
			left join offers f on s.kind = 'offer' and f.id = s.item_id
		where s.remind_at is not null and s.reminded_at is null and s.remind_at <= now() limit 200`;
	for (const d of due) {
		const occ = pgDate(d.occurrence);
		const link = d.kind === 'event' ? `/veranstaltungen/${d.item_id}${occ !== NONE ? `?am=${occ}` : ''}` : d.kind === 'notice' ? '/hinweise' : `/angebote/${d.item_id}`;
		await notify(sql, d.user_id, 'erinnerung', `Erinnerung: ${d.title ?? 'gemerkter Eintrag'}`, link, { pushKind: 'erinnerung', pushBody: 'Erinnerung an einen gemerkten Eintrag' });
		await sql`update saved_items set reminded_at = now() where user_id = ${d.user_id} and kind = ${d.kind} and item_id = ${d.item_id} and occurrence = ${d.occurrence}`;
	}
	return due.length;
}

export async function merkliste(sql: Sql, userId: string) {
	const rows = await sql`select s.kind, s.item_id, s.occurrence, s.remind_at, s.created_at,
			e.title as e_title, e.starts_at, e.ends_at, e.rrule, e.exdates, e.status as e_status, e.all_day, e.registration_deadline,
			f.title as f_title, f.status as f_status, o.name as org_name,
			n.title as n_title, n.deadline, n.kind as n_kind
		from saved_items s left join events e on s.kind = 'event' and e.id = s.item_id
			left join offers f on s.kind = 'offer' and f.id = s.item_id left join organizations o on o.id = coalesce(e.org_id, f.org_id)
			left join notices n on s.kind = 'notice' and n.id = s.item_id
		where s.user_id = ${userId} order by s.created_at desc`;
	const now = Date.now();
	return rows
		.map((r) => {
			const occ = pgDate(r.occurrence);
			if (r.kind === 'event') {
				if (!r.e_title) return null;
				let start: Date = r.starts_at, end: Date | null = r.ends_at, cancelled = r.e_status === 'abgesagt';
				if (occ !== NONE) {
					const day = new Date(`${occ}T12:00:00Z`);
					const o = expand({ startsAt: r.starts_at, endsAt: r.ends_at, rrule: r.rrule, exdates: (r.exdates ?? []).map(pgDate) }, new Date(day.getTime() - 86_400_000), new Date(day.getTime() + 86_400_000), 3).find((x) => x.date === occ);
					if (o) ({ start, end } = o), (cancelled ||= o.cancelled);
				}
				return { kind: 'event' as const, id: r.item_id as string, occurrence: occ === NONE ? null : occ, title: r.e_title as string, when: start, end, allDay: r.all_day as boolean, cancelled, past: (end ?? start).getTime() < now, deadline: r.registration_deadline as Date | null, org: r.org_name as string | null, remindAt: r.remind_at as Date | null };
			}
			if (r.kind === 'offer') {
				if (!r.f_title) return null;
				return { kind: 'offer' as const, id: r.item_id as string, occurrence: null, title: r.f_title as string, when: null, end: null, allDay: false, cancelled: r.f_status !== 'aktiv', past: false, deadline: null, org: r.org_name as string | null, remindAt: r.remind_at as Date | null };
			}
			if (!r.n_title) return null;
			const dl = r.deadline ? new Date(`${pgDate(r.deadline)}T23:59:00Z`) : null;
			return { kind: 'notice' as const, id: r.item_id as string, occurrence: null, title: r.n_title as string, when: null, end: null, allDay: false, cancelled: false, past: dl ? dl.getTime() < now : false, deadline: dl, org: null, remindAt: r.remind_at as Date | null };
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);
}

// ---------- Kalender-Link ----------
export async function calendarFeed(sql: Sql, userId: string, renew = false): Promise<string> {
	const token = randomToken(24);
	if (renew) await sql`delete from calendar_feeds where user_id = ${userId}`;
	const [r] = await sql`insert into calendar_feeds (user_id, token_hash) values (${userId}, ${sha256hex(token)}) on conflict (user_id) do nothing returning user_id`;
	if (!r) return ''; // besteht schon – Token ist nur einmal sichtbar
	return `${appUrl()}/kalender/${token}.ics`;
}

export async function hasCalendarFeed(sql: Sql, userId: string) {
	const [r] = await sql`select created_at, last_used_at from calendar_feeds where user_id = ${userId}`;
	return r ? { created: r.created_at as Date, lastUsed: r.last_used_at as Date | null } : null;
}

export async function revokeCalendarFeed(sql: Sql, userId: string) {
	await sql`delete from calendar_feeds where user_id = ${userId}`;
}

/** ICS mit gemerkten Terminen (und Fristen gemerkter Hinweise). Nur, was man selbst gemerkt hat. */
export async function feedIcs(sql: Sql, token: string): Promise<string | null> {
	if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
	const [f] = await sql`update calendar_feeds set last_used_at = now() where token_hash = ${sha256hex(token)} returning user_id`;
	if (!f) return null;
	const items = await merkliste(sql, f.user_id);
	const base = appUrl();
	const events: IcsEvent[] = [];
	for (const i of items) {
		if (i.kind === 'event' && i.when) events.push({ uid: `${i.id}-${i.occurrence ?? 'serie'}@kinder-deutschlands`, title: i.title, start: i.when, end: i.end, allDay: i.allDay, cancelled: i.cancelled, url: `${base}/veranstaltungen/${i.id}${i.occurrence ? `?am=${i.occurrence}` : ''}` });
		if (i.kind === 'event' && i.deadline && i.deadline.getTime() > Date.now()) events.push({ uid: `${i.id}-frist@kinder-deutschlands`, title: `Anmeldefrist: ${i.title}`, start: i.deadline, end: null, allDay: true, url: `${base}/veranstaltungen/${i.id}` });
		if (i.kind === 'notice' && i.deadline) events.push({ uid: `${i.id}-frist@kinder-deutschlands`, title: `Frist: ${i.title}`, start: i.deadline, end: null, allDay: true, url: `${base}/hinweise` });
	}
	return buildIcs(events, 'Kinder Deutschlands – Merkliste');
}
