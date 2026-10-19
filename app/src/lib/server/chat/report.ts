// Melden aus einem verschlüsselten Chat (M02/M24). Der Server kann Nachrichten nicht lesen – die meldende Person gibt
// die gemeldete Nachricht (und auf Wunsch wenige vorherige als Zusammenhang) ausdrücklich frei. Absender und Zeitpunkt
// werden über den Chat-Server bestätigt; den Wortlaut kann niemand technisch prüfen – das sieht die Moderation so.
import type { Sql } from '../db';
import { REPORT_REASONS } from '../community/moderation';
import { PostError } from '../community/posts';
import { eventInfo, userByMxid, roomMembers, mxidOf } from './synapse';

export interface ChatReportInput {
	roomId: string;
	eventId: string;
	reason: string;
	message: string | null;
	messages: { eventId: string; senderName: string; ts: number; body: string }[];
}

const clean = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);

export async function reportChat(sql: Sql, reporterId: string, r: ChatReportInput) {
	if (!(REPORT_REASONS as readonly string[]).includes(r.reason)) throw new PostError('Bitte einen Grund wählen.');
	if (!/^\$[A-Za-z0-9_\-+/=]{10,255}$/.test(r.eventId) || !/^![A-Za-z0-9._~+/=-]{5,255}(:kinder-deutschlands)?$/.test(r.roomId)) throw new PostError('Nachricht nicht gefunden.');
	const me = await mxidOf(sql, reporterId);
	if (!me || !(await roomMembers(sql, r.roomId)).includes(me)) throw new PostError('Nachricht nicht gefunden.');
	const ev = await eventInfo(sql, r.roomId, r.eventId);
	if (!ev) throw new PostError('Nachricht nicht gefunden.');
	if (ev.sender === me) throw new PostError('Eigene Nachrichten kannst du selbst löschen.');
	const sender = await userByMxid(sql, ev.sender);
	if (!sender) throw new PostError('Absender nicht zuzuordnen.');
	const msgs = r.messages.slice(-6).map((m) => ({
		eventId: clean(m.eventId, 260),
		senderName: clean(m.senderName, 80),
		ts: Number(m.ts) || 0,
		body: clean(m.body, 2000),
		reported: m.eventId === r.eventId
	}));
	if (!msgs.some((m) => m.reported && m.body.trim())) throw new PostError('Die gemeldete Nachricht fehlt.');
	const [dup] = await sql`select 1 as x from mod_cases where target_type = 'chat' and target_id = ${r.eventId} and reporter_id = ${reporterId} and status in ('offen', 'in_arbeit')`;
	if (dup) return;
	const [room] = await sql`select kind from chat_rooms where room_id = ${r.roomId}`;
	const prio = r.reason === 'drohung' || r.reason === 'kinderfoto' ? 1 : r.reason === 'spam' ? 3 : 2;
	const evidence = {
		sender_user: sender.id,
		room_kind: room?.kind ?? 'unbekannt',
		server: { sender_confirmed: true, ts: ev.ts },
		messages: msgs
	};
	await sql`insert into mod_cases (target_type, target_id, source, reason, message, reporter_id, priority, evidence)
		values ('chat', ${r.eventId}, 'meldung', ${r.reason}, ${r.message?.slice(0, 500) ?? null}, ${reporterId}, ${prio}, ${sql.json(evidence)})`;
}
