// Familie verbinden (F-008, D-070; seit F-029 nur noch „Familie“, alte Einträge „partnerschaft“ heißen ebenfalls Familie): beidseitig bestätigt, jederzeit lösbar.
// Sichtbarkeit: jede Person entscheidet im Profil (Feld „Familie“), wer die Verbindung sieht; gezeigt wird sie nur,
// wenn beide Seiten es für die betrachtende Person zulassen.
import type { Sql } from './db';
import { audit } from './audit';
import { notify } from './community/posts';
import { formatContactId, normalizeContactId } from './contactid';
import { areContacts, isBlockedEither, relationOf } from './profiles';
import { canSee, type Visibility } from '$lib/visibility';

export class FamilyError extends Error {}
export const FAMILY_KINDS = { partnerschaft: 'Familie', familie: 'Familie' } as const;
const pair = (x: string, y: string) => (x < y ? [x, y] : [y, x]);

export async function requestLink(sql: Sql, userId: string, cidRaw: string, _kind?: string) {
	const kind = 'familie'; // F-029: nur noch „Familie“ – Angabe aus alten Formularen wird ignoriert
	const cid = normalizeContactId(cidRaw);
	const [p] = cid ? await sql`select p.user_id from user_profiles p join users u on u.id = p.user_id and u.status = 'active' where p.contact_id = ${cid}` : [];
	if (!p) throw new FamilyError('Keine Familie mit dieser ID gefunden.');
	const other = p.user_id as string;
	if (other === userId) throw new FamilyError('Das ist deine eigene Familien-ID.');
	if (await isBlockedEither(sql, userId, other)) throw new FamilyError('Keine Familie mit dieser ID gefunden.');
	const [{ n }] = await sql`select count(*)::int as n from family_links where ${userId} in (user_a, user_b)`;
	if (n >= 10) throw new FamilyError('Höchstens 10 Verbindungen.');
	const [{ d }] = await sql`select count(*)::int as d from family_links where requested_by = ${userId} and created_at > now() - interval '1 day'`;
	if (d >= 10) throw new FamilyError('Heute schon viele Anfragen. Bitte morgen weiter.');
	const [a, b] = pair(userId, other);
	const r = await sql`insert into family_links (user_a, user_b, kind, requested_by) values (${a}, ${b}, ${kind}, ${userId}) on conflict (user_a, user_b) do nothing returning id`;
	if (!r.length) throw new FamilyError('Mit dieser Familie gibt es schon eine Verbindung oder Anfrage.');
	await notify(sql, other, 'familie', `Anfrage: Als ${FAMILY_KINDS[kind as keyof typeof FAMILY_KINDS]} verbinden`, '/profil/familie');
	await audit(sql, { actorId: userId, action: 'family.requested', targetType: 'family', targetId: r[0].id });
}

export async function respondLink(sql: Sql, userId: string, id: string, accept: boolean) {
	const [l] = await sql`select * from family_links where id = ${id} and status = 'angefragt' and requested_by <> ${userId} and ${userId} in (user_a, user_b)`;
	if (!l) throw new FamilyError('Anfrage nicht (mehr) offen.');
	if (accept) await sql`update family_links set status = 'aktiv', confirmed_at = now() where id = ${id}`;
	else await sql`delete from family_links where id = ${id}`;
	if (accept) await notify(sql, l.requested_by, 'familie', 'Eure Verbindung ist bestätigt.', '/profil/familie');
	await audit(sql, { actorId: userId, action: accept ? 'family.confirmed' : 'family.declined', targetType: 'family', targetId: id });
}

export async function removeLink(sql: Sql, userId: string, id: string) {
	const r = await sql`delete from family_links where id = ${id} and ${userId} in (user_a, user_b) returning id`;
	if (!r.length) throw new FamilyError('Verbindung nicht gefunden.');
	await audit(sql, { actorId: userId, action: 'family.removed', targetType: 'family', targetId: id });
}

export async function myLinks(sql: Sql, userId: string) {
	const rows = await sql`select l.id, l.kind, l.status, l.requested_by, l.created_at, p.contact_id, p.display_name
		from family_links l join user_profiles p on p.user_id = case when l.user_a = ${userId} then l.user_b else l.user_a end
		where ${userId} in (l.user_a, l.user_b) order by l.created_at`;
	return rows.map((r) => ({
		id: r.id as string,
		kind: r.kind as keyof typeof FAMILY_KINDS,
		status: r.status as string,
		incoming: r.status === 'angefragt' && r.requested_by !== userId,
		contactId: formatContactId(r.contact_id as string),
		// eigener Name des Gegenübers ist für die verbundene Person sichtbar (wie bei Kontakten)
		name: (r.display_name as string | null) ?? null
	}));
}

/** Verbindungen, die eine betrachtende Person auf der Karte von ownerId sehen darf. */
export async function visibleLinks(sql: Sql, ownerId: string, viewerId: string | null, ownerVis: Visibility, ownerRel: Parameters<typeof canSee>[0]) {
	if (!canSee(ownerRel, ownerVis.family)) return [];
	const rows = await sql`select l.kind, p.user_id, p.contact_id, p.display_name, p.visibility from family_links l
		join user_profiles p on p.user_id = case when l.user_a = ${ownerId} then l.user_b else l.user_a end
		join users u on u.id = p.user_id and u.status = 'active'
		where ${ownerId} in (l.user_a, l.user_b) and l.status = 'aktiv'`;
	const out: { kind: string; name: string | null; contactIdFormatted: string; contactId: string; isContact: boolean }[] = [];
	for (const r of rows) {
		if (viewerId && (await isBlockedEither(sql, viewerId, r.user_id))) continue;
		const rel = await relationOf(sql, viewerId, r.user_id);
		const v = r.visibility as Visibility;
		if (!canSee(rel, v.family)) continue;
		out.push({
			kind: FAMILY_KINDS[r.kind as keyof typeof FAMILY_KINDS],
			name: canSee(rel, v.display_name) ? (r.display_name as string | null) : null,
			contactIdFormatted: formatContactId(r.contact_id as string),
			contactId: r.contact_id as string,
			isContact: rel === 'kontakt' || rel === 'selbst'
		});
	}
	return out;
}

export async function viewerIsContact(sql: Sql, viewerId: string | null, ownerId: string) {
	return !!viewerId && (await areContacts(sql, viewerId, ownerId));
}
