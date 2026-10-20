// Regionale Änderungen und Hinweise (M20): neu, aktualisiert, Absage, Frist, Sperrung, Leistung.
// Herkunft ist immer sichtbar: amtlich bestätigt, Anbieterinformation, Redaktion, ungeprüfter Mitgliederhinweis.
// Sofort-Push nur bei „dringend“ (Redaktion) und nur für Personen, die das ausdrücklich eingeschaltet haben.
import type { Sql } from '../db';
import { audit } from '../audit';
import { userCan, regionPath } from '../roles';
import { PostError, notify } from '../community/posts';
import { checkText } from '../community/automod';
import { ancestors, cleanUrl, subtree } from './common';
import { requireOrgRole } from './orgs';
import { NOTICE_KINDS, isRadarTopic } from '$lib/angebote';

export interface NoticeInput {
	kind: string;
	title: string;
	body: string;
	topics: string[];
	regionCode: string | null;
	sourceKind: 'amtlich' | 'anbieter' | 'redaktion';
	sourceUrl: string | null;
	validUntil: Date | null;
	deadline: string | null;
	urgent: boolean;
}

export async function createNotice(sql: Sql, userId: string, i: NoticeInput, opts: { orgId?: string | null } = {}): Promise<string> {
	if (!(i.kind in NOTICE_KINDS)) throw new PostError('Bitte die Art des Hinweises wählen.');
	if (i.title.trim().length < 3) throw new PostError('Titel zu kurz.');
	if (i.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(i.deadline)) throw new PostError('Ungültige Frist.');
	let sourceKind = i.sourceKind;
	let urgent = i.urgent;
	if (opts.orgId) {
		await requireOrgRole(sql, userId, opts.orgId);
		sourceKind = 'anbieter';
		urgent = false;
	} else {
		const ok = await userCan(sql, userId, 'notices.edit', i.regionCode ? { regionPath: await regionPath(sql, i.regionCode) } : undefined);
		if (!ok) throw new PostError('Keine Berechtigung für Hinweise.');
		if (sourceKind === 'amtlich' && !i.sourceUrl) throw new PostError('„Amtlich“ nur mit Quellenlink.');
		if (sourceKind === 'anbieter') sourceKind = 'redaktion';
	}
	const [n] = await sql`insert into notices (kind, title, body, topics, region_code, source_kind, source_url, org_id, valid_until, deadline, urgent, created_by)
		values (${i.kind}, ${i.title.trim()}, ${i.body.trim().slice(0, 1200)}, ${i.topics.filter(isRadarTopic)}, ${i.regionCode}, ${sourceKind}, ${cleanUrl(i.sourceUrl, 'Quellenlink')},
			${opts.orgId ?? null}, ${i.validUntil}, ${i.deadline}, ${urgent}, ${userId}) returning id`;
	await audit(sql, { actorId: userId, action: 'notice.created', targetType: 'notice', targetId: n.id, meta: { urgent } });
	if (urgent) await pushUrgent(sql, n.id).catch(() => {});
	return n.id as string;
}

// ---------- Hinweise von Mitgliedern (M20, D-065) ----------
export const MEMBER_NOTICE_KINDS = ['sperrung', 'absage', 'frist', 'info', 'neu'] as const;

export interface MemberNoticeInput {
	kind: string;
	title: string;
	body: string;
	regionCode: string | null;
	sourceUrl: string | null;
	days: number;
}

/** Mitglied schlägt einen regionalen Hinweis vor. Erst nach Freigabe durch die Redaktion sichtbar. */
export async function proposeNotice(sql: Sql, userId: string, i: MemberNoticeInput): Promise<string> {
	if (!(MEMBER_NOTICE_KINDS as readonly string[]).includes(i.kind)) throw new PostError('Bitte die Art des Hinweises wählen.');
	if (i.title.trim().length < 5) throw new PostError('Bitte kurz sagen, worum es geht (mindestens 5 Zeichen).');
	if (!i.regionCode) throw new PostError('Bitte die Gegend wählen, für die der Hinweis gilt.');
	const [reg] = await sql`select 1 from regions where code = ${i.regionCode}`;
	if (!reg) throw new PostError('Gegend nicht gefunden.');
	const flags = checkText(`${i.title}\n${i.body}`).filter((f) => f.reason === 'private_daten');
	if (flags.length) throw new PostError(`Bitte keine privaten Daten (${flags.map((f) => f.detail).join(', ')}) – Hinweise sind für alle sichtbar.`);
	const [{ n }] = await sql`select count(*)::int as n from notices where created_by = ${userId} and source_kind = 'mitglied' and created_at > now() - interval '1 day'`;
	if (n >= 3) throw new PostError('Heute schon drei Hinweise vorgeschlagen. Danke! Bitte morgen weiter.');
	const days = [3, 7, 14, 30].includes(i.days) ? i.days : 14;
	const [row] = await sql`insert into notices (kind, title, body, topics, region_code, source_kind, source_url, valid_until, status, created_by)
		values (${i.kind}, ${i.title.trim().slice(0, 200)}, ${i.body.trim().slice(0, 1200)}, '{}', ${i.regionCode}, 'mitglied', ${cleanUrl(i.sourceUrl, 'Quellenlink')},
			now() + make_interval(days => ${days}), 'pruefung', ${userId}) returning id`;
	await audit(sql, { actorId: userId, action: 'notice.proposed', targetType: 'notice', targetId: row.id });
	return row.id as string;
}

export async function myProposals(sql: Sql, userId: string) {
	return (await sql`select n.id, n.kind, n.title, n.status, n.review_note, n.created_at, r.name as region_name from notices n left join regions r on r.code = n.region_code
		where n.created_by = ${userId} and n.source_kind = 'mitglied' and n.status <> 'entfernt' order by n.created_at desc limit 30`).map((r) => ({
		id: r.id as string, kind: r.kind as string, title: r.title as string, status: r.status as string, note: r.review_note as string | null, at: r.created_at as Date, regionName: r.region_name as string | null
	}));
}

export async function pendingProposals(sql: Sql, userId: string) {
	const rows = await sql`select n.id, n.kind, n.title, n.body, n.source_url, n.region_code, n.valid_until, n.created_at, r.name as region_name
		from notices n left join regions r on r.code = n.region_code where n.status = 'pruefung' and n.source_kind = 'mitglied' order by n.created_at limit 100`;
	const out = [];
	for (const r of rows)
		if (await userCan(sql, userId, 'notices.edit', r.region_code ? { regionPath: await regionPath(sql, r.region_code) } : undefined))
			out.push({ id: r.id as string, kind: r.kind as string, title: r.title as string, body: r.body as string, sourceUrl: r.source_url as string | null, regionName: r.region_name as string | null, validUntil: r.valid_until as Date | null, at: r.created_at as Date });
	return out;
}

/** Redaktion entscheidet über einen Mitglieder-Vorschlag. Freigeben ≠ amtlich bestätigen: Herkunft bleibt „Mitglied“. */
export async function reviewProposal(sql: Sql, userId: string, id: string, approve: boolean, note: string) {
	const [n] = await sql`select region_code, title, created_by from notices where id = ${id} and status = 'pruefung' and source_kind = 'mitglied'`;
	if (!n) throw new PostError('Vorschlag nicht (mehr) offen.');
	if (!(await userCan(sql, userId, 'notices.edit', n.region_code ? { regionPath: await regionPath(sql, n.region_code) } : undefined))) throw new PostError('Keine Berechtigung für diese Region.');
	if (!approve && !note.trim()) throw new PostError('Bitte kurz begründen, warum der Hinweis nicht erscheint.');
	await sql`update notices set status = ${approve ? 'aktiv' : 'abgelehnt'}, review_note = ${note.trim().slice(0, 300) || null}, valid_from = now(), updated_at = now() where id = ${id}`;
	await audit(sql, { actorId: userId, action: approve ? 'notice.approved' : 'notice.rejected', targetType: 'notice', targetId: id });
	if (n.created_by)
		await notify(sql, n.created_by, 'hinweis', approve ? `Dein Hinweis „${n.title}“ ist jetzt sichtbar.` : `Dein Hinweis „${n.title}“ erscheint nicht: ${note.trim().slice(0, 200)}`, approve ? `/hinweise#h-${id}` : '/hinweise/neu');
}

export async function archiveNotice(sql: Sql, userId: string, id: string) {
	const [n] = await sql`select org_id, region_code, created_by, source_kind from notices where id = ${id}`;
	if (!n) throw new PostError('Hinweis nicht gefunden.');
	// Eigener Mitgliederhinweis: darf die Person selbst beenden
	if (n.source_kind === 'mitglied' && n.created_by === userId) {
		await sql`update notices set status = 'archiviert', updated_at = now() where id = ${id}`;
		return;
	}
	if (n.org_id) await requireOrgRole(sql, userId, n.org_id);
	else if (!(await userCan(sql, userId, 'notices.edit', n.region_code ? { regionPath: await regionPath(sql, n.region_code) } : undefined))) throw new PostError('Keine Berechtigung.');
	await sql`update notices set status = 'archiviert', updated_at = now() where id = ${id}`;
}

/**
 * Hinweise für eine Region: gilt auch, was für übergeordnete Gebiete gemeldet ist (Land, Stadt),
 * und alles darunter (Stadtteile). Ortshinweise der Familienkarte (Sperrungen, Defekte) kommen dazu.
 */
export async function listNotices(sql: Sql, f: { region?: string | null; topics?: string[]; kinds?: string[]; orgIds?: string[]; limit?: number }) {
	const scope = f.region ? sql`and (n.region_code is null or n.region_code in ${subtree(sql, f.region)} or n.region_code in ${ancestors(sql, f.region)})` : sql``;
	const rows = await sql`select n.id, n.kind, n.title, n.body, n.topics, n.source_kind, n.source_url, n.deadline, n.valid_from, n.valid_until, n.urgent,
			n.event_id, n.offer_id, n.place_id, r.name as region_name, o.name as org_name, o.slug as org_slug, s.name as source_name
		from notices n left join regions r on r.code = n.region_code left join organizations o on o.id = n.org_id left join data_sources s on s.key = n.source_key
		where n.status = 'aktiv' and n.valid_from <= now() and (n.valid_until is null or n.valid_until > now())
			and (n.org_id is null or o.status = 'verifiziert') ${scope}
			${f.topics?.length ? sql`and (n.topics && ${f.topics} or cardinality(n.topics) = 0)` : sql``}
			${f.kinds?.length ? sql`and n.kind = any(${f.kinds})` : sql``}
			${f.orgIds?.length ? sql`and n.org_id = any(${f.orgIds})` : sql``}
		order by n.urgent desc, coalesce(n.deadline::timestamptz, n.valid_from) desc limit ${f.limit ?? 100}`;
	// Ortshinweise (D-024): bestätigte Sperrungen und amtliche Meldungen der Familienkarte
	const placeRows = await sql`select pn.id, pn.kind, pn.origin, pn.text, pn.source_url, pn.created_at, p.id as place_id, p.name as place_name, r.name as region_name
		from place_notices pn join places p on p.id = pn.place_id left join regions r on r.code = p.region_code
		where ${f.orgIds?.length ? sql`false and` : sql``} pn.origin in ('redaktion', 'amtlich') and pn.ended_at is null and (pn.valid_until is null or pn.valid_until > now())
			${f.region ? sql`and p.region_code in ${subtree(sql, f.region)}` : sql``}
		order by pn.created_at desc limit 30`;
	return {
		notices: rows.map((n) => ({
			id: n.id as string,
			kind: n.kind as string,
			title: n.title as string,
			body: n.body as string,
			sourceKind: n.source_kind as string,
			sourceUrl: n.source_url as string | null,
			sourceName: (n.source_name ?? n.org_name) as string | null,
			orgSlug: n.org_slug as string | null,
			deadline: n.deadline as Date | null,
			validFrom: n.valid_from as Date,
			validUntil: n.valid_until as Date | null,
			urgent: n.urgent as boolean,
			regionName: n.region_name as string | null,
			link: n.event_id ? `/veranstaltungen/${n.event_id}` : n.offer_id ? `/angebote/${n.offer_id}` : n.place_id ? `/orte/${n.place_id}` : null
		})),
		placeNotices: placeRows.map((p) => ({
			id: p.id as string,
			kind: p.kind as string,
			origin: p.origin as string,
			text: p.text as string | null,
			sourceUrl: p.source_url as string | null,
			at: p.created_at as Date,
			placeId: p.place_id as string,
			placeName: p.place_name as string,
			regionName: p.region_name as string | null
		}))
	};
}

/** Dringender Hinweis → Push nur an Personen mit „dringende Hinweise“ an, deren Radar-Region die Hinweisregion enthält oder darin liegt. Ohne Inhalt. */
async function pushUrgent(sql: Sql, id: string) {
	const [n] = await sql`select region_code from notices where id = ${id}`;
	const users = await sql`select distinct p.user_id from radar_profiles p join notification_settings s on s.user_id = p.user_id and s.push_urgent
		where not p.paused and (${n.region_code}::text is null or cardinality(p.regions) = 0 or p.regions && array(select code from ${ancestors(sql, n.region_code ?? '')} union select code from ${subtree(sql, n.region_code ?? '')}))`;
	const { pushNotice } = await import('../push');
	for (const u of users) await pushNotice(sql, u.user_id, `/hinweise#h-${id}`, { force: true, body: 'Wichtiger Hinweis für deine Region' });
}
