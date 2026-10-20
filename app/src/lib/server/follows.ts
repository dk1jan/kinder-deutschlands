// Orte abonnieren (M11/M05): Wer einen Ort gemerkt und „Bei Änderungen benachrichtigen“ eingeschaltet hat,
// bekommt eine Mitteilung (Push nur mit Schalter „Radar“) bei neuen oder aufgehobenen Hinweisen und neuen Terminen dort.
import type { Sql } from './db';
import { notify } from './community/posts';
import { displayName } from '$lib/places';

export async function setPlaceNotify(sql: Sql, userId: string, placeId: string, on: boolean): Promise<boolean> {
	if (on) {
		const r = await sql`insert into place_favorites (user_id, place_id, notify) select ${userId}, id, true from places where id = ${placeId} and status = 'aktiv'
			on conflict (user_id, place_id) do update set notify = true returning 1`;
		return r.length > 0;
	}
	await sql`update place_favorites set notify = false where user_id = ${userId} and place_id = ${placeId}`;
	return false;
}

export async function placeLabel(sql: Sql, placeId: string): Promise<string | null> {
	const [p] = await sql`select p.kind, p.name, r.name as region_name from places p left join regions r on r.code = p.region_code where p.id = ${placeId}`;
	return p ? displayName(p.kind, p.name, p.region_name) : null;
}

/** Abonnenten eines Ortes benachrichtigen. text darf „{ort}“ enthalten (wird durch den Namen ersetzt). */
export async function notifyPlaceFollowers(sql: Sql, placeId: string, text: string, link: string | null, exceptUserId: string | null = null): Promise<number> {
	const rows = await sql`select f.user_id from place_favorites f join users u on u.id = f.user_id and u.status = 'active'
		where f.place_id = ${placeId} and f.notify ${exceptUserId ? sql`and f.user_id <> ${exceptUserId}` : sql``}`;
	if (!rows.length) return 0;
	const name = (await placeLabel(sql, placeId)) ?? 'Ort';
	const msg = text.replace('{ort}', name).slice(0, 300);
	for (const r of rows) await notify(sql, r.user_id, 'ort', msg, link ?? `/orte/${placeId}`, { pushKind: 'radar' });
	return rows.length;
}

export async function followedPlaces(sql: Sql, userId: string) {
	const rows = await sql`select p.id, p.kind, p.name, r.name as region_name from place_favorites f join places p on p.id = f.place_id
		left join regions r on r.code = p.region_code where f.user_id = ${userId} and f.notify order by f.created_at desc`;
	return rows.map((r) => ({ id: r.id as string, name: displayName(r.kind, r.name, r.region_name) }));
}
