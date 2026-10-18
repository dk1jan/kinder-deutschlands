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
	return {
		relation,
		pending: !!pending,
		card: { ...cardFor(p, relation), contactIdFormatted: formatContactId(p.contact_id) }
	};
}
