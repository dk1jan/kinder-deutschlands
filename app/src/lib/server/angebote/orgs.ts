// Einrichtungen und Partner (M22): Antrag, Prüfung durch die Verwaltung, mehrere Mitarbeitende, Folgen.
// Verifiziert heißt: Die Zuordnung zur Organisation ist geprüft – nicht die Qualität jedes Angebots.
import type { Sql } from '../db';
import { audit } from '../audit';
import { userCan } from '../roles';
import { notify, PostError } from '../community/posts';
import { slugify } from '../community/knowledge';
import { normalizeContactId } from '../contactid';
import { ORG_KINDS, isRadarTopic } from '$lib/angebote';

export interface OrgInput {
	name: string;
	kind: string;
	description: string;
	topics: string[];
	regionCode: string | null;
	address: string | null;
	lat: number | null;
	lon: number | null;
	website: string | null;
	email: string | null;
	phone: string | null;
}

const urlOk = (u: string | null) => !u || /^https:\/\/[^\s]+\.[^\s]+$/.test(u) || /^http:\/\/[^\s]+\.[^\s]+$/.test(u);

export function validateOrg(i: OrgInput) {
	if (i.name.trim().length < 2) throw new PostError('Bitte den Namen der Einrichtung angeben.');
	if (!(i.kind in ORG_KINDS)) throw new PostError('Bitte die Art der Einrichtung wählen.');
	if (i.description.length > 5000) throw new PostError('Beschreibung zu lang.');
	if (!urlOk(i.website)) throw new PostError('Webseite bitte mit https:// angeben.');
	if (i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) throw new PostError('E-Mail-Adresse prüfen.');
	if ((i.lat === null) !== (i.lon === null)) throw new PostError('Standort unvollständig.');
	if (i.lat !== null && (i.lat < 47 || i.lat > 56 || i.lon! < 5 || i.lon! > 16)) throw new PostError('Standort liegt nicht in Deutschland.');
}

async function uniqueSlug(sql: Sql, name: string) {
	const base = slugify(name).slice(0, 70) || 'einrichtung';
	let slug = base.length >= 3 ? base : `${base}-ev`;
	for (let i = 2; (await sql`select 1 as x from organizations where slug = ${slug}`).length; i++) slug = `${base}-${i}`;
	return slug;
}

/** Antrag: Die antragstellende Person wird nach der Prüfung erste Verwalterin der Einrichtung. */
export async function applyOrg(sql: Sql, userId: string, i: OrgInput, application: { role: string; proof: string }) {
	validateOrg(i);
	if (application.role.trim().length < 3) throw new PostError('Bitte angeben, welche Funktion du in der Einrichtung hast.');
	if (application.proof.trim().length < 10) throw new PostError('Bitte kurz beschreiben, wie wir die Zuordnung prüfen können (z. B. Dienst-E-Mail, Telefon der Einrichtung).');
	const [{ n }] = await sql`select count(*)::int as n from organizations where created_by = ${userId} and status = 'beantragt'`;
	if (n >= 3) throw new PostError('Du hast schon mehrere offene Anträge.');
	const slug = await uniqueSlug(sql, i.name);
	const [o] = await sql`insert into organizations (slug, name, kind, description, topics, region_code, address, location, website, email, phone, application, created_by)
		values (${slug}, ${i.name.trim()}, ${i.kind}, ${i.description.trim()}, ${i.topics.filter(isRadarTopic)}, ${i.regionCode}, ${i.address},
			${i.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${i.lon}, ${i.lat}), 4326)` : null}, ${i.website}, ${i.email}, ${i.phone},
			${sql.json({ role: application.role.trim().slice(0, 200), proof: application.proof.trim().slice(0, 1000), applicant: userId, at: new Date().toISOString() })}, ${userId})
		returning id, slug`;
	await audit(sql, { actorId: userId, action: 'org.applied', targetType: 'org', targetId: o.id });
	return o as { id: string; slug: string };
}

/** Entscheidung der Verwaltung. Die Prüfangaben werden danach auf das Nötige gekürzt (Datensparsamkeit). */
export async function decideOrg(sql: Sql, adminId: string, orgId: string, approve: boolean, note: string) {
	if (!(await userCan(sql, adminId, 'orgs.verify'))) throw new PostError('Keine Berechtigung.');
	const [o] = await sql`select id, status, application, created_by, name from organizations where id = ${orgId}`;
	if (!o) throw new PostError('Einrichtung nicht gefunden.');
	if (note.trim().length < 3) throw new PostError('Bitte die Entscheidung kurz begründen.');
	const applicant = (o.application?.applicant as string | undefined) ?? o.created_by;
	await sql.begin(async (tx) => {
		await tx`update organizations set status = ${approve ? 'verifiziert' : 'abgelehnt'}, verified_at = ${approve ? tx`now()` : null}, verified_by = ${adminId},
			decision_note = ${note.trim().slice(0, 500)}, application = ${tx.json({ role: o.application?.role ?? null, decided_at: new Date().toISOString() })}, updated_at = now()
			where id = ${orgId}`;
		if (approve && applicant) await tx`insert into org_members (org_id, user_id, role, added_by) values (${orgId}, ${applicant}, 'admin', ${adminId}) on conflict do nothing`;
	});
	await audit(sql, { actorId: adminId, action: approve ? 'org.verified' : 'org.rejected', targetType: 'org', targetId: orgId, reason: note.trim() });
	if (applicant)
		await notify(sql, applicant, 'einrichtung', approve ? `„${o.name}“ ist jetzt verifiziert. Du kannst Angebote, Termine und Hinweise pflegen.` : `Der Antrag für „${o.name}“ wurde nicht bestätigt: ${note.trim()}`, approve ? `/einrichtungen/verwalten` : null);
}

export async function setOrgStatus(sql: Sql, adminId: string, orgId: string, status: 'verifiziert' | 'pausiert', note: string) {
	if (!(await userCan(sql, adminId, 'orgs.verify'))) throw new PostError('Keine Berechtigung.');
	await sql`update organizations set status = ${status}, decision_note = ${note.slice(0, 500)}, updated_at = now() where id = ${orgId} and status in ('verifiziert', 'pausiert')`;
	await audit(sql, { actorId: adminId, action: `org.${status}`, targetType: 'org', targetId: orgId, reason: note });
}

export async function orgRole(sql: Sql, userId: string | null, orgId: string): Promise<'admin' | 'redaktion' | null> {
	if (!userId) return null;
	const [m] = await sql`select m.role from org_members m join organizations o on o.id = m.org_id where m.org_id = ${orgId} and m.user_id = ${userId} and o.status = 'verifiziert'`;
	return (m?.role as 'admin' | 'redaktion') ?? null;
}

export async function requireOrgRole(sql: Sql, userId: string, orgId: string, need: 'admin' | 'redaktion' = 'redaktion') {
	const r = await orgRole(sql, userId, orgId);
	if (!r || (need === 'admin' && r !== 'admin')) throw new PostError('Dafür fehlt die Berechtigung für diese Einrichtung.');
	return r;
}

export async function myOrgs(sql: Sql, userId: string) {
	return sql`select o.id, o.slug, o.name, o.kind, o.status, m.role from org_members m join organizations o on o.id = m.org_id
		where m.user_id = ${userId} order by o.name`;
}

export async function updateOrg(sql: Sql, userId: string, orgId: string, i: OrgInput & { icsUrl: string | null }) {
	await requireOrgRole(sql, userId, orgId, 'admin');
	validateOrg(i);
	if (i.icsUrl && !/^https:\/\/\S+$/.test(i.icsUrl)) throw new PostError('Kalender-Adresse (ICS) bitte mit https:// angeben.');
	await sql`update organizations set name = ${i.name.trim()}, kind = ${i.kind}, description = ${i.description.trim()}, topics = ${i.topics.filter(isRadarTopic)},
		region_code = ${i.regionCode}, address = ${i.address}, location = ${i.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${i.lon}, ${i.lat}), 4326)` : null},
		website = ${i.website}, email = ${i.email}, phone = ${i.phone}, ics_url = ${i.icsUrl}, updated_at = now() where id = ${orgId}`;
	await syncOrgIcsSource(sql, orgId, userId);
	await audit(sql, { actorId: userId, action: 'org.updated', targetType: 'org', targetId: orgId });
}

/** ICS-Kalender der Einrichtung als Quelle in der Datenzentrale führen (vom Anbieter selbst bereitgestellt). */
async function syncOrgIcsSource(sql: Sql, orgId: string, userId: string) {
	const [o] = await sql`select id, slug, name, ics_url, region_code, topics from organizations where id = ${orgId}`;
	const key = `org-ics-${o.slug}`.slice(0, 60);
	if (!o.ics_url) {
		await sql`update data_sources set paused = true where key = ${key}`;
		return;
	}
	await sql`insert into data_sources (key, name, kind, operator, format, access, license, attribution, regions, topics, notes, config, interval_hours, license_confirmed_by, license_confirmed_at)
		values (${key}, ${'Termine: ' + o.name}, 'termine', ${o.name}, 'iCalendar (ICS)', ${o.ics_url}, 'Vom Anbieter selbst bereitgestellt', ${o.name},
			${o.region_code ? [o.region_code.slice(0, 2)] : []}, '{freizeit}', 'Kalender der verifizierten Einrichtung; Termine erscheinen als Anbietertermine.',
			${sql.json({ type: 'ics', org_id: orgId, url: o.ics_url, topics: o.topics?.length ? o.topics : ['freizeit'], visibility: 'oeffentlich' })}, 24, ${userId}, now())
		on conflict (key) do update set access = excluded.access, config = excluded.config, paused = false, name = excluded.name, next_run_at = now()`;
}

/** Weitere Mitarbeitende über die Familien-ID hinzufügen (Vertretung, Teamwechsel). */
export async function addMember(sql: Sql, userId: string, orgId: string, contactIdRaw: string, role: 'admin' | 'redaktion') {
	await requireOrgRole(sql, userId, orgId, 'admin');
	const cid = normalizeContactId(contactIdRaw);
	if (!cid) throw new PostError('Bitte eine gültige Familien-ID angeben.');
	const [p] = await sql`select p.user_id from user_profiles p join users u on u.id = p.user_id and u.status = 'active' where p.contact_id = ${cid}`;
	if (!p) throw new PostError('Keine aktive Person mit dieser Familien-ID gefunden.');
	await sql`insert into org_members (org_id, user_id, role, added_by) values (${orgId}, ${p.user_id}, ${role}, ${userId})
		on conflict (org_id, user_id) do update set role = excluded.role`;
	const [o] = await sql`select name from organizations where id = ${orgId}`;
	await notify(sql, p.user_id, 'einrichtung', `Du pflegst jetzt „${o.name}“ mit (${role === 'admin' ? 'Verwaltung' : 'Redaktion'}).`, '/einrichtungen/verwalten');
	await audit(sql, { actorId: userId, action: 'org.member.added', targetType: 'org', targetId: orgId, meta: { role } });
}

/** Austragen – die letzte Verwaltung kann nicht gehen, ohne eine Nachfolge einzutragen. */
export async function removeMember(sql: Sql, userId: string, orgId: string, memberUserId: string) {
	if (userId !== memberUserId) await requireOrgRole(sql, userId, orgId, 'admin');
	const [m] = await sql`select role from org_members where org_id = ${orgId} and user_id = ${memberUserId}`;
	if (!m) return;
	if (m.role === 'admin') {
		const [{ n }] = await sql`select count(*)::int as n from org_members where org_id = ${orgId} and role = 'admin'`;
		if (n <= 1) throw new PostError('Bitte zuerst eine weitere Person als Verwaltung eintragen.');
	}
	await sql`delete from org_members where org_id = ${orgId} and user_id = ${memberUserId}`;
	await audit(sql, { actorId: userId, action: 'org.member.removed', targetType: 'org', targetId: orgId });
}

export async function orgMembers(sql: Sql, userId: string, orgId: string) {
	await requireOrgRole(sql, userId, orgId, 'redaktion');
	return sql`select m.user_id, m.role, p.contact_id, p.display_name, m.created_at from org_members m join user_profiles p on p.user_id = m.user_id
		where m.org_id = ${orgId} order by m.role, p.display_name`;
}

export async function toggleFollow(sql: Sql, userId: string, orgId: string): Promise<boolean> {
	const [d] = await sql`delete from org_followers where org_id = ${orgId} and user_id = ${userId} returning 1 as x`;
	if (d) return false;
	const [o] = await sql`select 1 as x from organizations where id = ${orgId} and status = 'verifiziert'`;
	if (!o) throw new PostError('Einrichtung nicht gefunden.');
	await sql`insert into org_followers (org_id, user_id) values (${orgId}, ${userId}) on conflict do nothing`;
	return true;
}

/** Grobe Zahl statt Liste – Anbieter erfahren nicht, wer folgt. */
export function followerBucket(n: number): string {
	if (n < 10) return 'weniger als 10';
	if (n < 50) return '10–49';
	if (n < 200) return '50–199';
	return '200 und mehr';
}

export async function listOrgs(sql: Sql, f: { q?: string | null; kind?: string | null; region?: string | null }) {
	const q = f.q?.trim().slice(0, 80) || null;
	return sql`select o.id, o.slug, o.name, o.kind, o.region_code, r.name as region_name, left(o.description, 220) as teaser
		from organizations o left join regions r on r.code = o.region_code
		where o.status = 'verifiziert'
			${f.kind && f.kind in ORG_KINDS ? sql`and o.kind = ${f.kind}` : sql``}
			${q ? sql`and (o.name ilike ${'%' + q + '%'} or o.description ilike ${'%' + q + '%'})` : sql``}
			${f.region ? sql`and o.region_code in (with recursive s as (select code from regions where code = ${f.region} union all select r2.code from regions r2 join s on r2.parent_code = s.code) select code from s)` : sql``}
		order by o.name limit 300`;
}

export async function getOrg(sql: Sql, slug: string, viewerId: string | null) {
	const [o] = await sql`select o.*, ST_Y(o.location) as lat, ST_X(o.location) as lon, r.name as region_name,
			(select count(*)::int from org_followers f where f.org_id = o.id) as followers,
			${viewerId ? sql`exists(select 1 from org_followers f where f.org_id = o.id and f.user_id = ${viewerId})` : sql`false`} as following
		from organizations o left join regions r on r.code = o.region_code where o.slug = ${slug}`;
	if (!o) return null;
	const role = await orgRole(sql, viewerId, o.id);
	if (o.status !== 'verifiziert' && !role) return null;
	return { ...o, role, followersText: followerBucket(o.followers), application: undefined } as unknown as Record<string, unknown> & { id: string; role: typeof role };
}
