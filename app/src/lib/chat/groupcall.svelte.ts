// Gruppenanrufe (M02, D-072) – „wie Zoom“ in Gruppen und Treffen. Medien laufen über den eigenen Medienserver
// (LiveKit), sind aber zusätzlich Ende-zu-Ende-verschlüsselt: Der Schlüssel entsteht im Browser der Person, die den
// Anruf startet, und wird nur über den verschlüsselten Chat (Olm, an einzelne Geräte) an Mitglieder weitergegeben,
// die gerade beitreten. Der Medienserver und die App sehen ihn nie. Kein Mitschnitt.
import type { MatrixClient, Room as MatrixRoom } from 'matrix-js-sdk';
import type { LocalParticipant, Participant, RemoteParticipant, Room, Track, TrackPublication } from 'livekit-client';
import { api, contactByMxid, formatCid, getClient } from './client.svelte';
import { busy, call } from './calls.svelte';

/** Raumereignis „Anruf gestartet“ (verschlüsselt im Verlauf, löst die normale Benachrichtigung aus). */
export const CALL_EVENT = 'de.kinder.call';
/** Schlüssel an ein einzelnes Gerät (Olm, nicht im Verlauf). */
const KEY_EVENT = 'de.kinder.call.key';
/** Nachfrage nach dem Schlüssel (Olm), falls er nicht ankam. */
const KEY_REQUEST = 'de.kinder.call.key_request';
/** Zustellung über den Chat dauert je nach Gerät und Netz einige Sekunden – großzügig warten, zwischendurch nachfragen. */
const KEY_WAIT_MS = 60_000;
const KEY_ASK_MS = [4000, 12_000, 22_000, 34_000, 47_000];

export type GroupView = 'aus' | 'verbindet' | 'schluessel' | 'verbunden' | 'beendet';

export interface Tile {
	id: string;
	name: string;
	local: boolean;
	camera: Track | null;
	screen: Track | null;
	micOff: boolean;
	speaking: boolean;
}

export const group = $state({
	view: 'aus' as GroupView,
	roomId: '',
	title: '',
	video: false,
	muted: false,
	camOff: true,
	sharing: false,
	small: false,
	needsAudio: false,
	startedAt: 0,
	reason: '',
	count: 0
});
/** LiveKit-Objekte nicht tief beobachten (raw), nur austauschen. */
let tileState = $state.raw<{ list: Tile[]; audio: { id: string; track: Track }[] }>({ list: [], audio: [] });
export function currentTiles() {
	return tileState;
}

interface Session {
	roomId: string;
	callId: string;
	room: Room;
	worker: Worker;
	keyProvider: { setKey(k: ArrayBuffer): Promise<void> };
	key: Uint8Array | null;
	keyPending: boolean;
	gotKey: (() => void) | null;
	ended: boolean;
}
let s: Session | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let lk: typeof import('livekit-client') | null = null;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function groupCallsSupported(): boolean {
	return typeof window !== 'undefined' && 'RTCPeerConnection' in window && !!navigator.mediaDevices?.getUserMedia && typeof Worker !== 'undefined';
}
export function screenShareSupported(): boolean {
	return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent);
}

function matrixRoom(): MatrixRoom | null {
	return (s && getClient()?.getRoom(s.roomId)) ?? null;
}
function isJoinedMember(mxid: string): boolean {
	return matrixRoom()?.getMember(mxid)?.membership === 'join';
}
function splitIdentity(identity: string): { userId: string; deviceId: string } | null {
	const i = identity.lastIndexOf('|');
	if (i < 1) return null;
	return { userId: identity.slice(0, i), deviceId: identity.slice(i + 1) };
}
function nameOf(identity: string): string {
	const id = splitIdentity(identity)?.userId ?? identity;
	const c = contactByMxid(id);
	if (c) return c.name ?? `Familie ${formatCid(c.contactId)}`;
	const m = matrixRoom()?.getMember(id);
	return m?.name && !m.name.startsWith('@') ? m.name : 'Teilnehmer';
}

function rebuild() {
	if (!s || !lk) return;
	const { Track } = lk;
	const room = s.room;
	const speaking = new Set(room.activeSpeakers.map((p) => p.identity));
	const tileOf = (p: Participant, local: boolean): Tile => {
		const pubs = [...p.trackPublications.values()] as TrackPublication[];
		const cam = pubs.find((x) => x.source === Track.Source.Camera && x.track && !x.isMuted);
		const scr = pubs.find((x) => x.source === Track.Source.ScreenShare && x.track);
		const mic = pubs.find((x) => x.source === Track.Source.Microphone);
		return { id: p.identity, name: local ? 'Du' : nameOf(p.identity), local, camera: cam?.track ?? null, screen: scr?.track ?? null, micOff: !mic || mic.isMuted, speaking: speaking.has(p.identity) };
	};
	const remotes = [...room.remoteParticipants.values()] as RemoteParticipant[];
	const audio: { id: string; track: Track }[] = [];
	for (const p of remotes)
		for (const pub of p.trackPublications.values())
			if (pub.kind === Track.Kind.Audio && pub.track) audio.push({ id: `${p.identity}:${pub.trackSid}`, track: pub.track });
	tileState = { list: [tileOf(room.localParticipant as LocalParticipant, true), ...remotes.map((p) => tileOf(p, false))], audio };
	group.count = remotes.length + 1;
}

/** Schlüssel per Olm an genau ein Gerät schicken – nur an Mitglieder der Gruppe, die gerade im Anruf sind. */
async function sendKey(identity: string) {
	const c = getClient();
	const cur = s;
	if (!c || !cur?.key) return;
	const who = splitIdentity(identity);
	if (!who || (who.userId === c.getUserId() && who.deviceId === c.getDeviceId())) return;
	if (!isJoinedMember(who.userId)) return;
	const crypto = c.getCrypto();
	if (!crypto) return;
	try {
		await crypto.getUserDeviceInfo([who.userId], true);
		const batch = await crypto.encryptToDeviceMessages(KEY_EVENT, [who], { room_id: cur.roomId, call_id: cur.callId, key: b64(cur.key) });
		if (batch.batch.length) await c.queueToDevice(batch);
	} catch (e) {
		console.warn('Anrufschlüssel', (e as Error).message);
	}
}

type ToDevice = { message: { type: string; sender: string; content: Record<string, unknown> }; encryptionInfo: { sender: string; senderDevice?: string; senderCurve25519KeyBase64?: string } | null };

/** Absendergerät einer Olm-Nachricht: aus der Entschlüsselung oder – bei frisch angemeldetem Gerät – über dessen Schlüssel. */
async function senderIdentity(c: MatrixClient, m: ToDevice): Promise<string | null> {
	const info = m.encryptionInfo;
	if (!info || info.sender !== m.message.sender) return null;
	if (info.senderDevice) return `${info.sender}|${info.senderDevice}`;
	const ck = info.senderCurve25519KeyBase64;
	if (!ck) return null;
	const devs = (await c.getCrypto()?.getUserDeviceInfo([info.sender], true).catch(() => null))?.get(info.sender);
	for (const [id, d] of devs ?? []) if (d.getIdentityKey() === ck) return `${info.sender}|${id}`;
	return null;
}

/** Vom Chat-Client beim Start aufgerufen: Schlüssel für Gruppenanrufe empfangen und auf Nachfrage weitergeben. */
export function initGroupCalls(c: MatrixClient, sdk: typeof import('matrix-js-sdk')) {

	c.on(sdk.ClientEvent.ReceivedToDeviceMessage, (async (m: ToDevice) => {
		const t = m.message.type;
		if ((t !== KEY_EVENT && t !== KEY_REQUEST) || !s || !m.encryptionInfo) return;
		const cur = s;
		const k = m.message.content;
		if (k.room_id !== cur.roomId || k.call_id !== cur.callId) return;
		// Nur verschlüsselt (Olm), nur vom angegebenen Absender, nur von einem Gerät, das gerade im Anruf ist, nur Mitglieder
		const from = await senderIdentity(c, m);
		if (!from || s !== cur || !cur.room.remoteParticipants.has(from) || !isJoinedMember(m.message.sender)) return;
		if (t === KEY_REQUEST) {
			if (cur.key) void sendKey(from);
			return;
		}
		if (cur.key || cur.keyPending || typeof k.key !== 'string') return;
		const key = unb64(k.key);
		if (key.length !== 32) return;
		cur.keyPending = true;
		void cur.keyProvider.setKey(ab(key)).then(() => {
			cur.key = key;
			cur.gotKey?.();
		});
	}) as never);
}

/** Noch kein Schlüssel: bei allen, die schon im Anruf sind, nachfragen (falls die erste Übergabe verloren ging). */
async function requestKey(cur: Session) {
	const c = getClient();
	const crypto = c?.getCrypto();
	if (!c || !crypto || cur.key) return;
	const targets = [...cur.room.remoteParticipants.keys()].map(splitIdentity).filter((x): x is { userId: string; deviceId: string } => !!x && isJoinedMember(x.userId));
	if (!targets.length) return;
	try {
		await crypto.getUserDeviceInfo([...new Set(targets.map((x) => x.userId))], true);
		const batch = await crypto.encryptToDeviceMessages(KEY_REQUEST, targets, { room_id: cur.roomId, call_id: cur.callId });
		if (batch.batch.length) await c.queueToDevice(batch);
	} catch (e) {
		console.warn('Anrufschlüssel anfragen', (e as Error).message);
	}
}

function end(reason: string) {
	const cur = s;
	s = null;
	busy.group = false;
	if (cur && !cur.ended) {
		cur.ended = true;
		void cur.room.disconnect().catch(() => {});
		cur.worker.terminate();
	}
	tileState = { list: [], audio: [] };
	group.view = 'beendet';
	group.reason = reason;
	group.sharing = false;
	group.needsAudio = false;
	if (clearTimer) clearTimeout(clearTimer);
	clearTimer = setTimeout(() => {
		if (group.view === 'beendet') group.view = 'aus';
	}, 3500);
}

/** Gruppenanruf starten oder beitreten. */
export async function joinGroupCall(roomId: string, title: string, video: boolean): Promise<void> {
	if (s) throw new Error('Du bist schon in einem Gruppenanruf.');
	if (call.view !== 'aus') throw new Error('Es läuft schon ein Anruf.');
	if (!groupCallsSupported()) throw new Error('Dieser Browser unterstützt keine Gruppenanrufe.');
	const c = getClient();
	if (!c) throw new Error('Chat ist noch nicht bereit.');
	lk ??= await import('livekit-client');
	const { Room, RoomEvent, ExternalE2EEKeyProvider, isE2EESupported, VideoPresets, DisconnectReason } = lk;
	if (!isE2EESupported()) throw new Error('Dieser Browser kann Gruppenanrufe nicht Ende-zu-Ende-verschlüsseln. Bitte einen aktuellen Browser verwenden.');
	if (clearTimer) clearTimeout(clearTimer);
	Object.assign(group, { view: 'verbindet', roomId, title, video, muted: false, camOff: !video, sharing: false, small: false, needsAudio: false, startedAt: 0, reason: '', count: 0 });
	busy.group = true;
	let worker: Worker | null = null;
	try {
		const j = await api<{ url: string; token: string; identity: string; callId: string; fresh: boolean }>('/api/anruf', { json: { roomId, deviceId: c.getDeviceId() } });
		if (j.error) throw new Error(j.error);
		const E2EEWorker = (await import('livekit-client/e2ee-worker?worker')).default;
		worker = new E2EEWorker();
		const keyProvider = new ExternalE2EEKeyProvider();
		const room = new Room({
			adaptiveStream: true,
			dynacast: true,
			disconnectOnPageLeave: true,
			encryption: { keyProvider, worker },
			videoCaptureDefaults: { resolution: VideoPresets.h540.resolution },
			publishDefaults: { simulcast: true }
		});
		const cur: Session = { roomId, callId: j.callId, room, worker, keyProvider, key: null, keyPending: false, gotKey: null, ended: false };
		s = cur;
		const on = (ev: string, f: (...a: never[]) => void) => room.on(ev as never, f as never);
		on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
			void sendKey(p.identity);
			rebuild();
		});
		for (const ev of [RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished])
			on(ev, rebuild);
		on(RoomEvent.AudioPlaybackStatusChanged, () => (group.needsAudio = !room.canPlaybackAudio));
		on(RoomEvent.Reconnecting, () => (group.reason = 'Verbindung wird wiederhergestellt …'));
		on(RoomEvent.Reconnected, () => (group.reason = ''));
		// Kurz nach dem Beitritt normal (Bilder kommen an, bevor der Schlüssel da ist) – nur später anzeigen
		let encTimer: ReturnType<typeof setTimeout> | null = null;
		on(RoomEvent.EncryptionError, () => {
			if (group.view !== 'verbunden' || Date.now() - group.startedAt < 8000) return;
			group.reason = 'Ein Teil von Bild/Ton ließ sich nicht entschlüsseln.';
			if (encTimer) clearTimeout(encTimer);
			encTimer = setTimeout(() => group.reason === 'Ein Teil von Bild/Ton ließ sich nicht entschlüsseln.' && (group.reason = ''), 8000);
		});
		on(RoomEvent.Disconnected, (why?: number) => {
			if (s !== cur) return;
			const reasons: Record<number, string> = {
				[DisconnectReason.ROOM_DELETED]: 'Der Anruf wurde beendet.',
				[DisconnectReason.PARTICIPANT_REMOVED]: 'Du wurdest aus dem Anruf entfernt.',
				[DisconnectReason.DUPLICATE_IDENTITY]: 'Auf einem anderen Fenster beigetreten.',
				[DisconnectReason.JOIN_FAILURE]: 'Verbindung zum Anruf nicht möglich.'
			};
			end(reasons[why ?? 0] ?? 'Anruf beendet.');
		});
		if (j.fresh) {
			cur.key = crypto.getRandomValues(new Uint8Array(32));
			await keyProvider.setKey(ab(cur.key));
		}
		await room.setE2EEEnabled(true);
		const wsUrl = location.origin.replace(/^http/, 'ws') + j.url;
		await room.connect(wsUrl, j.token, { autoSubscribe: true });
		if (s !== cur) return;
		rebuild();
		if (j.fresh) {
			// Im Verlauf: „Gruppenanruf gestartet“ (löst die Benachrichtigung der anderen aus)
			void c.sendEvent(roomId, CALL_EVENT as never, { action: 'start', call_id: j.callId, video } as never).catch(() => {});
		} else if (!cur.key) {
			group.view = 'schluessel';
			const asks = KEY_ASK_MS.map((ms) => setTimeout(() => void requestKey(cur), ms));
			const ok = await new Promise<boolean>((res) => {
				const t = setTimeout(() => res(false), KEY_WAIT_MS);
				cur.gotKey = () => {
					clearTimeout(t);
					res(true);
				};
				if (cur.key) cur.gotKey();
			});
			asks.forEach(clearTimeout);
			if (s !== cur) return;
			if (!ok) {
				end('Der Schlüssel für diesen Anruf kam nicht an. Bitte noch einmal beitreten.');
				return;
			}
		}
		// Wer schon da ist und noch keinen Schlüssel hat, bekommt ihn jetzt
		for (const p of room.remoteParticipants.values()) void sendKey(p.identity);
		group.view = 'verbunden';
		group.startedAt = Date.now();
		try {
			await room.localParticipant.setMicrophoneEnabled(true);
			if (video) await room.localParticipant.setCameraEnabled(true);
		} catch {
			group.reason = 'Kein Zugriff auf Mikrofon/Kamera – bitte im Browser erlauben. Du hörst und siehst die anderen trotzdem.';
			group.muted = !room.localParticipant.isMicrophoneEnabled;
		}
		group.camOff = !room.localParticipant.isCameraEnabled;
		group.needsAudio = !room.canPlaybackAudio;
		rebuild();
	} catch (e) {
		if (s) end((e as Error).message || 'Gruppenanruf nicht möglich.');
		else {
			worker?.terminate();
			busy.group = false;
			group.view = 'aus';
		}
		throw e;
	}
}

export function leaveGroupCall() {
	if (s) end('Du hast den Anruf verlassen.');
}

export async function toggleGroupMute() {
	if (!s) return;
	const lp = s.room.localParticipant;
	await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled).catch(() => (group.reason = 'Kein Zugriff auf das Mikrofon.'));
	group.muted = !lp.isMicrophoneEnabled;
	rebuild();
}

export async function toggleGroupCamera() {
	if (!s) return;
	const lp = s.room.localParticipant;
	await lp.setCameraEnabled(!lp.isCameraEnabled).catch(() => (group.reason = 'Kein Zugriff auf die Kamera.'));
	group.camOff = !lp.isCameraEnabled;
	rebuild();
}

export async function switchGroupCamera() {
	if (!s || !lk) return;
	const cams = await lk.Room.getLocalDevices('videoinput').catch(() => []);
	if (cams.length < 2) return;
	const now = s.room.getActiveDevice('videoinput');
	const i = cams.findIndex((d) => d.deviceId === now);
	await s.room.switchActiveDevice('videoinput', cams[(i + 1) % cams.length].deviceId).catch(() => {});
}

export async function toggleScreenShare() {
	if (!s) return;
	const lp = s.room.localParticipant;
	try {
		await lp.setScreenShareEnabled(!lp.isScreenShareEnabled, { audio: false });
	} catch {
		/* abgebrochen */
	}
	group.sharing = lp.isScreenShareEnabled;
	rebuild();
}

export async function enableAudio() {
	if (!s) return;
	await s.room.startAudio().catch(() => {});
	group.needsAudio = !s.room.canPlaybackAudio;
}

/** Läuft in diesem Raum ein Gruppenanruf? (Für den Hinweis „Beitreten“ im Chat.) */
export async function groupCallStatus(roomId: string): Promise<{ enabled: boolean; active: boolean; count: number }> {
	const r = await fetch(`/api/anruf?raum=${encodeURIComponent(roomId)}`);
	if (!r.ok) return { enabled: false, active: false, count: 0 };
	return r.json();
}
