// Plattformregeln für den Chat – vom Regelmodul im Chat-Server bei jeder Einladung, jedem Beitritt ohne Einladung
// und (zwischengespeichert) beim Senden abgefragt. Inhalte sieht diese Prüfung nie, nur Absender und Raum.
import type { Sql } from '../db';
import { areContacts, isBlockedEither } from '../profiles';
import { mutedUntil } from '../community/posts';
import { userByMxid } from './synapse';

export type CheckRequest =
	| { action: 'invite'; inviter: string; invitee: string; room: string }
	| { action: 'join'; user: string; room: string; invited: boolean }
	| { action: 'send'; user: string; room: string };

export async function checkRule(sql: Sql, r: CheckRequest): Promise<{ allow: boolean; why?: string }> {
	if (r.action === 'invite') {
		const [a, b] = await Promise.all([userByMxid(sql, r.inviter), userByMxid(sql, r.invitee)]);
		if (!a || !b || a.status !== 'active' || b.status !== 'active') return { allow: false, why: 'konto' };
		const [room] = await sql`select kind, status, dm_a, dm_b from chat_rooms where room_id = ${r.room}`;
		if (room?.status && room.status !== 'aktiv') return { allow: false, why: 'beendet' };
		// Direktchat: nur die zwei Beteiligten
		if (room?.kind === 'direkt' && ![room.dm_a, room.dm_b].includes(b.id)) return { allow: false, why: 'direkt' };
		if (await isBlockedEither(sql, a.id, b.id)) return { allow: false, why: 'blockiert' };
		if (!(await areContacts(sql, a.id, b.id))) return { allow: false, why: 'kein_kontakt' };
		return { allow: true };
	}
	if (r.action === 'join') {
		const u = await userByMxid(sql, r.user);
		if (!u || u.status !== 'active') return { allow: false, why: 'konto' };
		const [room] = await sql`select kind, status, expires_at from chat_rooms where room_id = ${r.room}`;
		if (room && room.status !== 'aktiv') return { allow: false, why: 'beendet' };
		// Eingeladen: Die Einladung wurde schon geprüft
		if (r.invited) return { allow: true };
		// Ohne Einladung nur in Treffen mit gültigem QR-Ticket
		if (room?.kind !== 'treffen' || (room.expires_at && new Date(room.expires_at) < new Date())) return { allow: false, why: 'kein_treffen' };
		const [t] = await sql`select 1 as x from chat_join_tickets where user_id = ${u.id} and room_id = ${r.room} and expires_at > now()`;
		return t ? { allow: true } : { allow: false, why: 'kein_ticket' };
	}
	// send
	const u = await userByMxid(sql, r.user);
	if (!u || u.status !== 'active') return { allow: false, why: 'konto' };
	const [room] = await sql`select kind, status, expires_at, dm_a, dm_b from chat_rooms where room_id = ${r.room}`;
	if (room) {
		if (room.status !== 'aktiv' || (room.expires_at && new Date(room.expires_at) < new Date())) return { allow: false, why: 'beendet' };
		if (room.kind === 'direkt') {
			const other = room.dm_a === u.id ? room.dm_b : room.dm_a;
			if (await isBlockedEither(sql, u.id, other)) return { allow: false, why: 'blockiert' };
			// Direktchats mit bestätigten Kontakten bleiben auch bei einer Moderations-Einschränkung möglich (D-036)
			return { allow: true };
		}
	}
	// Gruppen und Treffen: Einschränkung durch die Moderation gilt auch hier
	if (await mutedUntil(sql, u.id)) return { allow: false, why: 'eingeschraenkt' };
	return { allow: true };
}
