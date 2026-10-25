// Wetter bei Veranstaltungen (F-056): Wetterwarnung zur Terminzeit anzeigen, Entscheidung des Veranstalters
// („findet trotzdem statt“ / „nach drinnen verlegt“) und einmalige Mitteilung an Mitkommende und Veranstalter.
// Quelle der Warnungen: DWD (nur Stufe 2 und höher). Wir entscheiden nichts – der Veranstalter entscheidet.
import type { Sql } from '../db';
import { PostError, notify } from '../community/posts';
import { audit } from '../audit';
import { LEVEL_LABEL } from '../warnings/cap';
import { canEdit, notifyAttendees, pgDate } from './events';
import { expand } from './recurrence';
import { regenAt, rainIn, regenText, regenTime, REGEN_LABEL, type Regen } from '../regen';

export const WEATHER_STATUS = { findet_statt: 'Findet trotz Warnung statt', drinnen: 'Nach drinnen verlegt' } as const;
export type WeatherStatus = keyof typeof WEATHER_STATUS;
/** Ab dieser DWD-Stufe zählt eine Warnung (1 = Frost, Böen – würde fast jeden Termin treffen). */
export const MIN_LEVEL = 2;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fmtDay = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

export interface TerminWarnung {
	id: string;
	level: number;
	label: string;
	headline: string;
	until: string | null;
}

/** Zeitfenster eines Termins: bis Ende, sonst 3 Stunden (ganztägig: 24 Stunden). */
export function windowOf(start: Date, end: Date | null, allDay: boolean): { from: Date; to: Date } {
	return { from: start, to: end ?? new Date(start.getTime() + (allDay ? 24 : 3) * 3600_000) };
}

/** Kreis eines Termins: über den Punkt, sonst über die gewählte Region. */
export async function kreisOfEvent(sql: Sql, eventId: string): Promise<string | null> {
	const [r] = await sql`select coalesce(
			(select k.code from regions k where k.level = 'kreis' and k.geom is not null and e.location is not null and ST_Intersects(k.geom, e.location) limit 1),
			case when e.region_code is not null then kd_kreis_of(e.region_code) end) as kreis
		from events e where e.id = ${eventId}`;
	return (r?.kreis as string | null) ?? null;
}

/** Punkt des Termins (Ort, sonst Mitte der Region) und ob er laut Eintrag drinnen stattfindet. */
export async function eventPoint(sql: Sql, eventId: string): Promise<{ lat: number; lon: number; indoor: boolean } | null> {
	const [r] = await sql`select coalesce(ST_Y(e.location), ST_Y(g.center)) as lat, coalesce(ST_X(e.location), ST_X(g.center)) as lon, e.setting
		from events e left join regions g on g.code = e.region_code where e.id = ${eventId}`;
	return r && r.lat != null && r.lon != null ? { lat: Number(r.lat), lon: Number(r.lon), indoor: r.setting === 'drinnen' } : null;
}

export type RegenFn = (lat: number, lon: number) => Promise<Regen | null>;
/** Regen im Fenster des Termins, nur bei Terminen in den nächsten 2 Stunden und nicht bei „drinnen“. */
export async function regenForEvent(sql: Sql, eventId: string, w: { from: Date; to: Date }, regen: RegenFn = regenAt, now = new Date()) {
	if (w.from.getTime() > now.getTime() + 115 * 60_000 || w.to.getTime() < now.getTime()) return null;
	const pt = await eventPoint(sql, eventId);
	if (!pt || pt.indoor) return null;
	const r = await regen(pt.lat, pt.lon);
	if (!r) return null;
	const hit = rainIn(r, new Date(Math.max(now.getTime(), w.from.getTime())), w.to);
	return hit ? { at: hit.at, level: hit.level, label: REGEN_LABEL[hit.level], time: regenTime(hit.at), text: regenText(r) } : null;
}

/** Aktive Wetterwarnungen (ab Stufe 2) im Kreis, die das Zeitfenster berühren. */
export async function warningsFor(sql: Sql, kreis: string, from: Date, to: Date): Promise<TerminWarnung[]> {
	const rows = await sql`select w.id, w.level, w.headline, w.expires
		from warnings w join warning_areas a on a.warning_id = w.id
		where a.kreis_code = ${kreis} and w.provider = 'dwd' and w.ended_at is null and w.level >= ${MIN_LEVEL}
			and (w.expires is null or w.expires >= ${from}) and coalesce(w.onset, w.sent) <= ${to}
		order by w.level desc, w.onset nulls first limit 5`;
	return rows.map((w) => ({ id: w.id as string, level: w.level as number, label: LEVEL_LABEL[w.level as number] ?? 'Warnung', headline: w.headline as string, until: w.expires ? (w.expires as Date).toISOString() : null }));
}

export async function statusOf(sql: Sql, eventId: string, occurrence: string) {
	const [s] = await sql`select status, note from event_weather where event_id = ${eventId} and occurrence = ${occurrence}`;
	return s ? { status: s.status as WeatherStatus, label: WEATHER_STATUS[s.status as WeatherStatus], note: s.note as string | null } : null;
}

/** Für die Terminseite: Warnungen zur Terminzeit und Entscheidung des Veranstalters. */
export async function terminWetter(sql: Sql, eventId: string, occurrence: string, start: Date, end: Date | null, allDay: boolean, regen: RegenFn = regenAt) {
	const kreis = await kreisOfEvent(sql, eventId);
	const w = windowOf(start, end, allDay);
	const [warnings, status, rain] = await Promise.all([kreis ? warningsFor(sql, kreis, w.from, w.to) : [], statusOf(sql, eventId, occurrence), Promise.race([regenForEvent(sql, eventId, w, regen), new Promise<null>((r) => setTimeout(() => r(null), 3000))]).catch(() => null)]);
	return { warnings, status, regen: rain };
}

/** Veranstalter: Entscheidung zu einem Termin setzen oder (status = null) zurücknehmen. Mitkommende werden benachrichtigt. */
export async function setWeatherStatus(sql: Sql, userId: string, eventId: string, occurrence: string, status: WeatherStatus | null, note: string) {
	if (!DAY.test(occurrence)) throw new PostError('Ungültiges Datum.');
	const [ev] = await sql`select id, title, created_by, org_id, origin, region_code, status, starts_at, ends_at, rrule, exdates from events where id = ${eventId}`;
	if (!ev || ev.status === 'entfernt' || !(await canEdit(sql, userId, ev as never))) throw new PostError('Termin nicht gefunden oder keine Berechtigung.');
	if (ev.status === 'abgesagt') throw new PostError('Dieser Termin ist abgesagt.');
	const day = new Date(`${occurrence}T12:00:00Z`);
	const occ = expand({ startsAt: ev.starts_at, endsAt: ev.ends_at, rrule: ev.rrule, exdates: (ev.exdates ?? []).map(pgDate) }, new Date(day.getTime() - 36 * 3600_000), new Date(day.getTime() + 36 * 3600_000), 10).find((o) => o.date === occurrence);
	if (!occ) throw new PostError('An diesem Tag gibt es keinen Termin.');
	if (occ.cancelled) throw new PostError('Dieser Tag ist abgesagt.');
	const n = note.trim().slice(0, 200);
	if (!status) {
		await sql`delete from event_weather where event_id = ${eventId} and occurrence = ${occurrence}`;
		await audit(sql, { actorId: userId, action: 'event.weather.cleared', targetType: 'event', targetId: eventId, meta: { occurrence } });
		return;
	}
	if (!(status in WEATHER_STATUS)) throw new PostError('Bitte eine Entscheidung wählen.');
	await sql`insert into event_weather (event_id, occurrence, status, note, set_by) values (${eventId}, ${occurrence}, ${status}, ${n || null}, ${userId})
		on conflict (event_id, occurrence) do update set status = excluded.status, note = excluded.note, set_by = excluded.set_by, at = now()`;
	await audit(sql, { actorId: userId, action: 'event.weather.set', targetType: 'event', targetId: eventId, meta: { occurrence, status } });
	const text = status === 'drinnen' ? 'findet wegen des Wetters drinnen statt' : 'findet trotz Wetterwarnung statt';
	await notifyAttendees(sql, eventId, occurrence, `„${ev.title}“ am ${fmtDay(occurrence)}: ${text}${n ? ` – ${n}` : ''}`, userId);
}

/**
 * Zeitplan: Termine der nächsten 48 Stunden, zu denen jemand „Ich komme“/„Interessiert“ gesagt hat. Gilt im Kreis zur Terminzeit
 * eine Warnung (Stufe 2+), bekommen die Mitkommenden und der Veranstalter einmal eine Mitteilung. Hat der Veranstalter schon
 * entschieden, bleibt es still. Chat-Treffen sind Ende-zu-Ende-verschlüsselt (kein Ort, keine Teilnehmerliste auf dem Server)
 * und hier bewusst nicht erfasst.
 */
export async function tickEventWeather(sql: Sql, deps: { regen?: RegenFn } = {}): Promise<number> {
	const evs = await sql`select e.id, e.title, e.created_by, e.starts_at, e.ends_at, e.all_day, e.rrule, e.exdates
		from events e where e.status = 'aktiv' and exists (
			select 1 from event_attendance a where a.event_id = e.id and a.occurrence between current_date - 1 and current_date + 2)`;
	const now = new Date();
	let sent = 0;
	for (const e of evs) {
		const kreis = await kreisOfEvent(sql, e.id as string);
		if (!kreis) continue;
		const occs = expand({ startsAt: e.starts_at, endsAt: e.ends_at, rrule: e.rrule, exdates: (e.exdates ?? []).map(pgDate) }, now, new Date(now.getTime() + 48 * 3600_000), 10);
		for (const o of occs) {
			if (o.cancelled) continue;
			const w = windowOf(o.start, o.end, e.all_day as boolean);
			if (w.to.getTime() < now.getTime()) continue;
			if (await statusOf(sql, e.id as string, o.date)) continue;
			const warns = await warningsFor(sql, kreis, w.from, w.to);
			// Ohne Warnung: Regen in der nächsten Stunde (F-057) – nur wenn der Termin bald beginnt oder läuft
			const top: { id: string; label: string; headline: string } | null = warns[0] ?? null;
			let rain: { time: string; label: string } | null = null;
			if (!top) {
				if (o.start.getTime() - now.getTime() > 75 * 60_000) continue;
				const r = await regenForEvent(sql, e.id as string, w, deps.regen ?? regenAt, now).catch(() => null);
				if (!r || new Date(r.at).getTime() - now.getTime() > 60 * 60_000) continue;
				rain = { time: r.time, label: r.label };
			}
			const rows = await sql`select user_id from event_attendance where event_id = ${e.id as string} and occurrence = ${o.date}`;
			const who = new Set<string>(rows.map((r) => r.user_id as string));
			if (e.created_by) who.add(e.created_by as string);
			for (const uid of who) {
				const [ins] = await sql`insert into event_weather_alerts (event_id, occurrence, user_id, warning_id) values (${e.id as string}, ${o.date}, ${uid}, ${top ? top.id : 'regen'})
					on conflict do nothing returning 1 as x`;
				if (!ins) continue;
				const owner = uid === e.created_by;
				const tail = owner ? 'Du kannst auf der Terminseite festhalten, ob es stattfindet.' : 'Prüfe, ob der Termin stattfindet.';
				const text = top
					? `${top.label} zur Terminzeit: „${e.title}“ am ${fmtDay(o.date)} – ${top.headline}. ${tail}`
					: `Regen erwartet: „${e.title}“ am ${fmtDay(o.date)} – ${rain!.label} ab ca. ${rain!.time} Uhr. ${tail}`;
				await notify(sql, uid, 'termin', text, `/veranstaltungen/${e.id}?am=${o.date}`, { pushKind: 'erinnerung' });
				sent++;
			}
		}
	}
	// Vermerke aufräumen
	await sql`delete from event_weather_alerts where at < now() - interval '14 days'`;
	return sent;
}
