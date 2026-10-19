// Anrufe (M02): Audio und Video im Direktchat, „Ruf mich an“ ohne Telefonnummer.
// Signalisierung als Ereignisse im Ende-zu-Ende-verschlüsselten Raum, Medien direkt zwischen den Geräten (DTLS-SRTP);
// geht das nicht, vermittelt der eigene TURN-Server – er sieht nur verschlüsselte Datenpakete (D-056).
import type { MatrixCall, MatrixClient } from 'matrix-js-sdk';
import { contactByMxid, formatCid } from './client.svelte';

type Sdk = typeof import('matrix-js-sdk');

export type CallView = 'aus' | 'klingelt' | 'waehlt' | 'verbindet' | 'verbunden' | 'beendet';

export const call = $state({
	view: 'aus' as CallView,
	incoming: false,
	video: false,
	roomId: '',
	peer: '',
	muted: false,
	camOff: false,
	startedAt: 0,
	reason: '',
	local: null as MediaStream | null,
	remote: null as MediaStream | null
});

let current: MatrixCall | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let ringtone: { stop: () => void } | null = null;

export function callsSupported(): boolean {
	return typeof window !== 'undefined' && 'RTCPeerConnection' in window && !!navigator.mediaDevices?.getUserMedia;
}

const REASONS: Record<string, string> = {
	user_hangup: 'Anruf beendet.',
	user_busy: 'Besetzt.',
	invite_timeout: 'Niemand hat abgenommen.',
	no_user_media: 'Kein Zugriff auf Mikrofon/Kamera – bitte im Browser erlauben.',
	ice_failed: 'Keine Verbindung möglich (Netzwerk). Bitte später erneut versuchen.',
	answered_elsewhere: 'Auf einem anderen Gerät angenommen.',
	unknown_devices: 'Unbekannte Geräte im Chat – bitte Seite neu laden.',
	send_invite: 'Anruf konnte nicht gestartet werden.',
	replaced: 'Anruf wurde ersetzt.',
	signalling_timeout: 'Verbindung abgebrochen.'
};

function peerName(c: MatrixClient, mc: MatrixCall): string {
	const m = mc.getOpponentMember();
	const contact = m ? contactByMxid(m.userId) : undefined;
	if (contact) return contact.name ?? formatCid(contact.contactId);
	if (m?.name && !m.name.startsWith('@')) return m.name;
	const room = c.getRoom(mc.roomId);
	return room?.name && !room.name.startsWith('!') ? room.name : 'Kontakt';
}

function ring(on: boolean) {
	ringtone?.stop();
	ringtone = null;
	if (!on || typeof AudioContext === 'undefined') return;
	try {
		const ctx = new AudioContext();
		let stopped = false;
		const beep = () => {
			if (stopped) return;
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.frequency.value = 660;
			g.gain.value = 0.08;
			o.connect(g).connect(ctx.destination);
			o.start();
			o.stop(ctx.currentTime + 0.4);
			setTimeout(beep, 1600);
		};
		beep();
		ringtone = { stop: () => ((stopped = true), void ctx.close().catch(() => {})) };
	} catch {
		/* ohne Ton */
	}
	navigator.vibrate?.(on ? [400, 200, 400] : 0);
}

function feeds(mc: MatrixCall) {
	if (mc.type === 'video') call.video = true;
	call.local = mc.getLocalFeeds()[0]?.stream ?? null;
	call.remote = mc.getRemoteFeeds()[0]?.stream ?? null;
	call.camOff = mc.isLocalVideoMuted?.() ?? call.camOff;
	call.muted = mc.isMicrophoneMuted?.() ?? call.muted;
}

function attach(c: MatrixClient, mc: MatrixCall, incoming: boolean) {
	if (clearTimer) clearTimeout(clearTimer);
	current = mc;
	Object.assign(call, { view: incoming ? 'klingelt' : 'waehlt', incoming, video: mc.type === 'video', roomId: mc.roomId, peer: peerName(c, mc), muted: false, camOff: false, startedAt: 0, reason: '', local: null, remote: null });
	ring(incoming);
	mc.on('state' as never, ((state: string) => {
		if (current !== mc) return;
		if (state === 'connected') {
			call.view = 'verbunden';
			call.startedAt ||= Date.now();
			ring(false);
		} else if (state === 'connecting' || state === 'create_answer' || state === 'create_offer' || state === 'wait_local_media') {
			if (call.view !== 'klingelt' || !incoming) call.view = call.view === 'waehlt' ? 'waehlt' : 'verbindet';
		} else if (state === 'invite_sent') call.view = 'waehlt';
	}) as never);
	mc.on('feeds_changed' as never, (() => current === mc && feeds(mc)) as never);
	mc.on('hangup' as never, (() => {
		if (current !== mc) return;
		ring(false);
		const why = mc.hangupReason ?? '';
		call.reason = REASONS[why] ?? (why ? 'Anruf beendet.' : 'Anruf beendet.');
		end();
	}) as never);
	mc.on('error' as never, ((e: { code?: string; message?: string }) => {
		if (current !== mc) return;
		call.reason = REASONS[e?.code ?? ''] ?? e?.message ?? 'Fehler beim Anruf.';
	}) as never);
}

function end() {
	call.view = 'beendet';
	call.local?.getTracks().forEach((t) => t.stop());
	call.local = null;
	call.remote = null;
	current = null;
	clearTimer = setTimeout(() => {
		if (call.view === 'beendet') call.view = 'aus';
	}, 3500);
}

/** Vom Chat-Client beim Start aufgerufen: eingehende Anrufe annehmen können. */
export function initCalls(c: MatrixClient, sdk: Sdk) {
	c.on('Call.incoming' as never, ((mc: MatrixCall) => {
		// Nur im Direktchat – Gruppenanrufe gibt es (noch) nicht. Besetzt, wenn schon ein Anruf läuft.
		const room = c.getRoom(mc.roomId);
		if (current || !room || room.getJoinedMemberCount() !== 2) {
			mc.reject();
			return;
		}
		attach(c, mc, true);
	}) as never);
	void sdk;
}

export async function startCall(c: MatrixClient, sdk: Sdk, roomId: string, video: boolean) {
	if (current) throw new Error('Es läuft schon ein Anruf.');
	if (!callsSupported()) throw new Error('Dieser Browser unterstützt keine Anrufe.');
	const room = c.getRoom(roomId);
	if (!room || room.getJoinedMemberCount() !== 2) throw new Error('Anrufe gehen nur im Direktchat, wenn beide beigetreten sind.');
	const mc = sdk.createNewMatrixCall(c, roomId);
	if (!mc) throw new Error('Anrufe werden hier nicht unterstützt.');
	attach(c, mc, false);
	call.video = video;
	try {
		if (video) await mc.placeVideoCall();
		else await mc.placeVoiceCall();
		feeds(mc);
	} catch (e) {
		call.reason = REASONS['no_user_media'];
		mc.hangup('user_hangup' as never, true);
		end();
		throw e;
	}
}

export async function answer() {
	if (!current) return;
	ring(false);
	call.view = 'verbindet';
	await current.answer(true, call.video);
	feeds(current);
}

export function reject() {
	if (!current) return;
	ring(false);
	current.reject();
	call.reason = 'Abgelehnt.';
	end();
}

export function hangup() {
	if (!current) return;
	ring(false);
	current.hangup('user_hangup' as never, false);
	call.reason = 'Anruf beendet.';
	end();
}

export async function toggleMute() {
	if (!current) return;
	call.muted = !call.muted;
	await current.setMicrophoneMuted(call.muted);
}

export async function toggleCamera() {
	if (!current) return;
	call.camOff = !call.camOff;
	await current.setLocalVideoMuted(call.camOff);
	feeds(current);
}
