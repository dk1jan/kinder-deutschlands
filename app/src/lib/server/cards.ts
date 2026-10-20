import type { Sql } from './db';
import { getProfile, isBlockedEither, relationOf } from './profiles';
import { formatContactId } from './contactid';
import { cardFor, type Relation } from '$lib/visibility';

/** Kontaktkarte für einen Betrachter. null, wenn nicht anzeigbar (gelöscht, gesperrt, blockiert). */
export async function cardForViewer(sql: Sql, ownerId: string, viewerId: string | null) {
	if (viewerId && viewerId !== ownerId && (await isBlockedEither(sql, viewerId, ownerId))) return null;
	const p = await getProfile(sql, ownerId);
	if (!p) return null;
	const relation: Relation = await relationOf(sql, viewerId, ownerId);
	const [pending] = viewerId
		? await sql`select 1 from contact_requests where from_user = ${viewerId} and to_user = ${ownerId} and status = 'offen'`
		: [];
	const { visibleLinks } = await import('./family');
	const family = await visibleLinks(sql, ownerId, viewerId, { ...p.visibility }, relation);
	return {
		relation,
		pending: !!pending,
		card: { ...cardFor(p, relation), family, contactIdFormatted: formatContactId(p.contact_id) },
		// „Gemeinsam schreiben“: nur wer mit allen Beteiligten Kontakt ist (Chat-Regeln wie bei Gruppen)
		writeTogether: relation === 'kontakt' && family.length > 0 && family.every((f) => f.isContact) ? [p.contact_id, ...family.map((f) => f.contactId)] : null
	};
}
