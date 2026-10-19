// Freie Plätze und Kurse (M17): nur von verifizierten Einrichtungen, mit Zeitstempel und Gültigkeit.
// Ist die Angabe abgelaufen oder fehlt sie, heißt es „Verfügbarkeit unbekannt“ – nie „frei“.
import type { Sql } from '../db';
import { audit } from '../audit';
import { notify, PostError } from '../community/posts';
import { cleanUrl, regionAt, subtree } from './common';
import { requireOrgRole } from './orgs';
import { AVAILABILITY, OFFER_KINDS, ageMatches, isRadarTopic, type Availability } from '$lib/angebote';

export interface OfferInput {
	title: string;
	description: string;
	kind: string;
	topics: string[];
	ageMin: number | null;
	ageMax: number | null;
	scheduleText: string | null;
	startsOn: string | null;
	costText: string | null;
	freikarte: boolean;
	registrationUrl: string | null;
	contact: string | null;
	placeId: string | null;
	address: string | null;
	lat: number | null;
	lon: number | null;
}

export const VALID_DAYS = [3, 7, 14, 30] as const;

/** Was die Oberfläche zeigt: Angabe nur, solange sie gültig ist. */
export function effectiveAvailability(o: { availability: string; availability_until: Date | string | null }, now = new Date()): Availability {
	if (!o.availability_until || new Date(o.availability_until) < now) return 'unbekannt';
	return (o.availability in AVAILABILITY ? o.availability : 'unbekannt') as Availability;
}

function validate(i: OfferInput) {
	if (i.title.trim().length < 3) throw new PostError('Titel zu kurz.');
	if (!(i.kind in OFFER_KINDS)) throw new PostError('Bitte die Art wählen.');
	if (i.ageMin !== null && i.ageMax !== null && i.ageMin > i.ageMax) throw new PostError('Alter: „von“ ist größer als „bis“.');
	if (i.startsOn && !/^\d{4}-\d{2}-\d{2}$/.test(i.startsOn)) throw new PostError('Ungültiges Startdatum.');
}

async function location(sql: Sql, orgId: string, i: OfferInput) {
	let lat = i.lat, lon = i.lon, address = i.address?.trim() || null;
	if (i.placeId) {
		const [p] = await sql`select ST_Y(location) as lat, ST_X(location) as lon, name from places where id = ${i.placeId}`;
		if (p) ({ lat, lon } = p), (address ??= p.name);
	}
	if (lat === null) {
		const [o] = await sql`select ST_Y(location) as lat, ST_X(location) as lon, address, region_code from organizations where id = ${orgId}`;
		if (o?.lat != null) ({ lat, lon } = o), (address ??= o.address);
		if (lat === null) return { lat, lon, address, region: o?.region_code ?? null };
	}
	return { lat, lon, address, region: await regionAt(sql, lon!, lat!) };
}

export async function saveOffer(sql: Sql, userId: string, orgId: string, id: string | null, i: OfferInput): Promise<string> {
	await requireOrgRole(sql, userId, orgId);
	validate(i);
	const loc = await location(sql, orgId, i);
	const topics = i.topics.filter(isRadarTopic);
	const geo = loc.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${loc.lon}, ${loc.lat}), 4326)` : null;
	if (id) {
		const [r] = await sql`update offers set title = ${i.title.trim()}, description = ${i.description.trim()}, kind = ${i.kind}, topics = ${topics}, age_min = ${i.ageMin}, age_max = ${i.ageMax},
			schedule_text = ${i.scheduleText}, starts_on = ${i.startsOn}, cost_text = ${i.costText}, freikarte = ${i.freikarte}, registration_url = ${cleanUrl(i.registrationUrl, 'Anmelde-Link')},
			contact = ${i.contact}, place_id = ${i.placeId}, address = ${loc.address}, location = ${geo}, region_code = ${loc.region}, updated_at = now()
			where id = ${id} and org_id = ${orgId} and status <> 'entfernt' returning id`;
		if (!r) throw new PostError('Angebot nicht gefunden.');
		await audit(sql, { actorId: userId, action: 'offer.updated', targetType: 'offer', targetId: id });
		return id;
	}
	const [r] = await sql`insert into offers (org_id, title, description, kind, topics, age_min, age_max, schedule_text, starts_on, cost_text, freikarte, registration_url, contact,
			place_id, address, location, region_code, created_by)
		values (${orgId}, ${i.title.trim()}, ${i.description.trim()}, ${i.kind}, ${topics}, ${i.ageMin}, ${i.ageMax}, ${i.scheduleText}, ${i.startsOn}, ${i.costText}, ${i.freikarte},
			${cleanUrl(i.registrationUrl, 'Anmelde-Link')}, ${i.contact}, ${i.placeId}, ${loc.address}, ${geo}, ${loc.region}, ${userId}) returning id`;
	await audit(sql, { actorId: userId, action: 'offer.created', targetType: 'offer', targetId: r.id });
	return r.id as string;
}

/** Verfügbarkeit melden bzw. erneut bestätigen – gilt für die gewählte Anzahl Tage. */
export async function confirmAvailability(sql: Sql, userId: string, offerId: string, availability: Availability, placesCount: number | null, validDays: number) {
	const [o] = await sql`select org_id, title, availability as old from offers where id = ${offerId} and status = 'aktiv'`;
	if (!o) throw new PostError('Angebot nicht gefunden.');
	await requireOrgRole(sql, userId, o.org_id);
	if (!(availability in AVAILABILITY) || availability === 'unbekannt') throw new PostError('Bitte eine Verfügbarkeit wählen.');
	if (!(VALID_DAYS as readonly number[]).includes(validDays)) throw new PostError('Bitte die Gültigkeit wählen.');
	if (placesCount !== null && (placesCount < 0 || placesCount > 9999)) throw new PostError('Ungültige Anzahl Plätze.');
	await sql`update offers set availability = ${availability}, places_count = ${placesCount}, availability_until = now() + make_interval(days => ${validDays}),
		availability_confirmed_at = now(), availability_confirmed_by = ${userId}, reminder_sent_at = null, updated_at = now() where id = ${offerId}`;
	await audit(sql, { actorId: userId, action: 'offer.availability', targetType: 'offer', targetId: offerId, meta: { availability, validDays } });
	// Neu frei geworden → als Hinweis „Neu“ für das Radar (nicht als Sofort-Push)
	if ((availability === 'frei' || availability === 'wenige') && o.old !== 'frei' && o.old !== 'wenige')
		await sql`insert into notices (kind, title, topics, region_code, source_kind, org_id, offer_id, valid_until, created_by)
			select 'neu', ${'Freie Plätze: ' + o.title}, topics, region_code, 'anbieter', org_id, id, now() + make_interval(days => ${validDays}), ${userId} from offers where id = ${offerId}`;
}

export async function endOffer(sql: Sql, userId: string, offerId: string) {
	const [o] = await sql`select org_id from offers where id = ${offerId}`;
	if (!o) throw new PostError('Angebot nicht gefunden.');
	await requireOrgRole(sql, userId, o.org_id);
	await sql`update offers set status = 'beendet', updated_at = now() where id = ${offerId}`;
}

export interface OfferFilter {
	region?: string | null;
	kinds?: string[];
	ages?: string[];
	onlyAvailable?: boolean;
	orgId?: string | null;
	q?: string | null;
}

export async function listOffers(sql: Sql, f: OfferFilter) {
	const q = f.q?.trim().slice(0, 80) || null;
	const rows = await sql`select f.*, o.name as org_name, o.slug as org_slug, r.name as region_name from offers f join organizations o on o.id = f.org_id and o.status = 'verifiziert'
		left join regions r on r.code = f.region_code
		where f.status = 'aktiv'
			${f.region ? sql`and f.region_code in ${subtree(sql, f.region)}` : sql``}
			${f.kinds?.length ? sql`and f.kind = any(${f.kinds})` : sql``}
			${f.orgId ? sql`and f.org_id = ${f.orgId}` : sql``}
			${q ? sql`and (f.title ilike ${'%' + q + '%'} or f.description ilike ${'%' + q + '%'} or o.name ilike ${'%' + q + '%'})` : sql``}
		order by (f.availability_until > now() and f.availability in ('frei', 'wenige')) desc, f.availability_confirmed_at desc nulls last, f.title limit 300`;
	return rows
		.map((r) => ({
			id: r.id as string,
			title: r.title as string,
			kind: r.kind as string,
			orgName: r.org_name as string,
			orgSlug: r.org_slug as string,
			regionName: r.region_name as string | null,
			ageMin: r.age_min as number | null,
			ageMax: r.age_max as number | null,
			scheduleText: r.schedule_text as string | null,
			startsOn: r.starts_on as Date | null,
			costText: r.cost_text as string | null,
			freikarte: r.freikarte as boolean,
			availability: effectiveAvailability(r as never),
			placesCount: effectiveAvailability(r as never) === 'unbekannt' ? null : (r.places_count as number | null),
			confirmedAt: r.availability_confirmed_at as Date | null,
			validUntil: r.availability_until as Date | null
		}))
		.filter((o) => ageMatches(o.ageMin, o.ageMax, f.ages ?? []) && (!f.onlyAvailable || o.availability === 'frei' || o.availability === 'wenige'));
}

export async function getOffer(sql: Sql, id: string, viewerId: string | null) {
	const [r] = await sql`select f.*, ST_Y(f.location) as lat, ST_X(f.location) as lon, o.name as org_name, o.slug as org_slug, o.status as org_status, r.name as region_name
		from offers f join organizations o on o.id = f.org_id left join regions r on r.code = f.region_code where f.id = ${id}`;
	if (!r || r.status === 'entfernt') return null;
	const { orgRole } = await import('./orgs');
	const role = await orgRole(sql, viewerId, r.org_id);
	if (r.org_status !== 'verifiziert' && !role) return null;
	return { ...(r as Record<string, unknown>), effective: effectiveAvailability(r as never), editor: !!role } as Record<string, unknown> & { effective: Availability; editor: boolean };
}

/** Zeitplan: abgelaufene Verfügbarkeit → Einrichtung um Bestätigung bitten (einmal je Ablauf). */
export async function remindReconfirm(sql: Sql): Promise<number> {
	const due = await sql`select f.id, f.title, f.org_id from offers f join organizations o on o.id = f.org_id and o.status = 'verifiziert'
		where f.status = 'aktiv' and f.availability_until is not null and f.availability_until < now() and f.reminder_sent_at is null limit 100`;
	for (const d of due) {
		const staff = await sql`select user_id from org_members where org_id = ${d.org_id}`;
		for (const s of staff) await notify(sql, s.user_id, 'einrichtung', `Bitte Verfügbarkeit bestätigen: „${d.title}“ – bis dahin steht dort „Verfügbarkeit unbekannt“.`, `/angebote/${d.id}`);
		await sql`update offers set reminder_sent_at = now() where id = ${d.id}`;
	}
	return due.length;
}
