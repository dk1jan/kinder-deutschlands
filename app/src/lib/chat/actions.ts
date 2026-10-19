// Aktionen im Chat (Browser). Alles Verschlüsselte passiert hier; der Server sieht nur Ereigniskennungen.
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { api, chat, getClient, loadMeta, startChat } from './client.svelte';
import { decryptAttachment, encryptAttachment, prepareImage, type EncryptedFile } from './attachments';

const ENC = { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } };
const hist = (v: 'invited' | 'joined') => ({ type: 'm.room.history_visibility', state_key: '', content: { history_visibility: v } });

async function need(): Promise<MatrixClient> {
	const c = getClient() ?? (await startChat());
	if (!c) throw new Error(chat.error || 'Chat ist gerade nicht verfügbar.');
	return c;
}

async function waitForRoom(c: MatrixClient, roomId: string, ms = 8000): Promise<Room | null> {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		const r = c.getRoom(roomId);
		if (r && r.getMyMembership() === 'join') return r;
		await new Promise((res) => setTimeout(res, 150));
	}
	return c.getRoom(roomId);
}

/** Direktchat mit einem Kontakt öffnen (bestehenden nutzen oder neuen anlegen). */
export async function openDirect(contactId: string): Promise<string> {
	const c = await need();
	const found = await api<{ roomId: string | null }>('/api/chat/raeume', { json: { action: 'direkt-suchen', peer: contactId } });
	if (found.error) throw new Error(found.error);
	if (found.roomId) {
		const room = c.getRoom(found.roomId);
		if (room?.getMyMembership() === 'join') return found.roomId;
		try {
			await c.joinRoom(found.roomId);
			return found.roomId;
		} catch {
			// verlassen und keine Einladung mehr: neuen Direktchat zulassen
			await api('/api/chat/raeume', { json: { action: 'direkt-ersetzen', roomId: found.roomId } });
		}
	}
	if (!chat.contacts.length) await import('./client.svelte').then((m) => m.loadContacts());
	const contact = chat.contacts.find((x) => x.contactId === contactId);
	if (!contact) throw new Error('Chats sind nur mit bestätigten Kontakten möglich.');
	const { room_id } = await c.createRoom({ is_direct: true, invite: [contact.mxid], preset: 'trusted_private_chat' as never, visibility: 'private' as never, initial_state: [ENC, hist('invited')] });
	const reg = await api<{ roomId: string; existing: boolean }>('/api/chat/raeume', { json: { action: 'direkt', peer: contactId, roomId: room_id } });
	if (reg.error) {
		await c.leave(room_id).catch(() => {});
		throw new Error(reg.error);
	}
	if (reg.existing) {
		await c.leave(room_id).catch(() => {});
		await c.joinRoom(reg.roomId).catch(() => {});
		return reg.roomId;
	}
	// „Direktchat“-Markierung für andere Matrix-Funktionen
	const direct = (c.getAccountData('m.direct' as never)?.getContent() ?? {}) as Record<string, string[]>;
	direct[contact.mxid] = [...new Set([...(direct[contact.mxid] ?? []), room_id])];
	await c.setAccountData('m.direct' as never, direct as never).catch(() => {});
	await loadMeta([room_id]);
	await waitForRoom(c, room_id);
	return room_id;
}

export async function createGroup(name: string, mxids: string[]): Promise<string> {
	const c = await need();
	const { room_id } = await c.createRoom({ name: name.trim().slice(0, 80), invite: mxids, preset: 'private_chat' as never, visibility: 'private' as never, initial_state: [ENC, hist('invited')] });
	const r = await api('/api/chat/raeume', { json: { action: 'gruppe', roomId: room_id } });
	if (r.error) throw new Error(r.error);
	await loadMeta([room_id]);
	await waitForRoom(c, room_id);
	return room_id;
}

/**
 * Chat zu einer Einladung oder einem Termin: wie ein Treffen (verschlüsselt, mit Ablauf), Beitritt per Ticket
 * der jeweiligen Seite. Die Anmeldung beim Server übernimmt `url` mit `{ ...payload, roomId }`.
 */
export async function createTimedChat(name: string, url: string, payload: Record<string, unknown>): Promise<string> {
	const c = await need();
	const { room_id } = await c.createRoom({
		name: name.trim().slice(0, 80),
		preset: 'public_chat' as never,
		visibility: 'private' as never,
		initial_state: [ENC, hist('joined'), { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'forbidden' } }]
	});
	const r = await api(url, { json: { ...payload, roomId: room_id } });
	if (r.error) {
		await c.leave(room_id).catch(() => {});
		throw new Error(r.error);
	}
	await loadMeta([room_id]);
	await waitForRoom(c, room_id);
	return room_id;
}

/** Treffen: Beitritt per QR, endet automatisch. Nachrichten sehen nur, wer beim Senden schon dabei war. */
export async function createTreffen(name: string, hours: number, point: { lat: number; lon: number; label: string } | null): Promise<{ roomId: string; url: string }> {
	const c = await need();
	const { room_id } = await c.createRoom({
		name: name.trim().slice(0, 80),
		preset: 'public_chat' as never,
		visibility: 'private' as never,
		initial_state: [ENC, hist('joined'), { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'forbidden' } }]
	});
	const r = await api<{ url: string }>('/api/chat/raeume', { json: { action: 'treffen', roomId: room_id, hours } });
	if (r.error) {
		await c.leave(room_id).catch(() => {});
		throw new Error(r.error);
	}
	await loadMeta([room_id]);
	await waitForRoom(c, room_id);
	if (point) await sendLocation(room_id, point.lat, point.lon, point.label);
	return { roomId: room_id, url: r.url };
}

export async function joinTreffen(roomId: string): Promise<void> {
	const c = await need();
	await c.joinRoom(roomId);
	await loadMeta([roomId]);
	await waitForRoom(c, roomId);
}

export async function sendText(roomId: string, text: string) {
	const c = await need();
	const body = text.trim().slice(0, 8000);
	if (!body) return;
	await c.sendEvent(roomId, 'm.room.message' as never, { msgtype: 'm.text', body } as never);
}

async function uploadEncrypted(c: MatrixClient, data: ArrayBuffer): Promise<EncryptedFile> {
	const { data: cipher, info } = await encryptAttachment(data);
	const up = await c.uploadContent(new Blob([cipher], { type: 'application/octet-stream' }), { type: 'application/octet-stream', includeFilename: false });
	return { url: up.content_uri, ...info };
}

export async function sendImage(roomId: string, file: File) {
	const c = await need();
	const img = await prepareImage(file);
	const enc = await uploadEncrypted(c, await img.blob.arrayBuffer());
	await c.sendEvent(roomId, 'm.room.message' as never, {
		msgtype: 'm.image',
		body: 'Bild',
		file: enc,
		info: { mimetype: 'image/jpeg', w: img.w, h: img.h, size: img.blob.size },
		'de.kinder.thumb': img.thumb
	} as never);
}

export async function sendFile(roomId: string, file: File) {
	if (file.size > 20 * 1024 * 1024) throw new Error('Dateien bis 20 MB.');
	const c = await need();
	const enc = await uploadEncrypted(c, await file.arrayBuffer());
	await c.sendEvent(roomId, 'm.room.message' as never, {
		msgtype: 'm.file',
		body: file.name.slice(0, 200) || 'Datei',
		filename: file.name.slice(0, 200),
		file: enc,
		info: { mimetype: file.type || 'application/octet-stream', size: file.size }
	} as never);
}

export async function sendVoice(roomId: string, blob: Blob, durationMs: number) {
	const c = await need();
	const enc = await uploadEncrypted(c, await blob.arrayBuffer());
	await c.sendEvent(roomId, 'm.room.message' as never, {
		msgtype: 'm.audio',
		body: 'Sprachnachricht',
		file: enc,
		info: { mimetype: blob.type || 'audio/webm', size: blob.size, duration: Math.round(durationMs) },
		'org.matrix.msc3245.voice': {},
		'org.matrix.msc1767.audio': { duration: Math.round(durationMs) }
	} as never);
}

export async function sendLocation(roomId: string, lat: number, lon: number, label: string) {
	const c = await need();
	const uri = `geo:${lat.toFixed(6)},${lon.toFixed(6)}`;
	const text = `Treffpunkt: ${label.trim().slice(0, 120) || 'gesetzt'}`;
	await c.sendEvent(roomId, 'm.room.message' as never, {
		msgtype: 'm.location',
		body: text,
		geo_uri: uri,
		'org.matrix.msc3488.location': { uri, description: label.trim().slice(0, 120) },
		'org.matrix.msc3488.asset': { type: 'm.pin' }
	} as never);
}

export async function deleteMessage(roomId: string, eventId: string) {
	const c = await need();
	await c.redactEvent(roomId, eventId);
}

export async function leaveRoom(roomId: string) {
	const c = await need();
	await c.leave(roomId);
	await c.forget(roomId).catch(() => {});
}

export async function invite(roomId: string, mxid: string) {
	const c = await need();
	await c.invite(roomId, mxid);
}

export async function setMuted(roomId: string, mute: boolean) {
	const c = await need();
	await c.setRoomMutePushRule('global', roomId, mute);
}

export function isMuted(c: MatrixClient, roomId: string): boolean {
	const rules = c.pushRules?.global?.override ?? [];
	return rules.some((r) => r.rule_id === roomId && r.enabled && !r.actions.includes('notify' as never));
}

// ---------- Medien laden (entschlüsseln, als Blob-URL zwischenspeichern) ----------
const cache = new Map<string, Promise<string>>();
export function mediaUrl(file: EncryptedFile, mime: string): Promise<string> {
	const key = file.url;
	let p = cache.get(key);
	if (!p) {
		p = (async () => {
			const c = await need();
			const http = c.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, true);
			if (!http) throw new Error('Datei nicht gefunden');
			const res = await fetch(http, { headers: { authorization: `Bearer ${c.getAccessToken()}` } });
			if (!res.ok) throw new Error('Datei nicht mehr verfügbar');
			const plain = await decryptAttachment(await res.arrayBuffer(), file);
			return URL.createObjectURL(new Blob([plain], { type: mime }));
		})();
		cache.set(key, p);
		p.catch(() => cache.delete(key));
	}
	return p;
}

// ---------- Melden ----------
export async function reportMessage(room: Room, ev: MatrixEvent, reason: string, message: string, withContext: boolean) {
	const evs = room.getLiveTimeline().getEvents().filter((e) => e.getType() === 'm.room.message' && !e.isRedacted());
	const i = evs.findIndex((e) => e.getId() === ev.getId());
	const pick = withContext ? evs.slice(Math.max(0, i - 5), i + 1) : [ev];
	const msgs = pick.map((e) => ({
		eventId: e.getId(),
		senderName: room.getMember(e.getSender() ?? '')?.name ?? 'Mitglied',
		ts: e.getTs(),
		body: e.getContent().msgtype === 'm.text' ? String(e.getContent().body ?? '') : `[${e.getContent().msgtype === 'm.image' ? 'Bild' : e.getContent().msgtype === 'm.audio' ? 'Sprachnachricht' : e.getContent().msgtype === 'm.file' ? 'Datei' : 'Nachricht'}] ${String(e.getContent().body ?? '')}`
	}));
	const r = await api('/api/chat/melden', { json: { roomId: room.roomId, eventId: ev.getId(), reason, message, messages: msgs, consent: true } });
	if (r.error) throw new Error(r.error);
}
