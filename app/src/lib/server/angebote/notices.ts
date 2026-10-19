// Regionale Änderungen und Hinweise (M20): neu, aktualisiert, Absage, Frist, Sperrung, Leistung.
// Herkunft ist immer sichtbar: amtlich bestätigt, Anbieterinformation, Redaktion, ungeprüfter Mitgliederhinweis.
// Sofort-Push nur bei „dringend“ (Redaktion) und nur für Personen, die das ausdrücklich eingeschaltet haben.
import type { Sql } from '../db';
import { audit } from '../audit';
import { userCan, regionPath } from '../roles';
import { PostError } from '../community/posts';
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

export async function archiveNotice(sql: Sql, userId: string, id: string) {
	const [n] = await sql`select org_id, region_code from notices where id = ${id}`;
	if (!n) throw new PostError('Hinweis nicht gefunden.');
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
