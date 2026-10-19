// Familienradar (M05): private Abonnements nach Region, Thema, Alter. Mehrere Profile, pausierbar.
// Übersicht im Portal jederzeit; Zusammenfassung per E-Mail/Push nur, wenn ausdrücklich gewählt – ohne Dubletten,
// mit Quellen, Datum, Fristen und Links. Push und Betreff verraten keine Themen.
import type { Sql } from '../db';
import { PostError, notify } from '../community/posts';
import { mailConfigured, sendMail } from '../mailer';
import { appUrl } from '../config';
import { listOccurrences, type EventItem } from './events';
import { listOffers } from './offers';
import { listNotices } from './notices';
import { berlinParts, berlinToUtc } from './recurrence';
import { AGE_GROUPS, AVAILABILITY, NOTICE_KINDS, RADAR_TOPICS, SOURCE_KINDS, ageLabel, isRadarTopic } from '$lib/angebote';

export const INCLUDE = { veranstaltungen: 'Veranstaltungen', angebote: 'Freie Plätze & Kurse', hinweise: 'Hinweise & Fristen' } as const;
export const FREQUENCIES = { woechentlich: 'Wöchentlich (montags)', taeglich: 'Täglich (morgens)', nur_portal: 'Nur hier im Portal' } as const;

export interface ProfileInput {
	name: string;
	regions: string[];
	topics: string[];
	include: string[];
	ageGroups: string[];
	frequency: string;
	viaEmail: boolean;
	viaPush: boolean;
}

export interface Profile extends ProfileInput {
	id: string;
	paused: boolean;
	lastSentAt: Date | null;
}

const rowToProfile = (r: Record<string, unknown>): Profile => ({
	id: r.id as string,
	name: r.name as string,
	regions: r.regions as string[],
	topics: r.topics as string[],
	include: r.include as string[],
	ageGroups: r.age_groups as string[],
	frequency: r.frequency as string,
	viaEmail: r.via_email as boolean,
	viaPush: r.via_push as boolean,
	paused: r.paused as boolean,
	lastSentAt: r.last_sent_at as Date | null
});

export async function profiles(sql: Sql, userId: string): Promise<Profile[]> {
	return (await sql`select * from radar_profiles where user_id = ${userId} order by created_at`).map(rowToProfile);
}

export async function getProfile(sql: Sql, userId: string, id: string): Promise<Profile | null> {
	const [r] = await sql`select * from radar_profiles where id = ${id} and user_id = ${userId}`;
	return r ? rowToProfile(r) : null;
}

export async function saveProfile(sql: Sql, userId: string, id: string | null, i: ProfileInput): Promise<string> {
	if (!i.name.trim()) throw new PostError('Bitte einen Namen für das Profil angeben.');
	if (i.regions.length > 10) throw new PostError('Höchstens 10 Regionen je Profil.');
	if (!(i.frequency in FREQUENCIES)) throw new PostError('Bitte die Häufigkeit wählen.');
	const include = i.include.filter((x) => x in INCLUDE);
	if (!include.length) throw new PostError('Bitte mindestens eine Art auswählen.');
	const regions = (await sql`select code from regions where code = any(${i.regions})`).map((r) => r.code as string);
	const topics = i.topics.filter(isRadarTopic);
	const ages = i.ageGroups.filter((a) => a in AGE_GROUPS);
	const viaEmail = i.frequency !== 'nur_portal' && i.viaEmail;
	const viaPush = i.frequency !== 'nur_portal' && i.viaPush;
	if (id) {
		const [r] = await sql`update radar_profiles set name = ${i.name.trim().slice(0, 80)}, regions = ${regions}, topics = ${topics}, include = ${include}, age_groups = ${ages},
			frequency = ${i.frequency}, via_email = ${viaEmail}, via_push = ${viaPush}, updated_at = now() where id = ${id} and user_id = ${userId} returning id`;
		if (!r) throw new PostError('Profil nicht gefunden.');
		return id;
	}
	const [{ n }] = await sql`select count(*)::int as n from radar_profiles where user_id = ${userId}`;
	if (n >= 5) throw new PostError('Höchstens 5 Radar-Profile.');
	const [r] = await sql`insert into radar_profiles (user_id, name, regions, topics, include, age_groups, frequency, via_email, via_push)
		values (${userId}, ${i.name.trim().slice(0, 80)}, ${regions}, ${topics}, ${include}, ${ages}, ${i.frequency}, ${viaEmail}, ${viaPush}) returning id`;
	return r.id as string;
}

export async function setPaused(sql: Sql, userId: string, id: string, paused: boolean) {
	await sql`update radar_profiles set paused = ${paused}, updated_at = now() where id = ${id} and user_id = ${userId}`;
}

export async function deleteProfile(sql: Sql, userId: string, id: string) {
	await sql`delete from radar_profiles where id = ${id} and user_id = ${userId}`;
}

export interface RadarItem {
	kind: 'event' | 'offer' | 'notice';
	id: string;
	version: string;
	title: string;
	when: Date | null;
	deadline: Date | null;
	meta: string;
	source: string;
	url: string;
	isNew: boolean;
}

/** Auswahl eines Profils. „isNew“: noch in keiner Zusammenfassung dieses Profils (gleiche Fassung). */
export async function select(sql: Sql, userId: string, p: Profile, opts: { days?: number } = {}): Promise<RadarItem[]> {
	const from = new Date();
	const to = new Date(from.getTime() + (opts.days ?? 14) * 86_400_000);
	const regions: (string | null)[] = p.regions.length ? p.regions : [null];
	const items: RadarItem[] = [];
	const base = appUrl();
	const seenEvent = new Set<string>();
	// Gefolgte Einrichtungen: deren Neues kommt unabhängig von Region und Themen dazu
	const followed = (await sql`select org_id from org_followers f join organizations o on o.id = f.org_id and o.status = 'verifiziert' where f.user_id = ${userId} limit 30`).map((r) => r.org_id as string);
	if (p.include.includes('veranstaltungen')) {
		const evs: EventItem[] = [];
		for (const r of regions) evs.push(...(await listOccurrences(sql, { id: userId }, { from, to, region: r, topics: p.topics, ages: p.ageGroups, limit: 120 })));
		for (const orgId of followed) evs.push(...(await listOccurrences(sql, { id: userId }, { from, to, orgId, ages: p.ageGroups, limit: 20 })));
		evs.sort((a, b) => a.start.getTime() - b.start.getTime());
		for (const e of evs) {
			if (e.cancelled || seenEvent.has(e.id)) continue; // je Serie nur der nächste Termin
			seenEvent.add(e.id);
			items.push({
				kind: 'event',
				id: e.id,
				version: e.date,
				title: e.title,
				when: e.start,
				deadline: null,
				meta: [e.recurring, e.regionName, ageLabel(e.ageMin, e.ageMax), e.costFree ? 'kostenlos' : e.costText].filter(Boolean).join(' · '),
				source: e.orgName ?? (e.origin === 'mitglied' ? 'Von einem Mitglied' : e.origin === 'import' ? 'Importiert' : 'Redaktion'),
				url: `${base}/veranstaltungen/${e.id}?am=${e.date}`,
				isNew: true
			});
		}
	}
	if (p.include.includes('angebote')) {
		const seen = new Set<string>();
		const lists = [...regions.map((r) => ({ region: r })), ...followed.map((orgId) => ({ orgId }))];
		for (const l of lists)
			for (const o of await listOffers(sql, { ...l, ages: p.ageGroups, onlyAvailable: true })) {
				if (seen.has(o.id)) continue;
				seen.add(o.id);
				items.push({
					kind: 'offer',
					id: o.id,
					version: `${o.availability}:${o.confirmedAt?.toISOString() ?? ''}`,
					title: o.title,
					when: null,
					deadline: null,
					meta: [AVAILABILITY[o.availability], o.scheduleText, o.regionName, ageLabel(o.ageMin, o.ageMax)].filter(Boolean).join(' · '),
					source: o.orgName,
					url: `${base}/angebote/${o.id}`,
					isNew: true
				});
			}
	}
	if (p.include.includes('hinweise')) {
		const seen = new Set<string>();
		const lists = [...regions.map((r) => ({ region: r, topics: p.topics })), ...(followed.length ? [{ orgIds: followed }] : [])];
		for (const l of lists)
			for (const n of (await listNotices(sql, { ...l, limit: 60 })).notices) {
				if (seen.has(n.id)) continue;
				seen.add(n.id);
				items.push({
					kind: 'notice',
					id: n.id,
					version: n.validFrom.toISOString(),
					title: n.title,
					when: null,
					deadline: n.deadline ? new Date(n.deadline) : null,
					meta: [NOTICE_KINDS[n.kind as keyof typeof NOTICE_KINDS], n.regionName].filter(Boolean).join(' · '),
					source: `${SOURCE_KINDS[n.sourceKind as keyof typeof SOURCE_KINDS]}${n.sourceName ? ` – ${n.sourceName}` : ''}`,
					url: n.sourceUrl ?? `${base}${n.link ?? '/hinweise'}`,
					isNew: true
				});
			}
	}
	if (items.length) {
		const sent = await sql`select item_kind, item_id::text as item_id, version from radar_sent where profile_id = ${p.id}`;
		const key = new Map(sent.map((s) => [`${s.item_kind}:${s.item_id}`, s.version as string]));
		for (const it of items) it.isNew = key.get(`${it.kind}:${it.id}`) !== it.version;
	}
	return items;
}

/** Text der Zusammenfassung – Betreff ohne Themen (Sperrbildschirm, geteilte Postfächer). */
export function digestText(name: string, items: RadarItem[], profileUrl: string): { subject: string; text: string } {
	const fmt = (d: Date) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	const day = (d: Date) => d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
	const block = (title: string, list: RadarItem[]) =>
		list.length
			? `${title}\n${list
					.map((i) => `• ${i.title}${i.when ? ` – ${fmt(i.when)}` : ''}${i.deadline ? ` – Frist ${day(i.deadline)}` : ''}\n  ${[i.meta, `Quelle: ${i.source}`].filter(Boolean).join(' · ')}\n  ${i.url}`)
					.join('\n')}\n\n`
			: '';
	const ev = items.filter((i) => i.kind === 'event');
	const of = items.filter((i) => i.kind === 'offer');
	const no = items.filter((i) => i.kind === 'notice');
	const fristen = no.filter((n) => n.deadline).sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime());
	const text = `Hallo,\n\nhier ist dein Familienradar „${name}“ (${items.length} neue Einträge).\n\n${block('FRISTEN', fristen)}${block('VERANSTALTUNGEN', ev)}${block('FREIE PLÄTZE UND KURSE', of)}${block('HINWEISE', no.filter((n) => !n.deadline))}Profil ändern, pausieren oder abbestellen: ${profileUrl}\n\nViele Grüße\nKinder Deutschlands`;
	return { subject: 'Dein Familienradar', text };
}

/** Fällig? Wöchentlich montags ab 7 Uhr, täglich ab 7 Uhr (deutsche Zeit) – je höchstens einmal. */
export function isDue(p: Pick<Profile, 'frequency' | 'paused' | 'lastSentAt' | 'viaEmail' | 'viaPush'>, now = new Date()): boolean {
	if (p.paused || p.frequency === 'nur_portal' || (!p.viaEmail && !p.viaPush)) return false;
	const c = berlinParts(now);
	if (c.h < 7) return false;
	const today7 = berlinToUtc({ y: c.y, m: c.m, d: c.d, h: 7, mi: 0 });
	if (p.frequency === 'taeglich') return !p.lastSentAt || p.lastSentAt < today7;
	const wd = (new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7;
	if (wd !== 0) return false;
	return !p.lastSentAt || p.lastSentAt < today7;
}

/** Zeitplan: fällige Zusammenfassungen erstellen und senden. Leere Zusammenfassungen werden nicht verschickt. */
export async function sendDigests(sql: Sql, now = new Date()): Promise<number> {
	const rows = await sql`select p.*, u.email, u.status from radar_profiles p join users u on u.id = p.user_id
		where not p.paused and p.frequency <> 'nur_portal' and (p.via_email or p.via_push) and u.status = 'active' limit 500`;
	let sent = 0;
	for (const r of rows) {
		const p = rowToProfile(r);
		if (!isDue(p, now)) continue;
		const items = (await select(sql, r.user_id, p, { days: p.frequency === 'taeglich' ? 3 : 14 })).filter((i) => i.isNew).slice(0, 60);
		await sql`update radar_profiles set last_sent_at = ${now} where id = ${p.id}`;
		if (!items.length) continue;
		const url = `${appUrl()}/radar/${p.id}`;
		if (p.viaEmail && mailConfigured()) {
			const d = digestText(p.name, items, url);
			await sendMail({ to: r.email, ...d }).catch((e) => console.error('[radar] E-Mail:', (e as Error).message));
		}
		await notify(sql, r.user_id, 'radar', `Familienradar „${p.name}“: ${items.length} neue Einträge`, `/radar/${p.id}`, p.viaPush ? { pushKind: 'radar', pushBody: 'Dein Familienradar ist da' } : { noPush: true });
		for (const it of items)
			await sql`insert into radar_sent (profile_id, item_kind, item_id, version) values (${p.id}, ${it.kind}, ${it.id}, ${it.version})
				on conflict (profile_id, item_kind, item_id) do update set version = excluded.version, sent_at = now()`;
		sent++;
	}
	return sent;
}

export { RADAR_TOPICS };
