// Event-Chat zu „Wer kommt mit?“ (M12): je Termin-Tag ein Ende-zu-Ende-verschlüsselter Raum mit Ablauf.
// Anlegen und beitreten dürfen nur Personen, die für diesen Tag „Ich komme“/„Interessiert“ gesagt haben
// (oder den Termin pflegen). Gelöscht wird der Raum einen Tag nach dem Termin (wie Treffen, D-039).
import type { Sql } from '../db';
import { PostError } from '../community/posts';
import { getEvent } from './events';

async function occurrenceOf(sql: Sql, userId: string, eventId: string, occurrence: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrence)) throw new PostError('Ungültiges Datum.');
	const d = await getEvent(sql, { id: userId }, eventId, null);
	if (!d || d.needsLogin) throw new PostError('Termin nicht gefunden.');
	const o = d.occurrences.find((x) => x.date === occurrence);
	if (!o || o.cancelled || d.event.status !== 'aktiv') throw new PostError('An diesem Tag findet der Termin nicht statt.');
	const [a] = await sql`select status from event_attendance where event_id = ${eventId} and user_id = ${userId} and occurrence = ${occurrence}`;
	if (!a && !d.editor) throw new PostError('Bitte zuerst „Ich komme“ oder „Interessiert“ wählen.');
	return { title: d.event.title, end: o.end ?? new Date(o.start.getTime() + 3 * 3600_000) };
}

export async function eventChat(sql: Sql, eventId: string, occurrence: string): Promise<string | null> {
	const [r] = await sql`select c.room_id from event_chats c join chat_rooms r on r.room_id = c.room_id and r.status = 'aktiv'
		where c.event_id = ${eventId} and c.occurrence = ${occurrence}`;
	return (r?.room_id as string) ?? null;
}

/** Den im Browser angelegten Raum als Event-Chat anmelden. Gibt es schon einen, gilt der bestehende. */
export async function attachEventChat(sql: Sql, userId: string, eventId: string, occurrence: string, roomId: string) {
	const o = await occurrenceOf(sql, userId, eventId, occurrence);
	const existing = await eventChat(sql, eventId, occurrence);
	if (existing) throw new PostError('Es gibt schon einen Chat für diesen Tag – bitte die Seite neu laden.');
	const { registerTimedRoom } = await import('../chat/rooms');
	await registerTimedRoom(sql, userId, roomId, new Date(o.end.getTime() + 86_400_000));
	await sql`insert into event_chats (event_id, occurrence, room_id, created_by) values (${eventId}, ${occurrence}, ${roomId}, ${userId})`;
}

export async function eventChatTicket(sql: Sql, userId: string, eventId: string, occurrence: string): Promise<string> {
	await occurrenceOf(sql, userId, eventId, occurrence);
	const roomId = await eventChat(sql, eventId, occurrence);
	if (!roomId) throw new PostError('Für diesen Tag gibt es noch keinen Chat.');
	const { grantTicket } = await import('../chat/rooms');
	await grantTicket(sql, userId, roomId);
	return roomId;
}
