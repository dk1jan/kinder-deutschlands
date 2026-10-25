// Web-Push (PWA). Schlüsselpaar (VAPID) wird einmalig erzeugt und verschlüsselt in settings gespeichert.
// Inhalte von Chatnachrichten kennt der Server nicht (Ende-zu-Ende-verschlüsselt) – Push sagt nur „Neue Nachricht“.
// Auch Community-Mitteilungen zeigen auf dem Sperrbildschirm keinen Inhalt (M05: sensible Interessen nicht verraten).
import webpush from 'web-push';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sql } from './db';
import { decrypt, deriveKey, encrypt, randomToken } from './crypto';

export const PUSH_APP_ID = 'de.kinder-deutschlands.web';
const env = process.env;
let vapid: { publicKey: string; privateKey: string } | null = null;
let skey: Buffer | null = null;
const k = () => (skey ??= deriveKey(env.APP_SECRET || '', 'settings'));

export async function vapidKeys(sql: Sql) {
	if (vapid) return vapid;
	const [row] = await sql`select value from settings where key = 'push_vapid'`;
	if (row?.value?.public && row.value.private_enc) {
		vapid = { publicKey: row.value.public, privateKey: decrypt(row.value.private_enc, k()) };
		return vapid;
	}
	const gen = webpush.generateVAPIDKeys();
	await sql`insert into settings (key, value) values ('push_vapid', ${sql.json({ public: gen.publicKey, private_enc: encrypt(gen.privateKey, k()) })})
		on conflict (key) do nothing`;
	vapid = null;
	return vapidKeys(sql);
}

export interface Settings {
	push_chat: boolean;
	push_community: boolean;
	/** Erinnerungen, die man selbst an einem Termin/einer Frist eingestellt hat */
	push_reminders: boolean;
	/** Sofort-Push nur für als dringend markierte Hinweise der Redaktion (M20) */
	push_urgent: boolean;
	/** Neue Anzeigen zu eigenen Marktplatz-Suchaufträgen (M09) */
	push_market: boolean;
	/** Wetter an Terminen, zu denen man kommt (Warnung/Regen zur Terminzeit, F-059) */
	push_weather: boolean;
	quiet_from: number | null;
	quiet_to: number | null;
	read_receipts: boolean;
	typing: boolean;
}
export const DEFAULTS: Settings = { push_chat: true, push_community: false, push_reminders: true, push_urgent: false, push_market: false, push_weather: true, quiet_from: null, quiet_to: null, read_receipts: false, typing: false };

export async function getSettings(sql: Sql, userId: string): Promise<Settings> {
	const [s] = await sql`select push_chat, push_community, push_reminders, push_urgent, push_market, push_weather, quiet_from, quiet_to, read_receipts, typing from notification_settings where user_id = ${userId}`;
	return s ? (s as unknown as Settings) : { ...DEFAULTS };
}

export async function saveSettings(sql: Sql, userId: string, s: Settings) {
	const q = (n: number | null) => (n === null || !Number.isInteger(n) || n < 0 || n > 1439 ? null : n);
	const from = q(s.quiet_from), to = q(s.quiet_to);
	await sql`insert into notification_settings (user_id, push_chat, push_community, push_reminders, push_urgent, push_market, push_weather, quiet_from, quiet_to, read_receipts, typing)
		values (${userId}, ${s.push_chat}, ${s.push_community}, ${s.push_reminders ?? true}, ${s.push_urgent ?? false}, ${s.push_market ?? false}, ${s.push_weather ?? true}, ${from}, ${from === null || to === null ? null : to}, ${s.read_receipts}, ${s.typing})
		on conflict (user_id) do update set push_chat = excluded.push_chat, push_community = excluded.push_community, push_reminders = excluded.push_reminders,
			push_urgent = excluded.push_urgent, push_market = excluded.push_market, push_weather = excluded.push_weather, quiet_from = excluded.quiet_from, quiet_to = excluded.quiet_to, read_receipts = excluded.read_receipts,
			typing = excluded.typing, updated_at = now()`;
}

/** Minuten seit Mitternacht in Deutschland (Sommer-/Winterzeit). */
export function berlinMinutes(d = new Date()): number {
	const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
	const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
	const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
	return h * 60 + m;
}

export function inQuietHours(s: Pick<Settings, 'quiet_from' | 'quiet_to'>, minutes: number): boolean {
	if (s.quiet_from === null || s.quiet_to === null || s.quiet_from === s.quiet_to) return false;
	return s.quiet_from < s.quiet_to ? minutes >= s.quiet_from && minutes < s.quiet_to : minutes >= s.quiet_from || minutes < s.quiet_to;
}

export interface SubscriptionInput {
	endpoint: string;
	keys: { p256dh: string; auth: string };
}

export function validSubscription(x: unknown): x is SubscriptionInput {
	const s = x as SubscriptionInput;
	try {
		const u = new URL(s.endpoint);
		return u.protocol === 'https:' && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;
	} catch {
		return false;
	}
}

/** Gerät für Push anmelden. Liefert den Schlüssel (pushkey), den der Browser beim Chat-Server hinterlegt. */
export async function subscribe(sql: Sql, userId: string, sub: SubscriptionInput, label: string | null): Promise<string> {
	const [{ n }] = await sql`select count(*)::int as n from push_subscriptions where user_id = ${userId}`;
	if (n >= 20) await sql`delete from push_subscriptions where id in (select id from push_subscriptions where user_id = ${userId} order by coalesce(last_used_at, created_at) limit 1)`;
	const [r] = await sql`insert into push_subscriptions (id, user_id, endpoint, p256dh, auth, device_label)
		values (${randomToken(24)}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${label?.slice(0, 80) ?? null})
		on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, failures = 0
		returning id`;
	return r.id as string;
}

export async function unsubscribe(sql: Sql, userId: string, endpoint: string) {
	await sql`delete from push_subscriptions where user_id = ${userId} and endpoint = ${endpoint}`;
}

export interface PushPayload {
	t: 'chat' | 'mitteilung' | 'test';
	title: string;
	body: string;
	url: string;
	tag?: string;
}

async function deliver(sql: Sql, sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<boolean> {
	if (env.PUSH_OUTBOX_DIR) {
		// Testbetrieb: statt zu senden als Datei ablegen
		await mkdir(env.PUSH_OUTBOX_DIR, { recursive: true });
		await writeFile(join(env.PUSH_OUTBOX_DIR, `${Date.now()}-${sub.id.slice(0, 6)}.json`), JSON.stringify({ endpoint: sub.endpoint, payload }));
		await sql`update push_subscriptions set last_used_at = now(), failures = 0 where id = ${sub.id}`;
		return true;
	}
	const keys = await vapidKeys(sql);
	try {
		await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
			TTL: payload.t === 'chat' ? 3600 : 86400,
			urgency: payload.t === 'chat' ? 'high' : 'normal',
			topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
			vapidDetails: { subject: (env.APP_URL || 'https://kinder-deutschlands.invalid').replace(/\/$/, ''), publicKey: keys.publicKey, privateKey: keys.privateKey },
			timeout: 10_000
		});
		await sql`update push_subscriptions set last_used_at = now(), failures = 0 where id = ${sub.id}`;
		return true;
	} catch (e) {
		const code = (e as { statusCode?: number }).statusCode;
		if (code === 404 || code === 410) await sql`delete from push_subscriptions where id = ${sub.id}`;
		else await sql`update push_subscriptions set failures = failures + 1 where id = ${sub.id}`;
		await sql`delete from push_subscriptions where id = ${sub.id} and failures >= 10`;
		return false;
	}
}

/** Community-Mitteilung als Push (nur wenn gewünscht, nicht in Ruhezeiten, ohne Inhalt). */
/**
 * Mitteilung als Push (nie mit Inhalt). Art bestimmt die Einstellung: community (Antworten, Moderation),
 * erinnerung (selbst gesetzte Erinnerungen), radar (Radar-Profil mit Push), force (dringende Hinweise, vorher geprüft).
 */
export async function pushNotice(
	sql: Sql,
	userId: string,
	link: string | null,
	opts: { force?: boolean; body?: string; kind?: 'community' | 'erinnerung' | 'radar' | 'markt' | 'wichtig' | 'warnung' | 'wetter'; ignoreQuiet?: boolean } = {}
) {
	const s = await getSettings(sql, userId);
	// wichtig = Rundnachrichten des Teams mit Push, wie dringende Hinweise (push_urgent); warnung = eigenes Warn-Abo mit Push (vorher geprüft)
	const allowed =
		opts.force ||
		(opts.kind === 'erinnerung' ? s.push_reminders : opts.kind === 'radar' ? true : opts.kind === 'markt' ? s.push_market : opts.kind === 'wetter' ? s.push_weather : opts.kind === 'wichtig' ? s.push_urgent : s.push_community);
	if (!allowed || (!opts.ignoreQuiet && inQuietHours(s, berlinMinutes()))) return;
	const subs = await sql`select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
	for (const sub of subs) await deliver(sql, sub as never, { t: 'mitteilung', title: 'Kinder Deutschlands', body: opts.body ?? 'Neue Mitteilung', url: link || '/profil/mitteilungen', tag: opts.kind ?? 'mitteilung' });
}

export async function pushTest(sql: Sql, userId: string): Promise<number> {
	const subs = await sql`select id, endpoint, p256dh, auth from push_subscriptions where user_id = ${userId}`;
	let ok = 0;
	for (const sub of subs) if (await deliver(sql, sub as never, { t: 'test', title: 'Kinder Deutschlands', body: 'Benachrichtigungen funktionieren.', url: '/profil/benachrichtigungen', tag: 'test' })) ok++;
	return ok;
}

interface GatewayNotification {
	room_id?: string;
	event_id?: string;
	counts?: { unread?: number };
	devices?: { app_id?: string; pushkey?: string }[];
}

/** Push-Gateway für den Chat-Server (Matrix Push-Gateway-API, Format „event_id_only“). */
export async function gateway(sql: Sql, body: { notification?: GatewayNotification }): Promise<{ rejected: string[] }> {
	const n = body.notification ?? {};
	const rejected: string[] = [];
	const minutes = berlinMinutes();
	for (const d of n.devices ?? []) {
		const key = String(d.pushkey ?? '');
		if (d.app_id !== PUSH_APP_ID || !key) {
			if (key) rejected.push(key);
			continue;
		}
		const [sub] = await sql`select s.id, s.endpoint, s.p256dh, s.auth, s.user_id, u.status from push_subscriptions s join users u on u.id = s.user_id where s.id = ${key}`;
		if (!sub || sub.status !== 'active') {
			rejected.push(key);
			continue;
		}
		// Nur Zähleränderung (z. B. auf anderem Gerät gelesen) – kein Hinweis nötig
		if (!n.event_id) continue;
		const s = await getSettings(sql, sub.user_id);
		if (!s.push_chat || inQuietHours(s, minutes)) continue;
		const url = n.room_id ? `/nachrichten/chat/${encodeURIComponent(n.room_id)}` : '/nachrichten';
		const ok = await deliver(sql, sub as never, { t: 'chat', title: 'Kinder Deutschlands', body: 'Neue Nachricht', url, tag: 'chat' });
		if (!ok) {
			const [still] = await sql`select 1 as x from push_subscriptions where id = ${key}`;
			if (!still) rejected.push(key);
		}
	}
	return { rejected };
}
