// Familien-Marktplatz (M09): kaufen, verkaufen, tauschen, verschenken, suchen – nur für Mitglieder.
// Kein Bezahl-, Versand- oder Treuhandsystem. Ort nur grob (Mittelpunkt der gewählten Region), Übergabe privat vereinbaren.
// Kontakt über die Familien-ID: Kontaktanfrage mit Bezug zur Anzeige, danach verschlüsselter Chat.
import type { Sql } from '../db';
import { audit } from '../audit';
import { PostError, notify } from '../community/posts';
import { checkText, holdMessage } from '../community/automod';
import { storeImage, deleteImageFile } from '../community/media';
import { areContacts, isBlockedEither } from '../profiles';
import { ContactError, sendRequest } from '../contacts';
import { subtree } from '../angebote/common';
import { CONDITIONS, MARKET_CATEGORIES, MARKET_KINDS, SAFETY_CATEGORIES } from '$lib/alltag';

export const LIMITS = { active: 30, perDay: 15, images: 6, searches: 10, days: 30 };

export interface ListingInput {
	kind: string;
	category: string;
	title: string;
	description: string;
	priceCents: number | null;
	negotiable: boolean;
	condition: string | null;
	sizeText: string | null;
	ageMin: number | null;
	ageMax: number | null;
	regionCode: string | null;
	safetyAck: boolean;
	privateSeller: boolean;
}

function validate(i: ListingInput) {
	if (!(i.kind in MARKET_KINDS)) throw new PostError('Bitte wählen: verkaufen, verschenken, tauschen oder suchen.');
	if (!(i.category in MARKET_CATEGORIES)) throw new PostError('Bitte eine Kategorie wählen.');
	if (i.title.trim().length < 3) throw new PostError('Titel zu kurz.');
	if (i.title.length > 120) throw new PostError('Titel zu lang (höchstens 120 Zeichen).');
	if (i.description.length > 4000) throw new PostError('Beschreibung zu lang.');
	if (i.condition && !(i.condition in CONDITIONS)) throw new PostError('Ungültiger Zustand.');
	if (i.kind === 'verkaufen' && i.priceCents === null && !i.negotiable) throw new PostError('Bitte einen Preis angeben oder „Verhandlungssache“ wählen.');
	if (i.priceCents !== null && (i.priceCents < 0 || i.priceCents > 10_000_000)) throw new PostError('Ungültiger Preis.');
	if (i.ageMin !== null && i.ageMax !== null && i.ageMin > i.ageMax) throw new PostError('Alter: „von“ ist größer als „bis“.');
	if (!i.regionCode) throw new PostError('Bitte die Gegend angeben (Stadtteil oder Ort) – ohne Adresse.');
	if (!i.privateSeller) throw new PostError('Der Marktplatz ist derzeit nur für private Angebote. Bitte bestätigen.');
	if (i.kind !== 'suchen' && SAFETY_CATEGORIES.includes(i.category) && !i.safetyAck)
		throw new PostError('Bei Autositzen, Babyschalen und Kinderwagen bitte bestätigen, dass die Angaben zu Zustand, Unfallfreiheit und Vollständigkeit stimmen.');
}

/** Grober Ort: Mittelpunkt der Region – nie die Adresse der Person. */
const coarse = (sql: Sql, code: string) => sql`(select coalesce(center, ST_PointOnSurface(geom)) from regions where code = ${code})`;

export async function createListing(sql: Sql, userId: string, i: ListingInput, images: { data: Buffer; alt: string | null }[] = []) {
	validate(i);
	if (images.length > LIMITS.images) throw new PostError(`Höchstens ${LIMITS.images} Bilder.`);
	const [{ active, today, same }] = await sql`select
			count(*) filter (where status in ('verfuegbar', 'reserviert', 'pruefung'))::int as active,
			count(*) filter (where created_at > now() - interval '1 day')::int as today,
			count(*) filter (where lower(title) = lower(${i.title.trim()}) and created_at > now() - interval '7 days' and status <> 'entfernt')::int as same
		from market_listings where user_id = ${userId}`;
	if (active >= LIMITS.active) throw new PostError(`Du hast schon ${LIMITS.active} aktive Anzeigen. Bitte erst alte als abgegeben markieren.`);
	if (today >= LIMITS.perDay) throw new PostError('Heute schon viele Anzeigen. Bitte morgen weitermachen.');
	if (same) throw new PostError('Diese Anzeige gibt es schon. Du kannst sie verlängern statt neu einzustellen.');
	const [r] = await sql`select code from regions where code = ${i.regionCode}`;
	if (!r) throw new PostError('Gegend nicht gefunden.');
	const flags = checkText(`${i.title}\n${i.description}`);
	const hold = flags.some((f) => f.hold);
	const [l] = await sql`insert into market_listings (user_id, kind, category, title, description, price_cents, negotiable, condition, size_text, age_min, age_max,
			region_code, location, safety_ack, status)
		values (${userId}, ${i.kind}, ${i.category}, ${i.title.trim()}, ${i.description.trim()}, ${i.kind === 'verschenken' || i.kind === 'tauschen' ? null : i.priceCents},
			${i.negotiable}, ${i.condition}, ${i.sizeText}, ${i.ageMin}, ${i.ageMax}, ${i.regionCode}, ${coarse(sql, i.regionCode!)}, ${i.safetyAck}, ${hold ? 'pruefung' : 'verfuegbar'})
		returning id`;
	for (const img of images) await storeImage(sql, img.data, { ownerId: userId, purpose: 'markt', alt: img.alt, maxSide: 1600 }).then((id) => sql`update media set listing_id = ${l.id} where id = ${id}`);
	if (flags.length) {
		const top = [...flags].sort((a, b) => a.priority - b.priority)[0];
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, priority, region_code)
			values ('listing', ${l.id}, 'automatisch', ${top.reason}, ${flags.map((f) => f.detail).join(' · ').slice(0, 500)}, ${top.priority}, ${i.regionCode})`;
	}
	await audit(sql, { actorId: userId, action: 'listing.created', targetType: 'listing', targetId: l.id });
	return { id: l.id as string, held: hold ? holdMessage(flags) : null };
}

async function own(sql: Sql, userId: string, id: string) {
	const [l] = await sql`select id, user_id, status, region_code from market_listings where id = ${id}`;
	if (!l || l.user_id !== userId || l.status === 'entfernt') throw new PostError('Anzeige nicht gefunden.');
	return l;
}

export async function updateListing(sql: Sql, userId: string, id: string, i: ListingInput) {
	const cur = await own(sql, userId, id);
	validate(i);
	const flags = checkText(`${i.title}\n${i.description}`);
	const hold = flags.some((f) => f.hold);
	await sql`update market_listings set kind = ${i.kind}, category = ${i.category}, title = ${i.title.trim()}, description = ${i.description.trim()},
		price_cents = ${i.kind === 'verschenken' || i.kind === 'tauschen' ? null : i.priceCents}, negotiable = ${i.negotiable}, condition = ${i.condition},
		size_text = ${i.sizeText}, age_min = ${i.ageMin}, age_max = ${i.ageMax}, region_code = ${i.regionCode}, location = ${coarse(sql, i.regionCode!)},
		safety_ack = ${i.safetyAck}, status = ${hold ? 'pruefung' : cur.status === 'pruefung' ? 'pruefung' : cur.status}, updated_at = now() where id = ${id}`;
	if (hold) {
		const top = [...flags].sort((a, b) => a.priority - b.priority)[0];
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, priority, region_code)
			values ('listing', ${id}, 'automatisch', ${top.reason}, ${flags.map((f) => f.detail).join(' · ').slice(0, 500)}, ${top.priority}, ${i.regionCode})`;
	}
	return hold ? holdMessage(flags) : null;
}

export async function addImages(sql: Sql, userId: string, id: string, images: { data: Buffer; alt: string | null }[]) {
	await own(sql, userId, id);
	const [{ n }] = await sql`select count(*)::int as n from media where listing_id = ${id} and status <> 'entfernt'`;
	if (n + images.length > LIMITS.images) throw new PostError(`Höchstens ${LIMITS.images} Bilder.`);
	for (const img of images) {
		const mid = await storeImage(sql, img.data, { ownerId: userId, purpose: 'markt', alt: img.alt, maxSide: 1600 });
		await sql`update media set listing_id = ${id} where id = ${mid}`;
	}
}

export async function removeImage(sql: Sql, userId: string, id: string, mediaId: string) {
	await own(sql, userId, id);
	const [m] = await sql`delete from media where id = ${mediaId} and listing_id = ${id} returning id`;
	if (m) await deleteImageFile(mediaId);
}

/** Status durch die anbietende Person: verfügbar, reserviert, abgegeben. */
export async function setStatus(sql: Sql, userId: string, id: string, status: 'verfuegbar' | 'reserviert' | 'abgegeben') {
	const cur = await own(sql, userId, id);
	if (!['verfuegbar', 'reserviert', 'abgegeben'].includes(status)) throw new PostError('Ungültiger Status.');
	if (cur.status === 'pruefung') throw new PostError('Die Anzeige wird noch geprüft.');
	if (cur.status === 'abgelaufen' && status !== 'abgegeben') throw new PostError('Bitte zuerst verlängern.');
	await sql`update market_listings set status = ${status}, updated_at = now() where id = ${id}`;
}

export async function renewListing(sql: Sql, userId: string, id: string) {
	const cur = await own(sql, userId, id);
	if (cur.status === 'abgegeben') throw new PostError('Abgegebene Anzeigen lassen sich nicht verlängern.');
	const [r] = await sql`update market_listings set expires_at = now() + make_interval(days => ${LIMITS.days}), renewed_at = now(),
		status = case when status = 'abgelaufen' then 'verfuegbar' else status end, updated_at = now()
		where id = ${id} and (renewed_at is null or renewed_at < now() - interval '1 day') returning id`;
	if (!r) throw new PostError('Heute schon verlängert.');
}

export async function deleteListing(sql: Sql, userId: string, id: string) {
	await own(sql, userId, id);
	const imgs = await sql`delete from media where listing_id = ${id} returning id`;
	for (const m of imgs) await deleteImageFile(m.id);
	await sql`update market_listings set status = 'entfernt', description = '', updated_at = now() where id = ${id}`;
	await sql`delete from saved_items where kind = 'listing' and item_id = ${id}`;
}

export interface ListFilter {
	q?: string | null;
	category?: string | null;
	kinds?: string[];
	region?: string | null;
	near?: { lat: number; lon: number; km: number } | null;
	maxPriceCents?: number | null;
	sort?: 'neu' | 'preis' | 'naehe';
	mine?: boolean;
	since?: Date | null;
	limit?: number;
}

export interface ListingItem {
	id: string;
	kind: string;
	category: string;
	title: string;
	priceCents: number | null;
	negotiable: boolean;
	condition: string | null;
	sizeText: string | null;
	status: string;
	regionName: string | null;
	km: number | null;
	image: string | null;
	createdAt: Date;
	expiresAt: Date;
	mine: boolean;
}

export async function listListings(sql: Sql, viewerId: string, f: ListFilter): Promise<ListingItem[]> {
	const q = f.q?.trim().slice(0, 80) || null;
	const near = f.near ? sql`ST_SetSRID(ST_MakePoint(${f.near.lon}, ${f.near.lat}), 4326)::geography` : null;
	const rows = await sql`select l.id, l.kind, l.category, l.title, l.price_cents, l.negotiable, l.condition, l.size_text, l.status, l.created_at, l.expires_at, l.user_id,
			r.name as region_name,
			${near ? sql`ST_Distance(l.location::geography, ${near}) / 1000` : sql`null::float`} as km,
			(select m.id from media m where m.listing_id = l.id and m.status = 'sichtbar' order by m.created_at limit 1) as image
		from market_listings l left join regions r on r.code = l.region_code
		join users u on u.id = l.user_id and u.status = 'active'
		where ${f.mine ? sql`l.user_id = ${viewerId} and l.status <> 'entfernt'` : sql`l.status in ('verfuegbar', 'reserviert') and l.expires_at > now()
			and not exists(select 1 from blocks b where (b.blocker = l.user_id and b.blocked = ${viewerId}) or (b.blocker = ${viewerId} and b.blocked = l.user_id))`}
			${f.category && f.category in MARKET_CATEGORIES ? sql`and l.category = ${f.category}` : sql``}
			${f.kinds?.length ? sql`and l.kind = any(${f.kinds})` : sql``}
			${f.region ? sql`and l.region_code in ${subtree(sql, f.region)}` : sql``}
			${near ? sql`and ST_DWithin(l.location::geography, ${near}, ${f.near!.km * 1000})` : sql``}
			${f.maxPriceCents != null ? sql`and (l.price_cents is null or l.price_cents <= ${f.maxPriceCents})` : sql``}
			${f.since ? sql`and l.created_at > ${f.since}` : sql``}
			${q ? sql`and (to_tsvector('german', l.title || ' ' || l.description) @@ plainto_tsquery('german', ${q}) or l.title ilike ${'%' + q + '%'})` : sql``}
		order by ${f.sort === 'preis' ? sql`l.price_cents asc nulls first, l.created_at desc` : f.sort === 'naehe' && near ? sql`km asc, l.created_at desc` : sql`(l.status = 'verfuegbar') desc, l.created_at desc`}
		limit ${f.limit ?? 200}`;
	return rows.map((l) => ({
		id: l.id as string,
		kind: l.kind as string,
		category: l.category as string,
		title: l.title as string,
		priceCents: l.price_cents as number | null,
		negotiable: l.negotiable as boolean,
		condition: l.condition as string | null,
		sizeText: l.size_text as string | null,
		status: l.status as string,
		regionName: l.region_name as string | null,
		km: l.km !== null && l.km !== undefined ? Math.max(1, Math.round(Number(l.km))) : null,
		image: l.image as string | null,
		createdAt: l.created_at as Date,
		expiresAt: l.expires_at as Date,
		mine: l.user_id === viewerId
	}));
}

export async function getListing(sql: Sql, viewerId: string, id: string, opts: { moderator?: boolean } = {}) {
	const [l] = await sql`select l.*, r.name as region_name, p.display_name, p.visibility, p.contact_id, u.created_at as member_since, u.status as user_status
		from market_listings l left join regions r on r.code = l.region_code join users u on u.id = l.user_id join user_profiles p on p.user_id = l.user_id
		where l.id = ${id}`;
	if (!l) return null;
	const mine = l.user_id === viewerId;
	if (!mine && !opts.moderator) {
		if (!['verfuegbar', 'reserviert', 'abgegeben', 'abgelaufen'].includes(l.status) || l.user_status !== 'active') return null;
		if (await isBlockedEither(sql, viewerId, l.user_id)) return null;
	}
	const images = await sql`select id, alt, width, height from media where listing_id = ${id} and status = 'sichtbar' order by created_at`;
	const nameVisible = ['alle', 'mitglieder'].includes(l.visibility?.display_name) && !!l.display_name;
	const [{ others }] = await sql`select count(*)::int as others from market_listings where user_id = ${l.user_id} and status in ('verfuegbar', 'reserviert') and id <> ${id}`;
	const contact = mine ? null : (await areContacts(sql, viewerId, l.user_id)) ? 'kontakt' : (await sql`select 1 as x from contact_requests where from_user = ${viewerId} and to_user = ${l.user_id} and status = 'offen'`).length ? 'angefragt' : 'keiner';
	return {
		id: l.id as string,
		kind: l.kind as string,
		category: l.category as string,
		title: l.title as string,
		description: l.description as string,
		priceCents: l.price_cents as number | null,
		negotiable: l.negotiable as boolean,
		condition: l.condition as string | null,
		sizeText: l.size_text as string | null,
		ageMin: l.age_min as number | null,
		ageMax: l.age_max as number | null,
		regionCode: l.region_code as string | null,
		regionName: l.region_name as string | null,
		safetyAck: l.safety_ack as boolean,
		status: l.status as string,
		expiresAt: l.expires_at as Date,
		createdAt: l.created_at as Date,
		updatedAt: l.updated_at as Date,
		images: images.map((m) => ({ id: m.id as string, alt: m.alt as string | null, width: m.width as number, height: m.height as number })),
		seller: { name: nameVisible ? (l.display_name as string) : 'Mitglied', since: l.member_since as Date, others, contactId: contact === 'kontakt' ? (l.contact_id as string) : null },
		mine,
		contact: contact as 'kontakt' | 'angefragt' | 'keiner' | null
	};
}

/** Anfrage zur Anzeige: Kontaktanfrage mit Bezug. Sind beide schon Kontakte, geht es direkt in den Chat. */
export async function inquire(sql: Sql, viewerId: string, id: string, message: string) {
	const l = await getListing(sql, viewerId, id);
	if (!l || l.mine) throw new PostError('Anzeige nicht gefunden.');
	if (l.status !== 'verfuegbar' && l.status !== 'reserviert') throw new PostError('Diese Anzeige ist nicht mehr aktiv.');
	if (l.contact === 'kontakt') return { direct: true };
	const text = message.trim().slice(0, 500);
	if (text.length < 5) throw new PostError('Bitte kurz schreiben, worum es geht.');
	const flags = checkText(text);
	if (flags.some((f) => f.hold)) throw new PostError('Bitte keine Telefonnummern, E-Mail- oder Kontonummern in die Anfrage schreiben – nach der Annahme könnt ihr im Chat alles klären.');
	const [owner] = await sql`select user_id from market_listings where id = ${id}`;
	try {
		await sendRequest(sql, viewerId, owner.user_id, `Zur Anzeige „${l.title}“: ${text}`, 'markt', { kind: 'listing', id });
	} catch (e) {
		if (e instanceof ContactError) throw new PostError(e.message === 'Du hast dieser Familie schon eine Anfrage geschickt.' ? 'Du hast dieser Person schon eine Anfrage geschickt. Sobald sie annimmt, könnt ihr im Chat schreiben.' : e.message);
		throw e;
	}
	await notify(sql, owner.user_id, 'markt', `Neue Anfrage zu deiner Anzeige „${l.title}“`, '/nachrichten?ansicht=kontakte', { pushKind: 'markt', pushBody: 'Neue Anfrage zu deiner Anzeige' });
	return { direct: false };
}

// ---------- Suchaufträge ----------
export async function saveSearch(sql: Sql, userId: string, s: { q: string | null; category: string | null; kinds: string[]; regionCode: string | null; maxPriceCents: number | null }) {
	const [{ n }] = await sql`select count(*)::int as n from market_searches where user_id = ${userId}`;
	if (n >= LIMITS.searches) throw new PostError(`Höchstens ${LIMITS.searches} Suchaufträge.`);
	if (!s.q && !s.category && !s.regionCode) throw new PostError('Bitte mindestens Suchwort, Kategorie oder Gegend angeben.');
	const [r] = await sql`insert into market_searches (user_id, q, category, kinds, region_code, max_price_cents)
		values (${userId}, ${s.q?.trim().slice(0, 80) || null}, ${s.category && s.category in MARKET_CATEGORIES ? s.category : null}, ${s.kinds.filter((k) => k in MARKET_KINDS)},
			${s.regionCode}, ${s.maxPriceCents}) returning id`;
	return r.id as string;
}

export async function listSearches(sql: Sql, userId: string) {
	return (
		await sql`select s.*, r.name as region_name from market_searches s left join regions r on r.code = s.region_code where s.user_id = ${userId} order by s.created_at`
	).map((s) => ({ id: s.id as string, q: s.q as string | null, category: s.category as string | null, kinds: s.kinds as string[], regionCode: s.region_code as string | null, regionName: s.region_name as string | null, maxPriceCents: s.max_price_cents as number | null }));
}

export async function deleteSearch(sql: Sql, userId: string, id: string) {
	await sql`delete from market_searches where id = ${id} and user_id = ${userId}`;
}

/** Zeitplan: neue Anzeigen zu Suchaufträgen melden – eine Mitteilung je Suchauftrag, ohne Inhalt im Push. */
export async function checkSearches(sql: Sql): Promise<number> {
	const searches = await sql`select s.* from market_searches s join users u on u.id = s.user_id and u.status = 'active'
		where s.last_checked_at < now() - interval '9 minutes' order by s.last_checked_at limit 300`;
	let sent = 0;
	for (const s of searches) {
		const now = new Date();
		const hits = await listListings(sql, s.user_id, { q: s.q, category: s.category, kinds: s.kinds, region: s.region_code, maxPriceCents: s.max_price_cents, since: s.last_checked_at, limit: 20 });
		const fresh = hits.filter((h) => !h.mine && h.status === 'verfuegbar');
		await sql`update market_searches set last_checked_at = ${now} where id = ${s.id}`;
		if (!fresh.length) continue;
		const params = new URLSearchParams();
		if (s.q) params.set('q', s.q);
		if (s.category) params.set('kategorie', s.category);
		if (s.region_code) params.set('region', s.region_code);
		await notify(sql, s.user_id, 'markt', fresh.length === 1 ? `Neue Anzeige zu deiner Suche: „${fresh[0].title}“` : `${fresh.length} neue Anzeigen zu deiner Suche`, fresh.length === 1 ? `/marktplatz/${fresh[0].id}` : `/marktplatz?${params}`, { pushKind: 'markt', pushBody: 'Neue Anzeigen zu deiner Suche' });
		sent++;
	}
	return sent;
}

/** Zeitplan: abgelaufene Anzeigen markieren und einmal Bescheid geben. */
export async function expireListings(sql: Sql): Promise<number> {
	const rows = await sql`update market_listings set status = 'abgelaufen', updated_at = now()
		where status in ('verfuegbar', 'reserviert') and expires_at < now() returning id, user_id, title`;
	for (const r of rows) await notify(sql, r.user_id, 'markt', `Deine Anzeige „${r.title}“ ist abgelaufen. Du kannst sie verlängern.`, `/marktplatz/${r.id}`, { noPush: true });
	return rows.length;
}

export { MARKET_CATEGORIES };
