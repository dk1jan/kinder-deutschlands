// Feedback aus der Fußzeile (F-052): Mitglieder melden Fehler, Korrekturen oder allgemeines Feedback.
// Nur angemeldet, Rate-Limit pro Person, nur Seitenpfad (keine Geräte-/IP-Daten). Die Verwaltung bearbeitet
// mit Status; das Mitglied bekommt eine neutrale Mitteilung (wie F-036).
import type { Sql } from './db';
import { audit } from './audit';
import { notify } from './community/posts';

import { FEEDBACK_KINDS, FEEDBACK_STATUS, type FeedbackKind, type FeedbackStatus } from '../feedback';
export { FEEDBACK_KINDS, FEEDBACK_STATUS };
export type { FeedbackKind, FeedbackStatus };

export class FeedbackError extends Error {}

/** Nur ein interner Pfad, ohne Suchparameter und Sprungmarke; alles andere wird verworfen. */
export function cleanPage(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const s = raw.trim().split(/[?#]/)[0];
	if (!s.startsWith('/') || s.startsWith('//') || s.length > 200 || /[\s<>"'\\]/.test(s)) return null;
	return s;
}

export async function submitFeedback(sql: Sql, userId: string, input: { kind: unknown; body: unknown; page?: unknown }): Promise<string> {
	const kind = String(input.kind ?? '');
	if (!(kind in FEEDBACK_KINDS)) throw new FeedbackError('Bitte wähle aus, worum es geht.');
	const body = String(input.body ?? '').replace(/\r/g, '').trim();
	if (body.length < 5) throw new FeedbackError('Bitte schreib kurz, worum es geht (mindestens 5 Zeichen).');
	if (body.length > 2000) throw new FeedbackError('Bitte höchstens 2000 Zeichen.');
	const [{ n }] = await sql`select count(*)::int as n from feedback where user_id = ${userId} and created_at > now() - interval '1 day'`;
	if (n >= 10) throw new FeedbackError('Du hast heute schon viel Feedback geschickt – danke! Bitte morgen weitermachen.');
	const [row] = await sql`insert into feedback (user_id, kind, body, page) values (${userId}, ${kind}, ${body}, ${cleanPage(input.page)}) returning id`;
	await audit(sql, { actorId: userId, action: 'feedback.submitted', targetType: 'feedback', targetId: row.id as string, meta: { kind, chars: body.length } });
	return row.id as string;
}

export async function listFeedback(sql: Sql, filter: { status?: string; kind?: string } = {}) {
	const status = filter.status && filter.status in FEEDBACK_STATUS ? filter.status : null;
	const kind = filter.kind && filter.kind in FEEDBACK_KINDS ? filter.kind : null;
	const rows = await sql`select f.id, f.kind, f.body, f.page, f.status, f.reply, f.handled_at, f.created_at, p.contact_id
		from feedback f left join user_profiles p on p.user_id = f.user_id
		where (${status}::text is null or f.status = ${status}) and (${kind}::text is null or f.kind = ${kind})
		order by (f.status in ('offen', 'in_arbeit')) desc, f.created_at desc limit 200`;
	return rows.map((r) => ({
		id: r.id as string,
		kind: r.kind as FeedbackKind,
		body: r.body as string,
		page: (r.page as string | null) ?? null,
		status: r.status as FeedbackStatus,
		reply: (r.reply as string | null) ?? null,
		handledAt: (r.handled_at as Date | null) ?? null,
		createdAt: r.created_at as Date,
		from: (r.contact_id as string | null) ? `${(r.contact_id as string).slice(0, 3)}-${(r.contact_id as string).slice(3, 6)}-${(r.contact_id as string).slice(6)}` : null
	}));
}

export async function openFeedbackCount(sql: Sql): Promise<number> {
	const [{ n }] = await sql`select count(*)::int as n from feedback where status in ('offen', 'in_arbeit')`;
	return n as number;
}

/** Status setzen; bei „erledigt“/„verworfen“ bekommt die Person eine neutrale Mitteilung (gleicher Dank in beiden Fällen). */
export async function handleFeedback(sql: Sql, actorId: string, id: string, input: { status: unknown; reply?: unknown }) {
	const status = String(input.status ?? '');
	if (!(status in FEEDBACK_STATUS)) throw new FeedbackError('Ungültiger Status.');
	const reply = String(input.reply ?? '').replace(/\r/g, '').trim().slice(0, 500) || null;
	const [row] = await sql`update feedback set status = ${status}, reply = ${reply}, handled_by = ${actorId}, handled_at = now() where id = ${id} returning user_id`;
	if (!row) throw new FeedbackError('Dieses Feedback gibt es nicht mehr.');
	await audit(sql, { actorId, action: 'feedback.handled', targetType: 'feedback', targetId: id, meta: { status } });
	if ((status === 'erledigt' || status === 'verworfen') && row.user_id) {
		const text = reply ? `Danke für dein Feedback! Antwort der Verwaltung: ${reply}` : 'Danke für dein Feedback! Wir haben es gelesen und bearbeitet.';
		await notify(sql, row.user_id as string, 'verwaltung', text, '/profil/mitteilungen', { noPush: true });
	}
}
