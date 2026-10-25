// Veranstaltungen (M12): Anbieter-, Mitglieder-, Redaktions- und importierte Termine – klar unterschieden.
// Sichtbarkeit: „öffentlich“ = auch ohne Konto; „mitglieder“ = nur angemeldet; „privat“ = nur mit Link.
import type { Sql } from '../db';
import { randomToken } from '../crypto';
import { audit } from '../audit';
import { userCan } from '../roles';
import { PostError, notify } from '../community/posts';
import { checkText } from '../community/automod';
import { berlinDateKey, berlinParts, describeRule, expand, parseRule, RuleError, seriesUntil, type Occurrence } from './recurrence';
import { cleanUrl, intOrNull, regionAt, subtree } from './common';
import { orgRole } from './orgs';
import { notifyPlaceFollowers } from '../follows';
import { ACCESSIBILITY, EVENT_KINDS, SETTINGS, ageMatches, isRadarTopic } from '$lib/angebote';

export interface Viewer {
	id: string | null;
}

export interface EventInput {
	title: string;
	description: string;
	kind: string;
	topics: string[];
	startsAt: Date;
	endsAt: Date | null;
	allDay: boolean;
	repeat: 'nie' | 'woechentlich' | 'zweiwoechentlich' | 'monatlich_tag' | 'monatlich_wochentag' | 'taeglich' | 'beibehalten';
	repeatUntil: Date | null;
	placeId: string | null;
	lat: number | null;
	lon: number | null;
	address: string | null;
	regionCode: string | null;
	ageMin: number | null;
	ageMax: number | null;
	costFree: boolean | null;
	costText: string | null;
	discounts: string | null;
	freikarte: boolean;
	accessibility: string[];
	setting: string | null;
	capacity: number | null;
	registrationUrl: string | null;
	registrationDeadline: Date | null;
	waitlist: boolean;
	visibility: 'oeffentlich' | 'mitglieder' | 'privat';
}

/** Wiederholung aus der einfachen Auswahl der Oberfläche bauen. */
export function buildRule(repeat: EventInput['repeat'], start: Date, until: Date | null): string | null {
	if (repeat === 'nie') return null;
	const u = until ? `;UNTIL=${berlinDateKey(until).replace(/-/g, '')}` : '';
	const c = berlinParts(start);
	const wd = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][(new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7];
	switch (repeat) {
		case 'taeglich':
			return `FREQ=DAILY${u}`;
		case 'woechentlich':
			return `FREQ=WEEKLY;BYDAY=${wd}${u}`;
		case 'zweiwoechentlich':
			return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${wd}${u}`;
		case 'monatlich_tag':
			return `FREQ=MONTHLY${u}`;
		case 'monatlich_wochentag': {
			const n = Math.ceil(c.d / 7);
			return `FREQ=MONTHLY;BYDAY=${n >= 5 ? -1 : n}${wd}${u}`;
		}
	}
	return null;
}

/** Umkehrung von buildRule für das Bearbeiten-Formular. Nicht abbildbare Regeln → „beibehalten“. */
export function ruleToChoice(rrule: string | null, start: Date): { repeat: EventInput['repeat']; until: string | null } {
	if (!rrule) return { repeat: 'nie', until: null };
	const u = /UNTIL=(\d{4})(\d{2})(\d{2})/.exec(rrule);
	const until = u ? `${u[1]}-${u[2]}-${u[3]}` : null;
	const plain = rrule.replace(/;?UNTIL=[^;]+/, '');
	for (const r of ['taeglich', 'woechentlich', 'zweiwoechentlich', 'monatlich_tag', 'monatlich_wochentag'] as const) {
		if (buildRule(r, start, null) === plain) return { repeat: r, until };
	}
	return { repeat: 'beibehalten', until };
}

function validate(i: EventInput) {
	if (i.title.trim().length < 3) throw new PostError('Titel zu kurz.');
	if (!(i.kind in EVENT_KINDS)) throw new PostError('Bitte die Art wählen.');
	if (Number.isNaN(i.startsAt.getTime())) throw new PostError('Bitte Beginn angeben.');
	if (i.endsAt && i.endsAt < i.startsAt) throw new PostError('Ende liegt vor dem Beginn.');
	if (i.endsAt && i.endsAt.getTime() - i.startsAt.getTime() > 31 * 86_400_000) throw new PostError('Ein Termin dauert höchstens 31 Tage – für Längeres bitte eine Wiederholung wählen.');
	if (i.startsAt.getTime() > Date.now() + 2 * 366 * 86_400_000) throw new PostError('Beginn liegt zu weit in der Zukunft.');
	if (i.ageMin !== null && i.ageMax !== null && i.ageMin > i.ageMax) throw new PostError('Alter: „von“ ist größer als „bis“.');
	if (i.setting && !(i.setting in SETTINGS)) throw new PostError('Ungültige Angabe drinnen/draußen.');
	if (i.accessibility.some((a) => !(a in ACCESSIBILITY))) throw new PostError('Ungültige Angabe zur Zugänglichkeit.');
	if (!['oeffentlich', 'mitglieder', 'privat'].includes(i.visibility)) throw new PostError('Ungültige Sichtbarkeit.');
	if ((i.lat === null) !== (i.lon === null)) throw new PostError('Ort unvollständig.');
}

async function where(sql: Sql, i: EventInput, orgId: string | null) {
	let lat = i.lat, lon = i.lon, address = i.address?.trim() || null;
	if (i.placeId) {
		const [p] = await sql`select ST_Y(location) as lat, ST_X(location) as lon, name from places where id = ${i.placeId} and status = 'aktiv'`;
		if (!p) throw new PostError('Ort nicht gefunden.');
		lat = p.lat;
		lon = p.lon;
		address ??= p.name;
	} else if (lat === null && orgId) {
		const [o] = await sql`select ST_Y(location) as lat, ST_X(location) as lon, address from organizations where id = ${orgId}`;
		if (o?.lat != null) {
			lat = o.lat;
			lon = o.lon;
			address ??= o.address;
		}
	}
	const region = i.regionCode ?? (lat !== null ? await regionAt(sql, lon!, lat) : null);
	return { lat, lon, address, region };
}

type Who = { origin: 'anbieter' | 'mitglied' | 'redaktion'; orgId: string | null };

async function originFor(sql: Sql, userId: string, orgId: string | null, asRedaktion: boolean): Promise<Who> {
	if (orgId) {
		if (!(await orgRole(sql, userId, orgId))) throw new PostError('Dafür fehlt die Berechtigung für diese Einrichtung.');
		return { origin: 'anbieter', orgId };
	}
	if (asRedaktion) {
		if (!(await userCan(sql, userId, 'events.edit'))) throw new PostError('Keine Berechtigung für Redaktionstermine.');
		return { origin: 'redaktion', orgId: null };
	}
	return { origin: 'mitglied', orgId: null };
}

export async function createEvent(sql: Sql, userId: string, i: EventInput, opts: { orgId?: string | null; asRedaktion?: boolean } = {}): Promise<{ id: string; held: boolean; shareToken: string | null }> {
	validate(i);
	const who = await originFor(sql, userId, opts.orgId ?? null, !!opts.asRedaktion);
	if (who.origin === 'mitglied') {
		// Mitglieder: im Netzwerk oder privat; offen im Internet nur Einrichtungen und Redaktion
		if (i.visibility === 'oeffentlich') i.visibility = 'mitglieder';
		// FreiKarte gilt nur bestätigt (Anbieter/Redaktion)
		i.freikarte = false;
		const [{ n }] = await sql`select count(*)::int as n from events where created_by = ${userId} and created_at > now() - interval '1 day'`;
		if (n >= 10) throw new PostError('Heute schon viele Termine angelegt. Bitte morgen weitermachen.');
	}
	let rrule: string | null;
	try {
		rrule = buildRule(i.repeat, i.startsAt, i.repeatUntil);
		if (rrule) parseRule(rrule);
	} catch (e) {
		throw new PostError(e instanceof RuleError ? e.message : 'Wiederholung ungültig.');
	}
	const loc = await where(sql, i, who.orgId);
	const until = seriesUntil({ startsAt: i.startsAt, endsAt: i.endsAt, rrule, exdates: [] });
	// Vormarkierung wie in der Community: private Daten oder Drohungen → erst prüfen
	const flags = who.origin === 'mitglied' ? checkText(`${i.title}\n${i.description}`) : [];
	const hold = flags.some((f) => f.hold);
	const shareToken = i.visibility === 'privat' ? randomToken(15) : null;
	const [e] = await sql`insert into events (title, description, kind, topics, origin, org_id, created_by, place_id, location, address, region_code,
			starts_at, ends_at, all_day, rrule, series_until, age_min, age_max, cost_free, cost_text, discounts, freikarte, accessibility, setting,
			capacity, registration_url, registration_deadline, waitlist, visibility, share_token, status)
		values (${i.title.trim()}, ${i.description.trim()}, ${i.kind}, ${i.topics.filter(isRadarTopic).length ? i.topics.filter(isRadarTopic) : ['freizeit']}, ${who.origin}, ${who.orgId}, ${userId},
			${i.placeId}, ${loc.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${loc.lon}, ${loc.lat}), 4326)` : null}, ${loc.address}, ${loc.region},
			${i.startsAt}, ${i.endsAt}, ${i.allDay}, ${rrule}, ${until}, ${i.ageMin}, ${i.ageMax}, ${i.costFree}, ${i.costText}, ${i.discounts}, ${i.freikarte},
			${i.accessibility}, ${i.setting}, ${i.capacity}, ${cleanUrl(i.registrationUrl, 'Anmelde-Link')}, ${i.registrationDeadline}, ${i.waitlist},
			${i.visibility}, ${shareToken}, ${hold ? 'pruefung' : 'aktiv'})
		returning id`;
	if (flags.length) {
		const top = flags.sort((a, b) => a.priority - b.priority)[0];
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, priority, region_code)
			values ('event', ${e.id}, 'automatisch', ${top.reason}, ${flags.map((f) => f.detail).join(' · ').slice(0, 500)}, ${top.priority}, ${loc.region})`;
	}
	await audit(sql, { actorId: userId, action: 'event.created', targetType: 'event', targetId: e.id, meta: { origin: who.origin } });
	if (i.placeId && !hold && i.visibility !== 'privat')
		await notifyPlaceFollowers(sql, i.placeId, `Neuer Termin am Ort {ort}: ${i.title.trim()}`, `/veranstaltungen/${e.id}`, userId);
	return { id: e.id as string, held: hold, shareToken };
}

export async function canEdit(sql: Sql, userId: string | null, ev: { created_by: string | null; org_id: string | null; origin: string; region_code: string | null }) {
	if (!userId) return false;
	if (ev.org_id) return !!(await orgRole(sql, userId, ev.org_id));
	if (ev.origin === 'mitglied' && ev.created_by === userId) return true;
	if (ev.origin === 'redaktion' || ev.origin === 'import') {
		const { regionPath } = await import('../roles');
		return userCan(sql, userId, 'events.edit', ev.region_code ? { regionPath: await regionPath(sql, ev.region_code) } : undefined);
	}
	return false;
}

async function loadForEdit(sql: Sql, userId: string, id: string) {
	const [ev] = await sql`select id, created_by, org_id, origin, region_code, status, starts_at, ends_at, rrule, exdates, title, locked_fields, source_key from events where id = ${id}`;
	if (!ev || ev.status === 'entfernt' || !(await canEdit(sql, userId, ev as never))) throw new PostError('Termin nicht gefunden oder keine Berechtigung.');
	return ev;
}

export async function updateEvent(sql: Sql, userId: string, id: string, i: EventInput) {
	const ev = await loadForEdit(sql, userId, id);
	validate(i);
	if (ev.origin === 'mitglied' && i.visibility === 'oeffentlich') i.visibility = 'mitglieder';
	if (ev.origin === 'mitglied') i.freikarte = false;
	let rrule: string | null;
	try {
		// „beibehalten“: eine Regel, die die einfache Auswahl nicht abbilden kann (z. B. aus einem Import), bleibt unverändert
		rrule = i.repeat === 'beibehalten' ? (ev.rrule as string | null) : buildRule(i.repeat, i.startsAt, i.repeatUntil);
		if (rrule) parseRule(rrule);
	} catch (e) {
		throw new PostError(e instanceof RuleError ? e.message : 'Wiederholung ungültig.');
	}
	const loc = await where(sql, i, ev.org_id);
	const until = seriesUntil({ startsAt: i.startsAt, endsAt: i.endsAt, rrule, exdates: ev.exdates ?? [] });
	// Importierte Termine: redaktionell geänderte Felder werden gesperrt und beim nächsten Abruf nicht überschrieben
	const locks = ev.source_key ? [...new Set([...(ev.locked_fields ?? []), 'title', 'description', 'starts_at', 'ends_at', 'location'])] : ev.locked_fields ?? [];
	const [cur] = await sql`select share_token from events where id = ${id}`;
	await sql`update events set title = ${i.title.trim()}, description = ${i.description.trim()}, kind = ${i.kind}, topics = ${i.topics.filter(isRadarTopic).length ? i.topics.filter(isRadarTopic) : ['freizeit']},
		place_id = ${i.placeId}, location = ${loc.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${loc.lon}, ${loc.lat}), 4326)` : null}, address = ${loc.address}, region_code = ${loc.region},
		starts_at = ${i.startsAt}, ends_at = ${i.endsAt}, all_day = ${i.allDay}, rrule = ${rrule}, series_until = ${until},
		age_min = ${i.ageMin}, age_max = ${i.ageMax}, cost_free = ${i.costFree}, cost_text = ${i.costText}, discounts = ${i.discounts}, freikarte = ${i.freikarte},
		accessibility = ${i.accessibility}, setting = ${i.setting}, capacity = ${i.capacity}, registration_url = ${cleanUrl(i.registrationUrl, 'Anmelde-Link')},
		registration_deadline = ${i.registrationDeadline}, waitlist = ${i.waitlist}, visibility = ${i.visibility},
		share_token = ${i.visibility === 'privat' ? (cur.share_token ?? randomToken(15)) : null}, locked_fields = ${locks}, checked_at = now(), updated_at = now()
		where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'event.updated', targetType: 'event', targetId: id });
	await notifyAttendees(sql, id, null, `Der Termin „${i.title.trim()}“ wurde geändert.`, userId);
}

/** Ganze Serie oder einzelnen Termin absagen (bleibt sichtbar als „abgesagt“). */
export async function cancelEvent(sql: Sql, userId: string, id: string, occurrence: string | null, note: string) {
	const ev = await loadForEdit(sql, userId, id);
	if (occurrence) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrence)) throw new PostError('Ungültiges Datum.');
		await sql`update events set exdates = array(select distinct unnest(exdates || ${[occurrence]}::date[])), updated_at = now() where id = ${id}`;
	} else {
		await sql`update events set status = 'abgesagt', cancel_note = ${note.trim().slice(0, 300) || null}, updated_at = now() where id = ${id}`;
	}
	await audit(sql, { actorId: userId, action: 'event.cancelled', targetType: 'event', targetId: id, meta: { occurrence } });
	await notifyAttendees(sql, id, occurrence, `Abgesagt: „${ev.title}“${occurrence ? ` am ${new Date(occurrence).toLocaleDateString('de-DE')}` : ''}${note.trim() ? ` – ${note.trim()}` : ''}`, userId);
	// Absage als regionaler Hinweis (M20), damit sie im Radar erscheint
	await sql`insert into notices (kind, title, body, topics, region_code, source_kind, org_id, event_id, valid_until, created_by)
		select 'absage', ${'Abgesagt: ' + ev.title}, ${note.trim().slice(0, 500)}, topics, region_code, case when org_id is not null then 'anbieter' else 'redaktion' end, org_id, id,
			${occurrence ? new Date(`${occurrence}T23:59:59Z`) : sql`coalesce(series_until, ends_at, starts_at)`}, ${userId}
		from events where id = ${id} and origin <> 'mitglied' and visibility <> 'privat'`;
}

export async function restoreOccurrence(sql: Sql, userId: string, id: string, occurrence: string) {
	await loadForEdit(sql, userId, id);
	await sql`update events set exdates = array_remove(exdates, ${occurrence}::date), updated_at = now() where id = ${id}`;
}

export async function removeEvent(sql: Sql, userId: string, id: string) {
	await loadForEdit(sql, userId, id);
	await sql`update events set status = 'entfernt', updated_at = now() where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'event.removed', targetType: 'event', targetId: id });
}

export async function notifyAttendees(sql: Sql, eventId: string, occurrence: string | null, text: string, exceptUserId: string) {
	const rows = await sql`select distinct user_id from event_attendance where event_id = ${eventId} ${occurrence ? sql`and occurrence = ${occurrence}` : sql`and occurrence >= current_date`}
		union select user_id from saved_items where kind = 'event' and item_id = ${eventId}`;
	for (const r of rows) if (r.user_id !== exceptUserId) await notify(sql, r.user_id, 'termin', text, `/veranstaltungen/${eventId}${occurrence ? `?am=${occurrence}` : ''}`);
}

// ---------- Lesen ----------
export interface ListFilter {
	from: Date;
	to: Date;
	region?: string | null;
	kinds?: string[];
	ages?: string[];
	free?: boolean;
	setting?: string | null;
	freikarte?: boolean;
	q?: string | null;
	near?: { lat: number; lon: number; km: number } | null;
	/** Kartenausschnitt [West, Süd, Ost, Nord] – nur Termine mit Ort darin */
	bbox?: [number, number, number, number] | null;
	orgId?: string | null;
	topics?: string[];
	mine?: boolean;
	limit?: number;
}

export interface EventItem {
	id: string;
	title: string;
	kind: string;
	origin: string;
	orgName: string | null;
	orgSlug: string | null;
	date: string;
	start: Date;
	end: Date | null;
	allDay: boolean;
	cancelled: boolean;
	recurring: string | null;
	regionName: string | null;
	address: string | null;
	lat: number | null;
	lon: number | null;
	ageMin: number | null;
	ageMax: number | null;
	costFree: boolean | null;
	costText: string | null;
	freikarte: boolean;
	setting: string | null;
	visibility: string;
	distanceKm: number | null;
}

/** SQL-Teil: Was darf diese Person sehen? */
function visible(sql: Sql, v: Viewer) {
	if (!v.id) return sql`e.visibility = 'oeffentlich' and e.status in ('aktiv', 'abgesagt')`;
	return sql`(
		(e.status in ('aktiv', 'abgesagt') and (e.visibility in ('oeffentlich', 'mitglieder')
			or exists(select 1 from event_attendance a where a.event_id = e.id and a.user_id = ${v.id})))
		or e.created_by = ${v.id}
		or (e.org_id is not null and exists(select 1 from org_members m where m.org_id = e.org_id and m.user_id = ${v.id}))
	) and e.status <> 'entfernt'
	and not (e.origin = 'mitglied' and exists(select 1 from blocks b where (b.blocker = e.created_by and b.blocked = ${v.id}) or (b.blocker = ${v.id} and b.blocked = e.created_by)))`;
}

export async function listOccurrences(sql: Sql, v: Viewer, f: ListFilter): Promise<EventItem[]> {
	const to = new Date(Math.min(f.to.getTime(), f.from.getTime() + 400 * 86_400_000));
	const q = f.q?.trim().slice(0, 80) || null;
	const rows = await sql`select e.id, e.title, e.kind, e.origin, e.starts_at, e.ends_at, e.all_day, e.rrule, e.exdates, e.status, e.address,
			ST_Y(e.location) as lat, ST_X(e.location) as lon, e.age_min, e.age_max, e.cost_free, e.cost_text, e.freikarte, e.setting, e.visibility,
			o.name as org_name, o.slug as org_slug, r.name as region_name
			${f.near ? sql`, ST_Distance(e.location::geography, ST_SetSRID(ST_MakePoint(${f.near.lon}, ${f.near.lat}), 4326)::geography) / 1000 as km` : sql`, null::float as km`}
		from events e left join organizations o on o.id = e.org_id left join regions r on r.code = e.region_code
		where ${visible(sql, v)}
			and (e.org_id is null or o.status = 'verifiziert' ${v.id ? sql`or exists(select 1 from org_members m where m.org_id = e.org_id and m.user_id = ${v.id})` : sql``})
			and e.starts_at < ${to} and coalesce(e.series_until, 'infinity'::timestamptz) >= ${f.from}
			${f.region ? sql`and e.region_code in ${subtree(sql, f.region)}` : sql``}
			${f.kinds?.length ? sql`and e.kind = any(${f.kinds})` : sql``}
			${f.topics?.length ? sql`and e.topics && ${f.topics}` : sql``}
			${f.free ? sql`and e.cost_free = true` : sql``}
			${f.freikarte ? sql`and e.freikarte` : sql``}
			${f.setting === 'drinnen' ? sql`and e.setting in ('drinnen', 'beides')` : f.setting === 'draussen' ? sql`and e.setting in ('draussen', 'beides')` : sql``}
			${q ? sql`and (e.title ilike ${'%' + q + '%'} or e.description ilike ${'%' + q + '%'} or o.name ilike ${'%' + q + '%'})` : sql``}
			${f.near ? sql`and ST_DWithin(e.location::geography, ST_SetSRID(ST_MakePoint(${f.near.lon}, ${f.near.lat}), 4326)::geography, ${f.near.km * 1000})` : sql``}
			${f.bbox ? sql`and e.location && ST_MakeEnvelope(${f.bbox[0]}, ${f.bbox[1]}, ${f.bbox[2]}, ${f.bbox[3]}, 4326)` : sql``}
			${f.orgId ? sql`and e.org_id = ${f.orgId}` : sql``}
			${f.mine && v.id ? sql`and (e.created_by = ${v.id} or exists(select 1 from event_attendance a where a.event_id = e.id and a.user_id = ${v.id}))` : sql``}
		limit 1500`;
	const out: EventItem[] = [];
	for (const r of rows) {
		if (!ageMatches(r.age_min, r.age_max, f.ages ?? [])) continue;
		let occ: Occurrence[];
		try {
			occ = expand({ startsAt: r.starts_at, endsAt: r.ends_at, rrule: r.rrule, exdates: (r.exdates ?? []).map(pgDate) }, f.from, to, 120);
		} catch {
			continue;
		}
		for (const o of occ)
			out.push({
				id: r.id,
				title: r.title,
				kind: r.kind,
				origin: r.origin,
				orgName: r.org_name,
				orgSlug: r.org_slug,
				date: o.date,
				start: o.start,
				end: o.end,
				allDay: r.all_day,
				cancelled: r.status === 'abgesagt' || o.cancelled,
				recurring: describeRule(r.rrule),
				regionName: r.region_name,
				address: r.address,
				lat: r.lat,
				lon: r.lon,
				ageMin: r.age_min,
				ageMax: r.age_max,
				costFree: r.cost_free,
				costText: r.cost_text,
				freikarte: r.freikarte,
				setting: r.setting,
				visibility: r.visibility,
				distanceKm: r.km !== null && r.km !== undefined ? Math.round(Number(r.km) * 10) / 10 : null
			});
	}
	out.sort((a, b) => a.start.getTime() - b.start.getTime() || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
	return out.slice(0, f.limit ?? 300);
}

/** Datumswerte aus Postgres (date) kommen als Date um Mitternacht UTC – als Kalendertag lesen. */
export const pgDate = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));

export async function getEvent(sql: Sql, v: Viewer, id: string, token: string | null) {
	const [e] = await sql`select e.*, ST_Y(e.location) as lat, ST_X(e.location) as lon, o.name as org_name, o.slug as org_slug, o.status as org_status,
			r.name as region_name, p.name as place_name, s.name as source_name, s.attribution as source_attribution
		from events e left join organizations o on o.id = e.org_id left join regions r on r.code = e.region_code
			left join places p on p.id = e.place_id left join data_sources s on s.key = e.source_key
		where e.id = ${id}`;
	if (!e || e.status === 'entfernt') return null;
	const editor = await canEdit(sql, v.id, e as never);
	const byToken = !!token && !!e.share_token && token === e.share_token;
	if (!editor) {
		if (e.status === 'pruefung' || e.status === 'archiviert') return null;
		if (e.org_id && e.org_status !== 'verifiziert') return null;
		if (e.visibility === 'mitglieder' && !v.id) return { needsLogin: true as const };
		if (e.visibility === 'privat' && !byToken) {
			const [a] = v.id ? await sql`select 1 as x from event_attendance where event_id = ${id} and user_id = ${v.id} limit 1` : [];
			if (!a) return null;
		}
		if (e.origin === 'mitglied' && v.id) {
			const [b] = await sql`select 1 as x from blocks where (blocker = ${e.created_by} and blocked = ${v.id}) or (blocker = ${v.id} and blocked = ${e.created_by})`;
			if (b) return null;
		}
	}
	const exdates = (e.exdates ?? []).map(pgDate);
	const occurrences = expand({ startsAt: e.starts_at, endsAt: e.ends_at, rrule: e.rrule, exdates }, new Date(Date.now() - 86_400_000), new Date(Date.now() + 180 * 86_400_000), 30);
	const counts = await sql`select occurrence, count(*) filter (where status = 'interessiert')::int as interessiert, count(*) filter (where status = 'komme_mit')::int as komme_mit
		from event_attendance where event_id = ${id} group by occurrence`;
	const mine = v.id ? await sql`select occurrence, status, show_me from event_attendance where event_id = ${id} and user_id = ${v.id}` : [];
	return {
		needsLogin: false as const,
		editor,
		event: {
			id: e.id as string,
			title: e.title as string,
			description: e.description as string,
			kind: e.kind as string,
			topics: e.topics as string[],
			origin: e.origin as string,
			org: e.org_id ? { name: e.org_name as string, slug: e.org_slug as string } : null,
			createdByMe: v.id !== null && e.created_by === v.id,
			place: e.place_id ? { id: e.place_id as string, name: e.place_name as string } : null,
			address: e.address as string | null,
			lat: e.lat as number | null,
			lon: e.lon as number | null,
			regionName: e.region_name as string | null,
			startsAt: e.starts_at as Date,
			endsAt: e.ends_at as Date | null,
			allDay: e.all_day as boolean,
			rrule: e.rrule as string | null,
			recurring: describeRule(e.rrule),
			exdates,
			ageMin: e.age_min as number | null,
			ageMax: e.age_max as number | null,
			costFree: e.cost_free as boolean | null,
			costText: e.cost_text as string | null,
			discounts: e.discounts as string | null,
			freikarte: e.freikarte as boolean,
			accessibility: e.accessibility as string[],
			setting: e.setting as string | null,
			capacity: e.capacity as number | null,
			registrationUrl: e.registration_url as string | null,
			registrationDeadline: e.registration_deadline as Date | null,
			waitlist: e.waitlist as boolean,
			visibility: e.visibility as string,
			shareToken: editor ? (e.share_token as string | null) : null,
			status: e.status as string,
			cancelNote: e.cancel_note as string | null,
			source: e.source_key ? { name: e.source_name as string, attribution: e.source_attribution as string, url: e.source_url as string | null } : null,
			checkedAt: e.checked_at as Date,
			updatedAt: e.updated_at as Date,
			hasChat: !!e.chat_room_id
		},
		occurrences,
		counts: Object.fromEntries(counts.map((c) => [pgDate(c.occurrence), { interessiert: c.interessiert as number, kommeMit: c.komme_mit as number }])),
		mine: Object.fromEntries(mine.map((m) => [pgDate(m.occurrence), { status: m.status as string, showMe: m.show_me as boolean }]))
	};
}

/** „Interessiert“ / „Komme mit“ – unverbindlich, keine Buchung beim Anbieter. */
export async function setAttendance(sql: Sql, userId: string, id: string, occurrence: string, status: 'interessiert' | 'komme_mit' | null, showMe: boolean) {
	const d = await getEvent(sql, { id: userId }, id, null);
	if (!d || d.needsLogin) throw new PostError('Termin nicht gefunden.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrence)) throw new PostError('Ungültiges Datum.');
	const day = new Date(`${occurrence}T12:00:00Z`);
	const occ = expand({ startsAt: d.event.startsAt, endsAt: d.event.endsAt, rrule: d.event.rrule, exdates: d.event.exdates }, new Date(day.getTime() - 86_400_000), new Date(day.getTime() + 86_400_000), 5).find((o) => o.date === occurrence);
	if (!occ) throw new PostError('An diesem Tag findet der Termin nicht statt.');
	if (!status) {
		await sql`delete from event_attendance where event_id = ${id} and user_id = ${userId} and occurrence = ${occurrence}`;
		return;
	}
	if (occ.cancelled || d.event.status === 'abgesagt') throw new PostError('Dieser Termin ist abgesagt.');
	await sql`insert into event_attendance (event_id, user_id, occurrence, status, show_me) values (${id}, ${userId}, ${occurrence}, ${status}, ${status === 'komme_mit' && showMe})
		on conflict (event_id, user_id, occurrence) do update set status = excluded.status, show_me = excluded.show_me`;
}

/** „Wer kommt mit?“ – nur Personen, die sich ausdrücklich sichtbar gemacht haben; Name nur, wenn für Mitglieder sichtbar. */
export async function whoComes(sql: Sql, viewerId: string, id: string, occurrence: string) {
	const rows = await sql`select a.user_id, p.display_name, p.contact_id, p.visibility from event_attendance a join user_profiles p on p.user_id = a.user_id
		join users u on u.id = a.user_id and u.status = 'active'
		where a.event_id = ${id} and a.occurrence = ${occurrence} and a.status = 'komme_mit' and a.show_me
			and not exists(select 1 from blocks b where (b.blocker = a.user_id and b.blocked = ${viewerId}) or (b.blocker = ${viewerId} and b.blocked = a.user_id))
		order by a.created_at limit 100`;
	return rows.map((r) => ({
		me: r.user_id === viewerId,
		name: r.display_name && ['alle', 'mitglieder'].includes(r.visibility?.display_name) ? (r.display_name as string) : 'Ein Mitglied',
		contactId: r.contact_id as string
	}));
}

/** „Was machen wir heute?“ – Termine des Tages plus passende Orte aus der Familienkarte. */
export async function todayIdeas(sql: Sql, v: Viewer, f: { day: Date; region: string | null; near: { lat: number; lon: number; km: number } | null; ages: string[]; setting: string | null; free: boolean }) {
	const from = f.day;
	const to = new Date(from.getTime() + 86_400_000);
	const events = (await listOccurrences(sql, v, { from, to, region: f.region, near: f.near, ages: f.ages, setting: f.setting, free: f.free, limit: 40 })).filter((e) => !e.cancelled);
	const kinds = f.setting === 'drinnen' ? ['indoorspielplatz', 'schwimmbad', 'familiencafe'] : f.setting === 'draussen' ? ['spielplatz', 'ausflugsort'] : ['spielplatz', 'indoorspielplatz', 'ausflugsort', 'familiencafe', 'schwimmbad'];
	const places = await sql`select p.id, p.kind, p.name, r.name as region_name, ST_Y(p.location) as lat, ST_X(p.location) as lon
			${f.near ? sql`, ST_Distance(p.location::geography, ST_SetSRID(ST_MakePoint(${f.near.lon}, ${f.near.lat}), 4326)::geography) / 1000 as km` : sql`, null::float as km`}
		from places p left join regions r on r.code = p.region_code
		where p.status = 'aktiv' and p.kind = any(${kinds})
			${f.region ? sql`and p.region_code in ${subtree(sql, f.region)}` : sql``}
			${f.near ? sql`and ST_DWithin(p.location::geography, ST_SetSRID(ST_MakePoint(${f.near.lon}, ${f.near.lat}), 4326)::geography, ${f.near.km * 1000})` : sql``}
		order by ${f.near ? sql`km` : sql`(p.kind <> 'spielplatz') desc, md5(p.id::text || current_date::text)`} limit 12`;
	return {
		events,
		places: places.map((p) => ({ id: p.id as string, kind: p.kind as string, name: p.name as string, regionName: p.region_name as string | null, km: p.km !== null ? Math.round(Number(p.km) * 10) / 10 : null }))
	};
}

export const EVENT_INT = { intOrNull };
