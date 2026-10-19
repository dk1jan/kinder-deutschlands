// Chat im Browser: Matrix-Client mit Ende-zu-Ende-Verschlüsselung (Rust-Krypto als WebAssembly).
// Ein Client je Seite (bleibt beim Navigieren innerhalb der App bestehen). Zugangsdaten nur in diesem Browser.
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

type Sdk = typeof import('matrix-js-sdk');
export type Status = 'aus' | 'laedt' | 'bereit' | 'fehler' | 'nicht_eingerichtet';
/** neu: noch kein Wiederherstellungsschlüssel · gesperrt: es gibt einen, dieses Gerät ist noch nicht freigeschaltet · ok */
export type KeyState = 'unbekannt' | 'neu' | 'gesperrt' | 'ok';

export interface ChatContact {
	contactId: string;
	name: string | null;
	mxid: string;
}
export interface RoomMeta {
	roomId: string;
	kind: 'direkt' | 'gruppe' | 'treffen';
	mine: boolean;
	peerContactId: string | null;
	expiresAt: string | null;
	status: string;
}

export const chat = $state({
	status: 'aus' as Status,
	error: '',
	keys: 'unbekannt' as KeyState,
	/** zählt bei jeder Änderung hoch – Komponenten leiten daraus ab */
	version: 0,
	userId: '',
	settings: { readReceipts: false, typing: false },
	contacts: [] as ChatContact[],
	meta: {} as Record<string, RoomMeta>
});

let sdk: Sdk | null = null;
let client: MatrixClient | null = null;
let starting: Promise<MatrixClient | null> | null = null;
let ssKey: Uint8Array<ArrayBuffer> | null = null;
let push: { appId: string; url: string; vapidPublicKey: string } | null = null;

const STORE = 'kd_chat';
interface Stored {
	userId: string;
	deviceId: string;
	accessToken: string;
}
function readStored(): Stored | null {
	try {
		const s = JSON.parse(localStorage.getItem(STORE) || 'null');
		return s?.userId && s?.deviceId && s?.accessToken ? s : null;
	} catch {
		return null;
	}
}
function writeStored(s: Stored | null) {
	try {
		if (s) localStorage.setItem(STORE, JSON.stringify(s));
		else localStorage.removeItem(STORE);
	} catch {
		/* privater Modus */
	}
}
const dbPrefix = (s: Pick<Stored, 'userId' | 'deviceId'>) => `kd-${s.userId.slice(1, 17)}-${s.deviceId}`;

async function deleteDatabases(prefix: string) {
	try {
		const list = (await indexedDB.databases?.()) ?? [];
		for (const d of list) if (d.name?.startsWith(prefix)) indexedDB.deleteDatabase(d.name);
	} catch {
		/* nicht unterstützt */
	}
}

/** Sitzung auf dem Chat-Server beenden und lokale Schlüssel löschen (Abmelden, anderes Konto im Browser). */
async function dropStored(s: Stored) {
	try {
		await fetch(`${location.origin}/_matrix/client/v3/logout`, { method: 'POST', headers: { authorization: `Bearer ${s.accessToken}` } });
	} catch {
		/* egal */
	}
	await deleteDatabases(`kd-${s.userId.slice(1, 17)}`);
	writeStored(null);
}

/** Nach dem Abmelden von Kinder Deutschlands: Chat-Spuren in diesem Browser entfernen. */
export async function clearChatIfLoggedOut() {
	const s = readStored();
	if (!s) return;
	await stopChat();
	await dropStored(s);
}

export function getClient() {
	return client;
}

function deviceName() {
	const ua = navigator.userAgent;
	const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
	return `${b}${os ? ' auf ' + os : ''}`;
}

export async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T & { error?: string }> {
	const res = await fetch(path, {
		...init,
		method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
		headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
		body: init.json !== undefined ? JSON.stringify(init.json) : init.body
	});
	let data: T & { error?: string };
	try {
		data = await res.json();
	} catch {
		data = { error: `Fehler ${res.status}` } as T & { error?: string };
	}
	if (!res.ok && !data.error) data.error = (data as { message?: string }).message ?? `Fehler ${res.status}`;
	return data;
}

let bumpQueued = false;
function bump() {
	if (bumpQueued) return;
	bumpQueued = true;
	requestAnimationFrame(() => {
		bumpQueued = false;
		chat.version++;
	});
}

export async function loadContacts() {
	const r = await api<{ contacts: ChatContact[] }>('/api/chat/kontakte');
	if (!r.error) chat.contacts = r.contacts;
}

export async function loadMeta(roomIds?: string[]) {
	const ids = roomIds ?? client?.getRooms().map((r) => r.roomId) ?? [];
	if (!ids.length) return;
	const r = await api<{ rooms: RoomMeta[] }>('/api/chat/raeume', { json: { action: 'info', roomIds: ids } });
	if (r.error) return;
	const next = { ...chat.meta };
	for (const m of r.rooms) next[m.roomId] = m;
	chat.meta = next;
}

export function startChat(): Promise<MatrixClient | null> {
	if (client && chat.status === 'bereit') return Promise.resolve(client);
	return (starting ??= doStart().finally(() => (starting = null)));
}

async function doStart(): Promise<MatrixClient | null> {
	chat.status = 'laedt';
	chat.error = '';
	try {
		const s = await api<{ homeserver: string; userId: string; token: string; displayName: string; push: typeof push; settings: typeof chat.settings }>('/api/chat/sitzung', { json: {} });
		if (s.error) {
			chat.status = s.error.includes('nicht eingerichtet') ? 'nicht_eingerichtet' : 'fehler';
			chat.error = s.error;
			return null;
		}
		push = s.push;
		chat.settings = s.settings;
		chat.userId = s.userId;
		const base = location.origin;
		let stored = readStored();
		if (stored && stored.userId !== s.userId) {
			await dropStored(stored);
			stored = null;
		}
		if (stored) {
			const who = await fetch(`${base}/_matrix/client/v3/account/whoami`, { headers: { authorization: `Bearer ${stored.accessToken}` } });
			if (who.status === 401) {
				await deleteDatabases(dbPrefix(stored));
				writeStored(null);
				stored = null;
			}
		}
		if (!stored) {
			const r = await fetch(`${base}/_matrix/client/v3/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'org.matrix.login.jwt', token: s.token, initial_device_display_name: deviceName() })
			});
			const j = await r.json();
			if (!r.ok || !j.access_token) throw new Error(j.error || 'Anmeldung am Chat fehlgeschlagen');
			stored = { userId: j.user_id, deviceId: j.device_id, accessToken: j.access_token };
			writeStored(stored);
		}
		sdk ??= await import('matrix-js-sdk');
		try {
			const { logger } = await import('matrix-js-sdk/lib/logger.js');
			(logger as unknown as { setLevel?: (l: string) => void }).setLevel?.('warn');
		} catch {
			/* egal */
		}
		const c = sdk.createClient({
			baseUrl: base,
			accessToken: stored.accessToken,
			userId: stored.userId,
			deviceId: stored.deviceId,
			timelineSupport: true,
			cryptoCallbacks: {
				getSecretStorageKey: async ({ keys }) => {
					if (!ssKey) return null;
					const def = await c.secretStorage.getDefaultKeyId();
					const id = def && keys[def] ? def : Object.keys(keys)[0];
					return id ? [id, ssKey] : null;
				}
			}
		});
		await c.initRustCrypto({ cryptoDatabasePrefix: dbPrefix(stored) });
		c.on(sdk.HttpApiEvent.SessionLoggedOut, () => {
			writeStored(null);
			chat.status = 'fehler';
			chat.error = 'Dieses Gerät wurde vom Chat abgemeldet. Bitte Seite neu laden.';
		});
		for (const ev of [sdk.RoomEvent.Timeline, sdk.RoomEvent.Name, sdk.RoomEvent.MyMembership, sdk.RoomEvent.Receipt, sdk.RoomEvent.Redaction, sdk.RoomEvent.LocalEchoUpdated, sdk.RoomEvent.UnreadNotifications])
			(c.on as unknown as (e: string, f: () => void) => void).call(c, ev as string, bump);
		c.on(sdk.ClientEvent.Room, (room: Room) => {
			bump();
			void loadMeta([room.roomId]);
			void autoJoinDirect(room);
		});
		c.on(sdk.RoomEvent.MyMembership, (room: Room) => void autoJoinDirect(room));
		c.on(sdk.MatrixEventEvent.Decrypted, bump);
		c.on(sdk.RoomMemberEvent.Typing, bump);
		c.on(sdk.RoomStateEvent.Members, bump);
		await c.startClient({ initialSyncLimit: 30, lazyLoadMembers: true });
		await new Promise<void>((res) => {
			if (c.isInitialSyncComplete()) return res();
			const on = (state: string) => {
				if (state === 'PREPARED' || state === 'SYNCING') {
					c.off(sdk!.ClientEvent.Sync, on as never);
					res();
				}
			};
			c.on(sdk!.ClientEvent.Sync, on as never);
		});
		client = c;
		await Promise.all([refreshKeyState(), loadContacts(), loadMeta()]);
		for (const r of c.getRooms()) void autoJoinDirect(r);
		chat.status = 'bereit';
		bump();
		void ensurePusher();
		return c;
	} catch (e) {
		chat.status = 'fehler';
		chat.error = (e as Error).message || 'Chat konnte nicht starten.';
		return null;
	}
}

/** Direktchat-Einladungen bestätigter Kontakte gleich annehmen – erst dann können sie verschlüsselt schreiben. */
const joining = new Set<string>();
async function autoJoinDirect(room: Room) {
	if (!client || room.getMyMembership() !== 'invite' || joining.has(room.roomId)) return;
	const inviter = room.getDMInviter();
	if (!inviter || !chat.contacts.some((x) => x.mxid === inviter)) return;
	joining.add(room.roomId);
	try {
		await client.joinRoom(room.roomId);
	} catch {
		/* bleibt als Einladung sichtbar */
	} finally {
		joining.delete(room.roomId);
	}
}

export async function stopChat() {
	if (client) {
		client.stopClient();
		client.removeAllListeners();
		client = null;
	}
	chat.status = 'aus';
}

// ---------- Schlüssel (Gerätewechsel und Wiederherstellung) ----------
export async function refreshKeyState() {
	if (!client) return;
	const crypto = client.getCrypto();
	if (!crypto) return;
	const def = await client.secretStorage.getDefaultKeyId();
	if (!def) {
		chat.keys = 'neu';
		return;
	}
	const st = await crypto.getCrossSigningStatus();
	const local = st.privateKeysCachedLocally;
	chat.keys = local.masterKey && local.selfSigningKey && local.userSigningKey ? 'ok' : 'gesperrt';
}

/** Erstes Einrichten: Kreuzsignierung, Schlüsselsicherung, Wiederherstellungsschlüssel (wird nur einmal angezeigt). */
export async function setupKeys(): Promise<string> {
	const c = client!;
	const crypto = c.getCrypto()!;
	const key = await crypto.createRecoveryKeyFromPassphrase();
	ssKey = key.privateKey;
	await crypto.bootstrapCrossSigning({ authUploadDeviceSigningKeys: async (make) => void (await make(null)) });
	await crypto.bootstrapSecretStorage({ createSecretStorageKey: async () => key, setupNewSecretStorage: true, setupNewKeyBackup: true });
	await refreshKeyState();
	return key.encodedPrivateKey!;
}

/** Neuer Wiederherstellungsschlüssel (alter wird ungültig) – nur auf einem freigeschalteten Gerät. */
export async function newRecoveryKey(): Promise<string> {
	const crypto = client!.getCrypto()!;
	const key = await crypto.createRecoveryKeyFromPassphrase();
	ssKey = key.privateKey;
	await crypto.bootstrapSecretStorage({ createSecretStorageKey: async () => key, setupNewSecretStorage: true });
	return key.encodedPrivateKey!;
}

/** Dieses Gerät mit dem Wiederherstellungsschlüssel freischalten und ältere Nachrichten entschlüsseln. */
export async function unlockKeys(input: string): Promise<boolean> {
	const c = client!;
	const { decodeRecoveryKey } = await import('matrix-js-sdk/lib/crypto-api/recovery-key.js');
	let priv: Uint8Array<ArrayBuffer>;
	try {
		priv = decodeRecoveryKey(input.trim());
	} catch {
		return false;
	}
	const tuple = await c.secretStorage.getKey();
	if (!tuple) return false;
	if (!(await c.secretStorage.checkKey(priv, tuple[1] as never))) return false;
	ssKey = priv;
	const crypto = c.getCrypto()!;
	await crypto.bootstrapCrossSigning({});
	await crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => {});
	await crypto.checkKeyBackupAndEnable();
	void crypto.restoreKeyBackup().then(bump).catch(() => {});
	await refreshKeyState();
	return true;
}

/** Schlüssel verloren: Verschlüsselung neu einrichten. Ältere Nachrichten bleiben auf Geräten ohne Schlüssel unlesbar. */
export async function resetKeys(): Promise<string> {
	const c = client!;
	const crypto = c.getCrypto()!;
	const t = await api<{ token: string }>('/api/chat/bestaetigung', { json: {} });
	if (t.error) throw new Error(t.error);
	await crypto.resetEncryption(async (make) => {
		await make({ type: 'de.kinder.reauth', token: t.token, identifier: { type: 'm.id.user', user: c.getUserId()! } } as never);
	});
	const key = await crypto.createRecoveryKeyFromPassphrase();
	ssKey = key.privateKey;
	await crypto.bootstrapSecretStorage({ createSecretStorageKey: async () => key, setupNewSecretStorage: true, setupNewKeyBackup: true });
	await refreshKeyState();
	return key.encodedPrivateKey!;
}

// ---------- Push ----------
function urlB64ToUint8(s: string) {
	const p = '='.repeat((4 - (s.length % 4)) % 4);
	const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

export function pushSupported() {
	return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Push auf diesem Gerät einschalten (fragt den Browser um Erlaubnis). */
export async function enablePush(): Promise<string | null> {
	if (!pushSupported()) return 'Dieser Browser unterstützt keine Push-Benachrichtigungen. Auf dem iPhone: erst „Zum Home-Bildschirm“ hinzufügen und die App von dort öffnen.';
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') return 'Benachrichtigungen wurden im Browser nicht erlaubt.';
	const reg = await navigator.serviceWorker.ready;
	const keyInfo = push ?? (await api<{ push: typeof push }>('/api/chat/sitzung', { json: {} })).push;
	if (!keyInfo) return 'Push ist gerade nicht verfügbar.';
	push = keyInfo;
	let sub = await reg.pushManager.getSubscription();
	sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(keyInfo.vapidPublicKey) });
	const r = await api<{ pushkey: string }>('/api/push/abo', { json: { subscription: sub.toJSON(), label: deviceName() } });
	if (r.error) return r.error;
	await ensurePusher(r.pushkey);
	return null;
}

export async function disablePush() {
	if (!pushSupported()) return;
	const reg = await navigator.serviceWorker.ready;
	const sub = await reg.pushManager.getSubscription();
	if (!sub) return;
	await api('/api/push/abo', { method: 'DELETE', json: { endpoint: sub.endpoint } });
	await sub.unsubscribe();
}

export async function pushState(): Promise<'an' | 'aus' | 'blockiert' | 'nicht_moeglich'> {
	if (!pushSupported()) return 'nicht_moeglich';
	if (Notification.permission === 'denied') return 'blockiert';
	const reg = await navigator.serviceWorker.getRegistration();
	const sub = await reg?.pushManager.getSubscription();
	return sub && Notification.permission === 'granted' ? 'an' : 'aus';
}

/** Push-Ziel beim Chat-Server hinterlegen (ohne Nachrichteninhalt). */
async function ensurePusher(pushkey?: string) {
	if (!client || !push || !pushSupported() || Notification.permission !== 'granted') return;
	try {
		let key = pushkey;
		if (!key) {
			const reg = await navigator.serviceWorker.getRegistration();
			const sub = await reg?.pushManager.getSubscription();
			if (!sub) return;
			const r = await api<{ pushkey: string }>('/api/push/abo', { json: { subscription: sub.toJSON(), label: deviceName() } });
			if (r.error) return;
			key = r.pushkey;
		}
		await client.setPusher({
			pushkey: key,
			kind: 'http',
			app_id: push.appId,
			app_display_name: 'Kinder Deutschlands',
			device_display_name: deviceName(),
			lang: 'de',
			data: { url: push.url, format: 'event_id_only' },
			append: false
		} as never);
	} catch {
		/* nicht kritisch */
	}
}

// ---------- Hilfen für die Oberfläche ----------
export function contactByMxid(id: string): ChatContact | undefined {
	return chat.contacts.find((c) => c.mxid === id);
}

export function roomTitle(room: Room): string {
	const meta = chat.meta[room.roomId];
	if (meta?.kind === 'direkt' || (!meta && room.getJoinedMemberCount() <= 2 && !room.name.startsWith('!'))) {
		const other = room.getMembers().find((m) => m.userId !== client?.getUserId());
		const c = other ? contactByMxid(other.userId) : meta?.peerContactId ? chat.contacts.find((x) => x.contactId === meta.peerContactId) : undefined;
		if (c) return c.name ?? `Familie ${formatCid(c.contactId)}`;
		if (other?.name) return other.name;
	}
	return room.name && !room.name.startsWith('Empty room') ? room.name : 'Unterhaltung';
}

export const formatCid = (s: string) => (s.length === 9 ? `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}` : s);

export function lastEvent(room: Room): MatrixEvent | undefined {
	const evs = room.getLiveTimeline().getEvents();
	for (let i = evs.length - 1; i >= 0; i--) {
		const t = evs[i].getType();
		if (t === 'm.room.message' || t === 'm.room.encrypted') return evs[i];
	}
	return undefined;
}

export function previewText(ev: MatrixEvent | undefined): string {
	if (!ev) return '';
	if (ev.isRedacted()) return 'Nachricht gelöscht';
	if (ev.isDecryptionFailure()) return '🔒 Verschlüsselte Nachricht';
	if (ev.getType() === 'm.room.encrypted') return '…';
	const c = ev.getContent();
	switch (c.msgtype) {
		case 'm.image':
			return '📷 Bild';
		case 'm.file':
			return '📎 Datei';
		case 'm.audio':
			return '🎤 Sprachnachricht';
		case 'm.location':
			return '📍 Treffpunkt';
		default:
			return String(c.body ?? '').slice(0, 120);
	}
}

export function sendReceipt(room: Room) {
	const ev = lastEvent(room);
	if (!client || !ev || !sdk) return;
	void client.sendReadReceipt(ev, chat.settings.readReceipts ? sdk.ReceiptType.Read : sdk.ReceiptType.ReadPrivate).catch(() => {});
}

export function sdkRef() {
	return sdk;
}
