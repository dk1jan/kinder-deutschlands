// Formulare → Eingaben der Module. Uhrzeiten aus dem Browser sind deutsche Ortszeit (datetime-local).
import { PostError } from '../community/posts';
import { berlinToUtc, berlinParts } from './recurrence';
import type { EventInput } from './events';
import type { OfferInput } from './offers';
import type { OrgInput } from './orgs';
import type { NoticeInput } from './notices';
import type { ProfileInput } from './radar';
import { isUuid } from './common';

const str = (f: FormData, k: string, max = 8000) => String(f.get(k) ?? '').trim().slice(0, max);
const opt = (f: FormData, k: string, max = 500) => str(f, k, max) || null;
const num = (f: FormData, k: string): number | null => {
	const v = str(f, k, 20);
	if (!v) return null;
	const n = Number(v.replace(',', '.'));
	if (!Number.isFinite(n)) throw new PostError('Ungültige Zahl.');
	return n;
};
const int = (f: FormData, k: string, min: number, max: number): number | null => {
	const n = num(f, k);
	if (n === null) return null;
	if (!Number.isInteger(n) || n < min || n > max) throw new PostError(`Zahl zwischen ${min} und ${max} angeben.`);
	return n;
};

/** „2026-10-24T14:30“ (Ortszeit) → Zeitpunkt; „2026-10-24“ → 0:00 Ortszeit. */
export function localToDate(v: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(v.trim());
	if (!m) return null;
	return berlinToUtc({ y: +m[1], m: +m[2], d: +m[3], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 });
}

/** Zeitpunkt → Wert für datetime-local (Ortszeit). */
export function dateToLocal(d: Date | null, dateOnly = false): string {
	if (!d) return '';
	const c = berlinParts(new Date(d));
	const p = (n: number) => String(n).padStart(2, '0');
	return dateOnly ? `${c.y}-${p(c.m)}-${p(c.d)}` : `${c.y}-${p(c.m)}-${p(c.d)}T${p(c.h)}:${p(c.mi)}`;
}

function point(f: FormData) {
	const lat = num(f, 'lat'), lon = num(f, 'lon');
	if ((lat === null) !== (lon === null)) throw new PostError('Ort unvollständig.');
	if (lat !== null && (lat < 47 || lat > 56 || lon! < 5 || lon! > 16)) throw new PostError('Ort liegt nicht in Deutschland.');
	return { lat, lon };
}

export function eventFromForm(f: FormData): EventInput {
	const allDay = f.get('all_day') === 'on';
	const startRaw = str(f, allDay ? 'start_date' : 'start', 20) || str(f, 'start', 20);
	const startsAt = localToDate(allDay ? startRaw.slice(0, 10) : startRaw);
	if (!startsAt) throw new PostError('Bitte Beginn angeben.');
	const endRaw = str(f, allDay ? 'end_date' : 'end', 20);
	let endsAt = endRaw ? localToDate(allDay ? endRaw.slice(0, 10) : endRaw) : null;
	if (allDay && endsAt) endsAt = new Date(endsAt.getTime() + 23 * 3600_000 + 59 * 60_000);
	const placeId = str(f, 'place_id', 40);
	const { lat, lon } = point(f);
	return {
		title: str(f, 'title', 160),
		description: str(f, 'description', 8000),
		kind: str(f, 'kind', 30),
		topics: f.getAll('topics').map(String),
		startsAt,
		endsAt,
		allDay,
		repeat: (str(f, 'repeat', 30) || 'nie') as EventInput['repeat'],
		repeatUntil: str(f, 'repeat_until', 10) ? localToDate(str(f, 'repeat_until', 10)) : null,
		placeId: isUuid(placeId) ? placeId : null,
		lat,
		lon,
		address: opt(f, 'address', 300),
		regionCode: opt(f, 'region_code', 30),
		ageMin: int(f, 'age_min', 0, 18),
		ageMax: int(f, 'age_max', 0, 18),
		costFree: f.get('cost') === 'frei' ? true : f.get('cost') === 'kosten' ? false : null,
		costText: opt(f, 'cost_text', 200),
		discounts: opt(f, 'discounts', 300),
		freikarte: f.get('freikarte') === 'on',
		accessibility: f.getAll('accessibility').map(String),
		setting: opt(f, 'setting', 20),
		capacity: int(f, 'capacity', 1, 100000),
		registrationUrl: opt(f, 'registration_url', 500),
		registrationDeadline: str(f, 'registration_deadline', 20) ? localToDate(str(f, 'registration_deadline', 20)) : null,
		waitlist: f.get('waitlist') === 'on',
		visibility: (str(f, 'visibility', 20) || 'mitglieder') as EventInput['visibility']
	};
}

export function offerFromForm(f: FormData): OfferInput {
	const placeId = str(f, 'place_id', 40);
	const { lat, lon } = point(f);
	return {
		title: str(f, 'title', 160),
		description: str(f, 'description', 5000),
		kind: str(f, 'kind', 30),
		topics: f.getAll('topics').map(String),
		ageMin: int(f, 'age_min', 0, 18),
		ageMax: int(f, 'age_max', 0, 18),
		scheduleText: opt(f, 'schedule_text', 300),
		startsOn: opt(f, 'starts_on', 10),
		costText: opt(f, 'cost_text', 200),
		freikarte: f.get('freikarte') === 'on',
		registrationUrl: opt(f, 'registration_url', 500),
		contact: opt(f, 'contact', 300),
		placeId: isUuid(placeId) ? placeId : null,
		address: opt(f, 'address', 300),
		lat,
		lon
	};
}

export function orgFromForm(f: FormData): OrgInput {
	const { lat, lon } = point(f);
	return {
		name: str(f, 'name', 160),
		kind: str(f, 'kind', 30),
		description: str(f, 'description', 5000),
		topics: f.getAll('topics').map(String),
		regionCode: opt(f, 'region_code', 30),
		address: opt(f, 'address', 300),
		lat,
		lon,
		website: opt(f, 'website', 300),
		email: opt(f, 'email', 200),
		phone: opt(f, 'phone', 60)
	};
}

export function noticeFromForm(f: FormData): NoticeInput {
	const until = str(f, 'valid_until', 10);
	return {
		kind: str(f, 'kind', 30),
		title: str(f, 'title', 200),
		body: str(f, 'body', 1200),
		topics: f.getAll('topics').map(String),
		regionCode: opt(f, 'region_code', 30),
		sourceKind: (str(f, 'source_kind', 20) || 'redaktion') as NoticeInput['sourceKind'],
		sourceUrl: opt(f, 'source_url', 500),
		validUntil: until ? localToDate(`${until}T23:59`) : null,
		deadline: opt(f, 'deadline', 10),
		urgent: f.get('urgent') === 'on'
	};
}

export function profileFromForm(f: FormData): ProfileInput {
	return {
		name: str(f, 'name', 80),
		regions: f.getAll('regions').map(String).filter(Boolean).slice(0, 10),
		topics: f.getAll('topics').map(String),
		include: f.getAll('include').map(String),
		ageGroups: f.getAll('ages').map(String),
		frequency: str(f, 'frequency', 20) || 'woechentlich',
		viaEmail: f.get('via_email') === 'on',
		viaPush: f.get('via_push') === 'on'
	};
}

/** Formularwerte als Liste je Feld – zum Wiederbefüllen nach Fehlern und zum Bearbeiten. */
export type FormValues = Record<string, string[]>;

export function formValues(f: FormData): FormValues {
	const out: FormValues = {};
	for (const [k, v] of f.entries()) if (typeof v === 'string') (out[k] ??= []).push(v.slice(0, 8000));
	return out;
}

interface EventLike {
	title: string;
	description: string;
	kind: string;
	topics: string[];
	startsAt: Date;
	endsAt: Date | null;
	allDay: boolean;
	rrule: string | null;
	place: { id: string } | null;
	lat: number | null;
	lon: number | null;
	address: string | null;
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
	visibility: string;
}

export function eventValues(e: EventLike, choice: { repeat: string; until: string | null }, regionCode: string | null): FormValues {
	const s = (v: unknown) => (v === null || v === undefined ? [] : [String(v)]);
	return {
		title: [e.title],
		description: [e.description ?? ''],
		kind: [e.kind],
		topics: e.topics,
		start: [dateToLocal(e.startsAt)],
		end: s(e.endsAt && !e.allDay ? dateToLocal(e.endsAt) : null),
		start_date: [dateToLocal(e.startsAt, true)],
		end_date: s(e.endsAt && e.allDay ? dateToLocal(e.endsAt, true) : null),
		all_day: e.allDay ? ['on'] : [],
		repeat: [choice.repeat],
		repeat_until: s(choice.until),
		place_id: s(e.place?.id),
		lat: s(e.place ? null : e.lat),
		lon: s(e.place ? null : e.lon),
		address: s(e.address),
		region_code: s(regionCode),
		age_min: s(e.ageMin),
		age_max: s(e.ageMax),
		cost: e.costFree === true ? ['frei'] : e.costFree === false ? ['kosten'] : [],
		cost_text: s(e.costText),
		discounts: s(e.discounts),
		freikarte: e.freikarte ? ['on'] : [],
		accessibility: e.accessibility,
		setting: s(e.setting),
		capacity: s(e.capacity),
		registration_url: s(e.registrationUrl),
		registration_deadline: s(e.registrationDeadline ? dateToLocal(e.registrationDeadline) : null),
		waitlist: e.waitlist ? ['on'] : [],
		visibility: [e.visibility]
	};
}
