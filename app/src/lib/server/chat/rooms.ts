// Räume aus Sicht der App: Direktchats (einer je Kontaktpaar), Gruppen, Treffen mit Ablauf und QR-Beitritt (M06).
// Angelegt werden Räume im Browser (verschlüsselt); die App prüft danach über die Admin-Schnittstelle, ob es stimmt.
import type { Sql } from '../db';
import { randomToken, sha256hex } from '../crypto';
import { audit } from '../audit';
import { areContacts, isBlockedEither } from '../profiles';
import { ChatError, deleteRoom, ensureAccount, listDevices, mxid, roomInfo, roomMembers } from './synapse';
import { notify } from '../community/posts';
import { rateLimit } from '../ratelimit';

// Raumversion 12: Kennung ohne Servernamen; ältere Versionen mit „:kinder-deutschlands“
const ROOM_ID = /^![A-Za-z0-9._~+/=-]{5,255}(:kinder-deutschlands)?$/;
export const TREFFEN_HOURS = [2, 6, 24, 72, 168] as const;

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

async function ownRoom(sql: Sql, userId: string, roomId: string) {
	if (!ROOM_ID.test(roomId)) throw new ChatError('Ungültiger Raum.');
	const lp = await ensureAccount(sql, userId);
	const info = await roomInfo(sql, roomId);
	if (!info || info.creator !== mxid(lp)) throw new ChatError('Raum nicht gefunden.');
	if (!info.encrypted) throw new ChatError('Raum ist nicht verschlüsselt.');
	return info;
}

/** Bestehender Direktchat mit einem Kontakt (oder null). */
export async function directRoom(sql: Sql, userId: string, peerId: string): Promise<string | null> {
	const [a, b] = pair(userId, peerId);
	const [r] = await sql`select room_id from chat_rooms where kind = 'direkt' and status = 'aktiv' and dm_a = ${a} and dm_b = ${b}`;
	return (r?.room_id as string) ?? null;
}

/** Direktchat registrieren. Gibt es schon einen aktiven, gilt der bestehende. */
export async function registerDirect(sql: Sql, userId: string, peerId: string, roomId: string): Promise<{ roomId: string; existing: boolean }> {
	if (await isBlockedEither(sql, userId, peerId)) throw new ChatError('Mit dieser Familie ist kein Chat möglich.');
	if (!(await areContacts(sql, userId, peerId))) throw new ChatError('Chats sind nur mit bestätigten Kontakten möglich.');
	const existing = await directRoom(sql, userId, peerId);
	if (existing && existing !== roomId) return { roomId: existing, existing: true };
	await ownRoom(sql, userId, roomId);
	const [a, b] = pair(userId, peerId);
	await sql`insert into chat_rooms (room_id, kind, created_by, dm_a, dm_b) values (${roomId}, 'direkt', ${userId}, ${a}, ${b}) on conflict (room_id) do nothing`;
	await nudge(sql, userId, peerId).catch(() => {});
	return { roomId, existing: false };
}

/**
 * Hat das Gegenüber den Chat noch auf keinem Gerät geöffnet, gibt es keine Schlüssel, für die verschlüsselt werden kann.
 * Dann bekommt es einen Hinweis (Mitteilung, bei Wunsch Push) – höchstens einmal pro Stunde je Paar.
 */
export async function nudge(sql: Sql, fromId: string, toId: string): Promise<boolean> {
	if (!(await areContacts(sql, fromId, toId)) || (await isBlockedEither(sql, fromId, toId))) throw new ChatError('Nur für bestätigte Kontakte.');
	const lp = await ensureAccount(sql, toId);
	if ((await listDevices(sql, lp)).length > 0) return false;
	if (!rateLimit(`nudge:${fromId}:${toId}`, 1, 3600_000)) return false;
	const [p] = await sql`select display_name, visibility from user_profiles where user_id = ${fromId}`;
	const name = p?.display_name && p.visibility?.display_name !== 'niemand' ? p.display_name : 'Ein Kontakt';
	await notify(sql, toId, 'chat', `${name} möchte dir schreiben. Öffne einmal „Nachrichten“, damit verschlüsselte Nachrichten bei dir ankommen können.`, '/nachrichten');
	return true;
}

/** Der bisherige Direktchat ist unbrauchbar (z. B. Gegenüber hat ihn verlassen) – neuen zulassen. */
export async function retireDirect(sql: Sql, userId: string, roomId: string) {
	await sql`update chat_rooms set status = 'abgelaufen', ended_at = now() where room_id = ${roomId} and kind = 'direkt' and status = 'aktiv' and (dm_a = ${userId} or dm_b = ${userId})`;
}

export async function registerGroup(sql: Sql, userId: string, roomId: string) {
	await ownRoom(sql, userId, roomId);
	await sql`insert into chat_rooms (room_id, kind, created_by) values (${roomId}, 'gruppe', ${userId}) on conflict (room_id) do nothing`;
}

/** Treffen: Raum mit Ablauf und QR-Beitritt. Liefert das Token für den QR-Code (nur hier im Klartext). */
export async function registerTreffen(sql: Sql, userId: string, roomId: string, hours: number): Promise<string> {
	if (!(TREFFEN_HOURS as readonly number[]).includes(hours)) throw new ChatError('Bitte eine Dauer auswählen.');
	const info = await ownRoom(sql, userId, roomId);
	if (info.joinRules !== 'public') throw new ChatError('Treffen-Räume brauchen Beitritt per Link.');
	const [{ n }] = await sql`select count(*)::int as n from chat_rooms where created_by = ${userId} and kind = 'treffen' and created_at > now() - interval '1 day'`;
	if (n >= 20) throw new ChatError('Heute schon viele Treffen angelegt. Bitte morgen weitermachen.');
	const token = randomToken(18);
	await sql`insert into chat_rooms (room_id, kind, created_by, expires_at, join_token_hash)
		values (${roomId}, 'treffen', ${userId}, now() + make_interval(hours => ${hours}), ${sha256hex(token)})`;
	await audit(sql, { actorId: userId, action: 'chat.treffen.created', targetType: 'room', targetId: roomId, meta: { hours } });
	return token;
}

/** Neues QR-Token (altes wird ungültig) – nur durch die Person, die das Treffen angelegt hat. */
export async function renewToken(sql: Sql, userId: string, roomId: string): Promise<string> {
	const token = randomToken(18);
	const [r] = await sql`update chat_rooms set join_token_hash = ${sha256hex(token)} where room_id = ${roomId} and created_by = ${userId} and kind = 'treffen' and status = 'aktiv' returning room_id`;
	if (!r) throw new ChatError('Treffen nicht gefunden.');
	return token;
}

export async function treffenByToken(sql: Sql, token: string) {
	if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
	const [r] = await sql`select room_id, created_by, expires_at, status from chat_rooms where join_token_hash = ${sha256hex(token)} and kind = 'treffen'`;
	if (!r || r.status !== 'aktiv' || (r.expires_at && new Date(r.expires_at) < new Date())) return null;
	const info = await roomInfo(sql, r.room_id);
	if (!info) return null;
	return { roomId: r.room_id as string, createdBy: r.created_by as string | null, expiresAt: r.expires_at as Date, name: info.name, members: info.members };
}

/** Ticket für den Beitritt (10 Minuten). Danach tritt der Browser selbst bei; das Regelmodul prüft das Ticket. */
export async function ticket(sql: Sql, userId: string, token: string): Promise<string> {
	const t = await treffenByToken(sql, token);
	if (!t) throw new ChatError('Dieses Treffen gibt es nicht mehr.');
	if (t.createdBy && (await isBlockedEither(sql, userId, t.createdBy))) throw new ChatError('Dieses Treffen gibt es nicht mehr.');
	if (t.members >= 50) throw new ChatError('Das Treffen ist voll (50 Personen).');
	await ensureAccount(sql, userId);
	await sql`insert into chat_join_tickets (user_id, room_id, expires_at) values (${userId}, ${t.roomId}, now() + interval '10 minutes')
		on conflict (user_id, room_id) do update set expires_at = excluded.expires_at`;
	return t.roomId;
}

/** Treffen dauerhaft behalten: wird zur Gruppe, QR-Beitritt endet. */
export async function keepTreffen(sql: Sql, userId: string, roomId: string) {
	const [r] = await sql`update chat_rooms set kind = 'gruppe', expires_at = null, join_token_hash = null
		where room_id = ${roomId} and created_by = ${userId} and kind = 'treffen' and status = 'aktiv' returning room_id`;
	if (!r) throw new ChatError('Treffen nicht gefunden.');
	await sql`delete from chat_join_tickets where room_id = ${roomId}`;
	await audit(sql, { actorId: userId, action: 'chat.treffen.kept', targetType: 'room', targetId: roomId });
}

/** Treffen sofort beenden: Raum mit allen Nachrichten vom Server löschen. */
export async function endTreffen(sql: Sql, userId: string, roomId: string) {
	const [r] = await sql`select room_id from chat_rooms where room_id = ${roomId} and created_by = ${userId} and kind = 'treffen' and status = 'aktiv'`;
	if (!r) throw new ChatError('Treffen nicht gefunden.');
	await deleteRoom(sql, roomId);
	await sql`update chat_rooms set status = 'geloescht', ended_at = now(), join_token_hash = null where room_id = ${roomId}`;
	await audit(sql, { actorId: userId, action: 'chat.treffen.ended', targetType: 'room', targetId: roomId });
}

/** Zeitplan: abgelaufene Treffen löschen (Raum und Nachrichten auf dem Server). */
export async function expireTreffen(sql: Sql): Promise<number> {
	const due = await sql`select room_id from chat_rooms where kind = 'treffen' and status = 'aktiv' and expires_at < now() limit 50`;
	let n = 0;
	for (const r of due) {
		try {
			await deleteRoom(sql, r.room_id);
			await sql`update chat_rooms set status = 'abgelaufen', ended_at = now(), join_token_hash = null where room_id = ${r.room_id}`;
			n++;
		} catch (e) {
			console.error('[chat] Treffen konnte nicht gelöscht werden:', (e as Error).message);
		}
	}
	await sql`delete from chat_join_tickets where expires_at < now()`;
	return n;
}

/** Zusatzangaben zu Räumen für die Chatliste (nur Räume, in denen die Person Mitglied ist). */
export async function roomMeta(sql: Sql, userId: string, roomIds: string[]) {
	const ids = roomIds.filter((x) => ROOM_ID.test(x)).slice(0, 300);
	if (!ids.length) return [];
	const rows = await sql`select r.room_id, r.kind, r.created_by, r.expires_at, r.status, p.contact_id as peer
		from chat_rooms r left join user_profiles p on r.kind = 'direkt' and (r.dm_a = ${userId} or r.dm_b = ${userId})
			and p.user_id = case when r.dm_a = ${userId} then r.dm_b else r.dm_a end
		where r.room_id = any(${ids}) and (r.kind <> 'direkt' or r.dm_a = ${userId} or r.dm_b = ${userId})`;
	return rows.map((r) => ({
		roomId: r.room_id as string,
		kind: r.kind as string,
		mine: r.created_by === userId,
		peerContactId: (r.peer as string | null) ?? null,
		expiresAt: r.expires_at as Date | null,
		status: r.status as string
	}));
}

export async function isMember(sql: Sql, userId: string, roomId: string): Promise<boolean> {
	const [a] = await sql`select localpart from chat_accounts where user_id = ${userId}`;
	if (!a) return false;
	return (await roomMembers(sql, roomId)).includes(mxid(a.localpart));
}
