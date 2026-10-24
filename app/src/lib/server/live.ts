// F-037 / D-088: Ebene „Live unterwegs“. Vordergrund-Freigabe mit Pflicht-Ablauf. Der Server speichert nur die
// Rasterzelle (Mitte eines ca. 200-m-Rasters), nie den genauen Punkt; abgelaufene Freigaben sind sofort unsichtbar
// (Abfrage prüft expires_at) und werden minütlich gelöscht. Weder Export noch Log noch Verwaltung zeigen sie.
import type { Sql } from './db';
import type { Bbox } from './places';
import { areContacts } from './profiles';
import { cardFor, type Relation } from '$lib/visibility';
import { getProfile } from './profiles';
import { formatContactId } from './contactid';
import { mutedUntil } from './community/posts';

export const LIVE_AUDIENCES = { kontakte: 'Meine Kontakte', mitglieder: 'Alle Mitglieder' } as const;
export type LiveAudience = keyof typeof LIVE_AUDIENCES;
export const LIVE_MINUTES = [30, 60] as const;
export const LIVE_RADIUS_M = 200;
const STEP_LAT = 0.002; // ≈ 222 m
const STEP_LON = 0.003; // ≈ 205 m bei 52° N

export class LiveError extends Error {}

/** Rundet auf die Mitte der Rasterzelle. */
export function snap(lon: number, lat: number): { lon: number; lat: number } {
	const r = (v: number, s: number) => Math.round(((Math.floor(v / s) + 0.5) * s) * 1e6) / 1e6;
	return { lon: r(lon, STEP_LON), lat: r(lat, STEP_LAT) };
}

const validPos = (lon: number, lat: number) => Number.isFinite(lon) && Number.isFinite(lat) && lon >= 5.5 && lon <= 15.5 && lat >= 47 && lat <= 55.2;

export interface LiveOwn {
	audience: LiveAudience;
	lon: number;
	lat: number;
	expiresAt: Date;
}

export async function ownShare(sql: Sql, userId: string): Promise<LiveOwn | null> {
	const [r] = await sql`select audience, lon, lat, expires_at from live_shares where user_id = ${userId} and expires_at > now()`;
	return r ? { audience: r.audience as LiveAudience, lon: r.lon, lat: r.lat, expiresAt: r.expires_at } : null;
}

/** Startet eine Freigabe oder aktualisiert die Position (die Ablaufzeit bleibt, wie beim Start festgelegt). */
export async function startShare(sql: Sql, userId: string, p: { audience: string; minutes: number; lon: number; lat: number }) {
	if (!(p.audience in LIVE_AUDIENCES)) throw new LiveError('Unbekannte Freigabe-Stufe.');
	if (!(LIVE_MINUTES as readonly number[]).includes(p.minutes)) throw new LiveError('Bitte 30 oder 60 Minuten wählen.');
	if (!validPos(p.lon, p.lat)) throw new LiveError('Standort nicht nutzbar.');
	if (await mutedUntil(sql, userId)) throw new LiveError('Du kannst gerade nicht teilen (zeitweise eingeschränkt durch die Moderation).');
	const c = snap(p.lon, p.lat);
	await sql`insert into live_shares (user_id, audience, lon, lat, expires_at)
		values (${userId}, ${p.audience}, ${c.lon}, ${c.lat}, now() + ${p.minutes} * interval '1 minute')
		on conflict (user_id) do update set audience = excluded.audience, lon = excluded.lon, lat = excluded.lat, started_at = now(), updated_at = now(), expires_at = excluded.expires_at`;
	return ownShare(sql, userId);
}

export async function updatePosition(sql: Sql, userId: string, lon: number, lat: number): Promise<LiveOwn | null> {
	if (!validPos(lon, lat)) throw new LiveError('Standort nicht nutzbar.');
	const c = snap(lon, lat);
	await sql`update live_shares set lon = ${c.lon}, lat = ${c.lat}, updated_at = now() where user_id = ${userId} and expires_at > now()`;
	return ownShare(sql, userId);
}

export async function stopShare(sql: Sql, userId: string) {
	await sql`delete from live_shares where user_id = ${userId}`;
}

export async function purgeLive(sql: Sql): Promise<number> {
	const r = await sql`delete from live_shares where expires_at <= now()`;
	return r.count;
}

export interface LivePoint {
	id: string;
	name: string;
	lon: number;
	lat: number;
	minutesLeft: number;
	/** true = mein Kontakt, false = Mitglied, das ich nicht als Kontakt habe */
	contact: boolean;
}

/**
 * Sichtbare Freigaben für einen Betrachter. Nie die eigene, nie bei Blockade (egal wer blockiert hat), nur aktive
 * Konten, abgelaufene nie. Name nur nach Sichtbarkeit des Profils (D-015); ohne sichtbaren Namen: „Eine Familie“.
 */
export async function visibleShares(sql: Sql, viewerId: string, b: Bbox): Promise<LivePoint[]> {
	const rows = await sql`select s.id, s.user_id, s.audience, s.lon, s.lat, s.expires_at from live_shares s
		join users u on u.id = s.user_id and u.status = 'active'
		where s.expires_at > now() and s.user_id <> ${viewerId} and s.lon between ${b.w} and ${b.e} and s.lat between ${b.s} and ${b.n}
			and not exists(select 1 from blocks x where (x.blocker = s.user_id and x.blocked = ${viewerId}) or (x.blocker = ${viewerId} and x.blocked = s.user_id))
		order by s.updated_at desc limit 200`;
	const out: LivePoint[] = [];
	for (const r of rows) {
		const contact = await areContacts(sql, viewerId, r.user_id);
		if (r.audience === 'kontakte' && !contact) continue;
		const p = await getProfile(sql, r.user_id);
		if (!p) continue;
		const relation: Relation = contact ? 'kontakt' : 'mitglied';
		out.push({
			id: r.id,
			name: cardFor(p, relation).displayName ?? 'Eine Familie',
			lon: r.lon,
			lat: r.lat,
			contact,
			minutesLeft: Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / 60_000))
		});
	}
	return out;
}

/** Ziel für „Kontakt aufnehmen“: Familien-ID – nur, wenn die Freigabe für den Betrachter sichtbar ist. */
export async function contactTarget(sql: Sql, viewerId: string, shareId: string): Promise<string | null> {
	if (!/^[0-9a-f-]{36}$/i.test(shareId)) return null;
	const [s] = await sql`select s.user_id, s.audience from live_shares s join users u on u.id = s.user_id and u.status = 'active'
		where s.id = ${shareId} and s.expires_at > now() and s.user_id <> ${viewerId}
			and not exists(select 1 from blocks x where (x.blocker = s.user_id and x.blocked = ${viewerId}) or (x.blocker = ${viewerId} and x.blocked = s.user_id))`;
	if (!s) return null;
	if (s.audience === 'kontakte' && !(await areContacts(sql, viewerId, s.user_id))) return null;
	const p = await getProfile(sql, s.user_id);
	return p ? formatContactId(p.contact_id) : null;
}
