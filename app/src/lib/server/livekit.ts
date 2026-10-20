// Gruppenanrufe (M02, D-072): eigener Medienserver LiveKit im Stack. Er leitet nur verschlüsselte Medienpakete weiter –
// Bild und Ton sind zusätzlich Ende-zu-Ende-verschlüsselt (Schlüssel nur in den Browsern, verteilt über den
// verschlüsselten Chat). Die App entscheidet, wer teilnehmen darf: nur Mitglieder der Gruppe bzw. des Treffens.
import { createHmac, randomBytes } from 'node:crypto';
import type { Sql } from './db';
import { ChatError, chatSecret, ensureAccount, listDevices, mxid } from './chat/synapse';
import { isMember } from './chat/rooms';
import { mutedUntil } from './community/posts';
import { rateLimit } from './ratelimit';

const env = process.env;
export const LIVEKIT_KEY = 'kd-app';
/** Gültigkeit des Beitritts-Tokens. Danach verlängert LiveKit die Verbindung selbst. Kurz, weil es in der URL steht. */
export const JOIN_TTL = 60;

export function livekitEnabled(): boolean {
	return (env.LIVEKIT_ENABLED ?? 'true') !== 'false' && !!env.LIVEKIT_URL;
}
const lkUrl = () => (env.LIVEKIT_URL || '').replace(/\/$/, '');

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** LiveKit-Zugangstoken (JWT, HS256) mit genau den nötigen Rechten. */
export function livekitJwt(claims: Record<string, unknown>, seconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const h = b64({ alg: 'HS256', typ: 'JWT' });
	const p = b64({ iss: LIVEKIT_KEY, nbf: now - 5, exp: now + seconds, ...claims });
	return `${h}.${p}.${createHmac('sha256', chatSecret('livekit')).update(`${h}.${p}`).digest('base64url')}`;
}

/** Raumname bei LiveKit: nicht die Chat-Raumkennung, sondern ein daraus abgeleiteter Wert. */
export function callRoomName(roomId: string): string {
	return 'kd-' + createHmac('sha256', chatSecret('livekit-room')).update(roomId).digest('hex').slice(0, 32);
}

async function twirp<T>(method: string, body: Record<string, unknown>, video: Record<string, unknown>): Promise<T> {
	const r = await fetch(`${lkUrl()}/twirp/livekit.RoomService/${method}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${livekitJwt({ video }, 60)}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(8000)
	});
	if (!r.ok) throw new Error(`LiveKit ${method}: HTTP ${r.status}`);
	return (await r.json()) as T;
}

interface LkRoom {
	name: string;
	metadata?: string;
	num_participants?: number;
	numParticipants?: number;
}
const count = (r: LkRoom | null) => Number(r?.num_participants ?? r?.numParticipants ?? 0);

async function roomState(name: string): Promise<LkRoom | null> {
	const r = await twirp<{ rooms?: LkRoom[] }>('ListRooms', { names: [name] }, { roomList: true });
	return r.rooms?.find((x) => x.name === name) ?? null;
}

/** Kurz gemerkte neue Anrufe: wer kurz nach dem Start beitritt (bevor jemand verbunden ist), bekommt dieselbe Kennung. */
const pending = new Map<string, { callId: string; at: number }>();

/** Wer darf hier einen Gruppenanruf starten oder beitreten? Gibt die Raumart zurück. */
async function checkAccess(sql: Sql, userId: string, roomId: string) {
	const [room] = await sql`select kind, status, expires_at from chat_rooms where room_id = ${roomId}`;
	if (!room || !['gruppe', 'treffen'].includes(room.kind)) throw new ChatError('Gruppenanrufe gibt es nur in Gruppen und Treffen.');
	if (room.status !== 'aktiv' || (room.expires_at && new Date(room.expires_at) < new Date())) throw new ChatError('Dieses Treffen ist beendet.');
	if (!(await isMember(sql, userId, roomId))) throw new ChatError('Du bist nicht Mitglied dieser Unterhaltung.');
	if (await mutedUntil(sql, userId)) throw new ChatError('Dein Konto ist von der Moderation eingeschränkt.');
}

export interface CallJoin {
	url: string;
	token: string;
	identity: string;
	callId: string;
	fresh: boolean;
}

/** Beitritt: prüft Mitgliedschaft und Gerät, legt den LiveKit-Raum bei Bedarf an und stellt ein kurzlebiges Token aus. */
export async function joinCall(sql: Sql, userId: string, roomId: string, deviceId: string): Promise<CallJoin> {
	if (!livekitEnabled()) throw new ChatError('Gruppenanrufe sind auf diesem Server nicht eingerichtet.');
	if (!/^[A-Za-z0-9_-]{4,64}$/.test(deviceId)) throw new ChatError('Ungültiges Gerät.');
	if (!rateLimit(`call:${userId}`, 20, 10 * 60_000)) throw new ChatError('Zu viele Versuche. Bitte kurz warten.');
	await checkAccess(sql, userId, roomId);
	const lp = await ensureAccount(sql, userId);
	// Das Gerät muss zum Konto gehören – nur dann schicken die anderen ihm den Schlüssel
	if (!(await listDevices(sql, lp)).some((d) => d.id === deviceId)) throw new ChatError('Dieses Gerät ist im Chat nicht angemeldet. Bitte Seite neu laden.');
	const name = callRoomName(roomId);
	let state = await roomState(name);
	let callId = '';
	let fresh = false;
	if (state && count(state) > 0 && state.metadata) callId = state.metadata;
	else {
		const p = pending.get(name);
		if (p && Date.now() - p.at < 60_000) callId = p.callId;
		else {
			callId = randomBytes(12).toString('base64url');
			fresh = true;
			pending.set(name, { callId, at: Date.now() });
		}
	}
	if (!state) state = await twirp<LkRoom>('CreateRoom', { name, metadata: callId, empty_timeout: 120, departure_timeout: 20 }, { roomCreate: true });
	if (state.metadata !== callId) await twirp('UpdateRoomMetadata', { room: name, metadata: callId }, { roomAdmin: true, room: name });
	for (const [k, v] of pending) if (Date.now() - v.at > 120_000) pending.delete(k);
	const identity = `${mxid(lp)}|${deviceId}`;
	const token = livekitJwt(
		{ sub: identity, video: { room: name, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false } },
		JOIN_TTL
	);
	return { url: '/livekit', token, identity, callId, fresh };
}

/** Läuft gerade ein Anruf, und wie viele sind dabei? (Nur für Mitglieder.) */
export async function callStatus(sql: Sql, userId: string, roomId: string): Promise<{ enabled: boolean; active: boolean; count: number }> {
	if (!livekitEnabled()) return { enabled: false, active: false, count: 0 };
	await checkAccess(sql, userId, roomId);
	const n = count(await roomState(callRoomName(roomId)).catch(() => null));
	return { enabled: true, active: n > 0, count: n };
}

/** Treffen beendet oder abgelaufen: laufenden Anruf sofort beenden. */
export async function endCall(roomId: string): Promise<void> {
	if (!livekitEnabled()) return;
	const room = callRoomName(roomId);
	try {
		await twirp('DeleteRoom', { room }, { roomCreate: true });
	} catch {
		/* kein laufender Anruf */
	}
}
