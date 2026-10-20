// Verbindung der App zum Chat-Server (Synapse, nur im internen Netz erreichbar).
// Die App liest keine Nachrichten: Sie sind Ende-zu-Ende-verschlüsselt. Sie verwaltet nur Konten, Räume (Anlegen
// prüfen, Treffen nach Ablauf löschen), Geräte und Anmeldetoken.
import { createHmac, hkdfSync, randomBytes } from 'node:crypto';
import type { Sql } from '../db';
import { decrypt, encrypt, deriveKey } from '../crypto';

export const SERVER_NAME = 'kinder-deutschlands';
export const SYSTEM_LOCALPART = 'kd-system';
const env = process.env;

export class ChatError extends Error {}

export function chatEnabled(): boolean {
	return !!env.SYNAPSE_URL;
}
export function synapseUrl(): string {
	return (env.SYNAPSE_URL || '').replace(/\/$/, '');
}

/** Gleiche Ableitung wie scripts/synapse-prepare.mjs (HKDF aus APP_SECRET, Zweck „chat:…“). */
export function chatSecret(purpose: string): string {
	const s = env.APP_SECRET || '';
	if (s.length < 32) throw new ChatError('APP_SECRET fehlt.');
	return Buffer.from(hkdfSync('sha256', s, 'kinder-deutschlands', `chat:${purpose}`, 32)).toString('base64url');
}

export const mxid = (localpart: string) => `@${localpart}:${SERVER_NAME}`;
export function localpartOf(id: string): string | null {
	const m = /^@([a-z0-9._=\-/]+):(.+)$/.exec(id);
	return m && m[2] === SERVER_NAME ? m[1] : null;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Kurzlebiges Anmeldetoken (JWT, HS256) für den Chat-Server – nur für das eigene Konto. */
export function loginJwt(localpart: string, seconds = 120): string {
	const h = b64({ alg: 'HS256', typ: 'JWT' });
	const p = b64({ sub: localpart, iss: SERVER_NAME, exp: Math.floor(Date.now() / 1000) + seconds });
	return `${h}.${p}.${createHmac('sha256', chatSecret('jwt')).update(`${h}.${p}`).digest('base64url')}`;
}

/** Bestätigung für sicherheitsrelevante Schritte im Chat-Server (Schlüssel zurücksetzen) – geprüft im Regelmodul. */
export function reauthToken(localpart: string, seconds = 120): string {
	const p = b64({ sub: mxid(localpart), exp: Math.floor(Date.now() / 1000) + seconds, purpose: 'reauth' });
	return `${p}.${createHmac('sha256', chatSecret('reauth')).update(p).digest('base64url')}`;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
export function newLocalpart(): string {
	const b = randomBytes(15);
	return 'k' + Array.from(b, (x) => BASE32[x & 31]).join('');
}

// ---------- Admin-Zugang (Systemkonto) ----------
let systemToken: string | null = null;
let settingsKey: Buffer | null = null;
const skey = () => (settingsKey ??= deriveKey(env.APP_SECRET || '', 'settings'));

async function raw(path: string, init: RequestInit & { token?: string | null } = {}) {
	const headers: Record<string, string> = { 'content-type': 'application/json', ...(init.headers as Record<string, string>) };
	if (init.token) headers.authorization = `Bearer ${init.token}`;
	const res = await fetch(synapseUrl() + path, { ...init, headers, signal: AbortSignal.timeout(15_000) });
	const text = await res.text();
	let json: Record<string, unknown> = {};
	try {
		json = text ? JSON.parse(text) : {};
	} catch {
		/* kein JSON */
	}
	return { status: res.status, json };
}

async function registerSystemUser() {
	const { json: n } = await raw('/_synapse/admin/v1/register');
	const nonce = String(n.nonce ?? '');
	if (!nonce) throw new ChatError('Chat-Server antwortet nicht (Registrierung).');
	const password = randomBytes(24).toString('base64url');
	const mac = createHmac('sha1', chatSecret('registration')).update(`${nonce}\0${SYSTEM_LOCALPART}\0${password}\0admin`).digest('hex');
	const r = await raw('/_synapse/admin/v1/register', { method: 'POST', body: JSON.stringify({ nonce, username: SYSTEM_LOCALPART, password, admin: true, mac }) });
	if (r.status !== 200 && r.json.errcode !== 'M_USER_IN_USE') throw new ChatError(`Systemkonto konnte nicht angelegt werden (${r.json.errcode ?? r.status}).`);
}

async function loginSystem(sql: Sql): Promise<string> {
	const r = await raw('/_matrix/client/v3/login', { method: 'POST', body: JSON.stringify({ type: 'org.matrix.login.jwt', token: loginJwt(SYSTEM_LOCALPART), device_id: 'KDSYSTEM', initial_device_display_name: 'Kinder Deutschlands (System)' }) });
	if (r.status === 200) {
		// JWT-Anmeldung legt unbekannte Konten ohne Adminrecht an – Adminrecht prüfen, sonst über das Registrierungsgeheimnis anlegen
		const who = await raw(`/_synapse/admin/v1/users/${encodeURIComponent(mxid(SYSTEM_LOCALPART))}/admin`, { token: String(r.json.access_token) });
		if (who.status === 200 && who.json.admin) {
			systemToken = String(r.json.access_token);
		} else {
			throw new ChatError('Systemkonto des Chat-Servers hat kein Adminrecht.');
		}
	} else {
		throw new ChatError(`Anmeldung am Chat-Server fehlgeschlagen (${r.json.errcode ?? r.status}).`);
	}
	await sql`insert into settings (key, value) values ('chat_system', ${sql.json({ token_enc: encrypt(systemToken, skey()) })})
		on conflict (key) do update set value = excluded.value, updated_at = now()`;
	return systemToken;
}

async function system(sql: Sql): Promise<string> {
	if (systemToken) return systemToken;
	const [s] = await sql`select value from settings where key = 'chat_system'`;
	if (s?.value?.token_enc) {
		try {
			systemToken = decrypt(s.value.token_enc, skey());
			return systemToken;
		} catch {
			/* neu anmelden */
		}
	}
	await registerSystemUser();
	return loginSystem(sql);
}

/** Admin-Aufruf; bei abgelaufenem Systemtoken einmal neu anmelden. */
export async function admin(sql: Sql, path: string, init: RequestInit = {}) {
	let r = await raw(path, { ...init, token: await system(sql) });
	if (r.status === 401) {
		systemToken = null;
		await sql`delete from settings where key = 'chat_system'`;
		await registerSystemUser();
		r = await raw(path, { ...init, token: await loginSystem(sql) });
	}
	return r;
}

export async function health(): Promise<{ ok: boolean; version: string | null; error?: string }> {
	if (!chatEnabled()) return { ok: false, version: null, error: 'nicht eingerichtet' };
	try {
		const r = await fetch(synapseUrl() + '/health', { signal: AbortSignal.timeout(3000) });
		if (!r.ok) return { ok: false, version: null, error: `HTTP ${r.status}` };
		const v = await raw('/_synapse/admin/v1/server_version');
		return { ok: true, version: (v.json.server_version as string) ?? null };
	} catch (e) {
		return { ok: false, version: null, error: (e as Error).message };
	}
}

// ---------- Konten ----------
/** Matrix-Anzeigename: nur wenn der Name für Mitglieder sichtbar ist, sonst neutral. */
export async function chatDisplayName(sql: Sql, userId: string): Promise<string> {
	const [p] = await sql`select display_name, visibility from user_profiles where user_id = ${userId}`;
	const level = p?.visibility?.display_name;
	return p?.display_name && (level === 'alle' || level === 'mitglieder') ? String(p.display_name) : 'Mitglied';
}

/** Nur die (stabile, zufällige) Chat-Kennung festlegen – ohne Chat-Server (für die Schlüsselableitung, D-066). */
export async function chatLocalpart(sql: Sql, userId: string): Promise<string> {
	const [a] = await sql`select localpart from chat_accounts where user_id = ${userId}`;
	if (a) return a.localpart as string;
	await sql`insert into chat_accounts (user_id, localpart) values (${userId}, ${newLocalpart()}) on conflict (user_id) do nothing`;
	const [b] = await sql`select localpart from chat_accounts where user_id = ${userId}`;
	return b.localpart as string;
}

/** Chat-Konto anlegen (falls nötig) und Anzeigenamen abgleichen. */
export async function ensureAccount(sql: Sql, userId: string): Promise<string> {
	let [a] = await sql`select localpart, synced_name from chat_accounts where user_id = ${userId}`;
	if (!a) {
		const lp = newLocalpart();
		[a] = await sql`insert into chat_accounts (user_id, localpart) values (${userId}, ${lp}) on conflict (user_id) do nothing returning localpart, synced_name`;
		if (!a) [a] = await sql`select localpart, synced_name from chat_accounts where user_id = ${userId}`;
	}
	const name = await chatDisplayName(sql, userId);
	if (a.synced_name !== name) {
		const r = await admin(sql, `/_synapse/admin/v2/users/${encodeURIComponent(mxid(a.localpart))}`, { method: 'PUT', body: JSON.stringify({ displayname: name }) });
		if (r.status !== 200 && r.status !== 201) throw new ChatError(`Chat-Konto konnte nicht angelegt werden (${r.json.errcode ?? r.status}).`);
		await sql`update chat_accounts set synced_name = ${name} where user_id = ${userId}`;
	}
	return a.localpart as string;
}

export async function userByMxid(sql: Sql, id: string): Promise<{ id: string; status: string } | null> {
	const lp = localpartOf(id);
	if (!lp) return null;
	const [u] = await sql`select u.id, u.status from chat_accounts c join users u on u.id = c.user_id where c.localpart = ${lp}`;
	return u ? { id: u.id as string, status: u.status as string } : null;
}

export async function mxidOf(sql: Sql, userId: string): Promise<string | null> {
	const [a] = await sql`select localpart from chat_accounts where user_id = ${userId}`;
	return a ? mxid(a.localpart) : null;
}

/** Raumdaten über die Admin-Schnittstelle (Ersteller, Beitrittsregel, Name, Mitgliederzahl). */
export async function roomInfo(sql: Sql, roomId: string) {
	const r = await admin(sql, `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}`);
	if (r.status !== 200) return null;
	return {
		creator: String(r.json.creator ?? ''),
		joinRules: String(r.json.join_rules ?? ''),
		name: (r.json.name as string) ?? null,
		members: Number(r.json.joined_members ?? 0),
		encrypted: !!r.json.encryption
	};
}

export async function roomMembers(sql: Sql, roomId: string): Promise<string[]> {
	const r = await admin(sql, `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/members`);
	return r.status === 200 ? ((r.json.members as string[]) ?? []) : [];
}

/** Raum mit allen Nachrichten vom Server löschen (Treffen nach Ablauf). */
export async function deleteRoom(sql: Sql, roomId: string) {
	const r = await admin(sql, `/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE', body: JSON.stringify({ block: false, purge: true }) });
	if (r.status !== 200) throw new ChatError(`Raum konnte nicht gelöscht werden (${r.json.errcode ?? r.status}).`);
}

/** Ereignis prüfen (für Meldungen): gibt es die Nachricht in dem Raum, und von wem ist sie? */
export async function eventInfo(sql: Sql, roomId: string, eventId: string): Promise<{ sender: string; ts: number } | null> {
	const r = await admin(sql, `/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/context/${encodeURIComponent(eventId)}?limit=0`);
	const ev = r.json.event as { sender?: string; origin_server_ts?: number; room_id?: string } | undefined;
	if (r.status !== 200 || !ev?.sender) return null;
	return { sender: ev.sender, ts: Number(ev.origin_server_ts ?? 0) };
}

// ---------- Geräte ----------
export interface ChatDevice {
	id: string;
	name: string | null;
	lastSeen: number | null;
}
export async function listDevices(sql: Sql, localpart: string): Promise<ChatDevice[]> {
	const r = await admin(sql, `/_synapse/admin/v2/users/${encodeURIComponent(mxid(localpart))}/devices`);
	const list = (r.json.devices as { device_id: string; display_name?: string; last_seen_ts?: number }[]) ?? [];
	return list.map((d) => ({ id: d.device_id, name: d.display_name ?? null, lastSeen: d.last_seen_ts ?? null }));
}
export async function deleteDevice(sql: Sql, localpart: string, deviceId: string) {
	const r = await admin(sql, `/_synapse/admin/v2/users/${encodeURIComponent(mxid(localpart))}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
	if (r.status !== 200) throw new ChatError('Gerät konnte nicht abgemeldet werden.');
}
export async function logoutAll(sql: Sql, localpart: string) {
	const ids = (await listDevices(sql, localpart)).map((d) => d.id);
	if (!ids.length) return;
	await admin(sql, `/_synapse/admin/v2/users/${encodeURIComponent(mxid(localpart))}/delete_devices`, { method: 'POST', body: JSON.stringify({ devices: ids }) });
}

/** Kreuzsignierung ohne weitere Bestätigung ersetzbar machen (Gerätewechsel ohne Wiederherstellungsschlüssel). */
export async function allowKeyReset(sql: Sql, localpart: string) {
	const r = await admin(sql, `/_synapse/admin/v1/users/${encodeURIComponent(mxid(localpart))}/_allow_cross_signing_replacement_without_uia`, { method: 'POST', body: '{}' });
	if (r.status !== 200) throw new ChatError('Zurücksetzen nicht möglich.');
}

/** Konto auf dem Chat-Server stilllegen und Daten löschen (Kontolöschung). */
export async function deactivate(sql: Sql, userId: string) {
	const [a] = await sql`select localpart from chat_accounts where user_id = ${userId}`;
	if (!a || !chatEnabled()) return;
	await admin(sql, `/_synapse/admin/v1/deactivate/${encodeURIComponent(mxid(a.localpart))}`, { method: 'POST', body: JSON.stringify({ erase: true }) });
}

export function resetSystemTokenForTests() {
	systemToken = null;
}
