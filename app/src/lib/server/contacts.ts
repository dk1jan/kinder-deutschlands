import type { Sql } from './db';
import { audit } from './audit';
import { areContacts, isBlockedEither } from './profiles';

export class ContactError extends Error {}

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function sendRequest(sql: Sql, from: string, to: string, message: string | null, via: 'id' | 'qr' | 'entdecken') {
	if (from === to) throw new ContactError('Das ist deine eigene ID.');
	if (await isBlockedEither(sql, from, to)) throw new ContactError('Keine Familie mit dieser ID gefunden.');
	if (await areContacts(sql, from, to)) throw new ContactError('Ihr seid schon verbunden.');
	// Gegenanfrage offen? Dann direkt verbinden.
	const [reverse] = await sql`select id from contact_requests where from_user = ${to} and to_user = ${from} and status = 'offen'`;
	if (reverse) {
		await respond(sql, from, reverse.id as string, true);
		return 'verbunden' as const;
	}
	const [{ n }] = await sql`select count(*)::int as n from contact_requests where from_user = ${from} and created_at > now() - interval '1 day'`;
	if (n >= 30) throw new ContactError('Du hast heute schon viele Anfragen gestellt. Bitte morgen weitermachen.');
	const [row] = await sql`insert into contact_requests (from_user, to_user, message, via)
		values (${from}, ${to}, ${message}, ${via}) on conflict do nothing returning id`;
	if (!row) throw new ContactError('Du hast dieser Familie schon eine Anfrage geschickt.');
	await audit(sql, { actorId: from, action: 'contact.requested', targetType: 'request', targetId: row.id as string, meta: { via } });
	return 'angefragt' as const;
}

export async function respond(sql: Sql, userId: string, requestId: string, accept: boolean) {
	if (!isUuid(requestId)) throw new ContactError('Diese Anfrage gibt es nicht mehr.');
	await sql.begin(async (tx) => {
		const [r] = await tx`select id, from_user, to_user from contact_requests
			where id = ${requestId} and to_user = ${userId} and status = 'offen' for update`;
		if (!r) throw new ContactError('Diese Anfrage gibt es nicht mehr.');
		await tx`update contact_requests set status = ${accept ? 'angenommen' : 'abgelehnt'}, decided_at = now() where id = ${requestId}`;
		if (accept) {
			const [a, b] = pair(r.from_user as string, r.to_user as string);
			await tx`insert into contacts (user_a, user_b) values (${a}, ${b}) on conflict do nothing`;
		}
		await audit(tx as unknown as Sql, { actorId: userId, action: accept ? 'contact.accepted' : 'contact.declined', targetType: 'request', targetId: requestId });
	});
}

export async function withdraw(sql: Sql, userId: string, requestId: string) {
	if (!isUuid(requestId)) throw new ContactError('Diese Anfrage gibt es nicht mehr.');
	const [r] = await sql`update contact_requests set status = 'zurueckgezogen', decided_at = now()
		where id = ${requestId} and from_user = ${userId} and status = 'offen' returning id`;
	if (!r) throw new ContactError('Diese Anfrage gibt es nicht mehr.');
}

export async function removeContact(sql: Sql, userId: string, otherId: string) {
	const [a, b] = pair(userId, otherId);
	await sql`delete from contacts where user_a = ${a} and user_b = ${b}`;
	await audit(sql, { actorId: userId, action: 'contact.removed' });
}

/** Blockieren beendet Kontakt und offene Anfragen in beide Richtungen. */
export async function block(sql: Sql, userId: string, otherId: string) {
	if (userId === otherId) throw new ContactError('Du kannst dich nicht selbst blockieren.');
	await sql.begin(async (tx) => {
		await tx`insert into blocks (blocker, blocked) values (${userId}, ${otherId}) on conflict do nothing`;
		const [a, b] = pair(userId, otherId);
		await tx`delete from contacts where user_a = ${a} and user_b = ${b}`;
		await tx`update contact_requests set status = 'abgelehnt', decided_at = now()
			where status = 'offen' and ((from_user = ${userId} and to_user = ${otherId}) or (from_user = ${otherId} and to_user = ${userId}))`;
		await audit(tx as unknown as Sql, { actorId: userId, action: 'contact.blocked' });
	});
}

export async function unblock(sql: Sql, userId: string, otherId: string) {
	await sql`delete from blocks where blocker = ${userId} and blocked = ${otherId}`;
	await audit(sql, { actorId: userId, action: 'contact.unblocked' });
}

export async function overview(sql: Sql, userId: string) {
	const [contacts, incoming, outgoing, blocked] = await Promise.all([
		sql`select p.user_id, p.contact_id, p.display_name, p.visibility, c.created_at
			from contacts c
			join user_profiles p on p.user_id = case when c.user_a = ${userId} then c.user_b else c.user_a end
			join users u on u.id = p.user_id and u.status = 'active'
			where c.user_a = ${userId} or c.user_b = ${userId}
			order by coalesce(p.display_name, p.contact_id)`,
		sql`select r.id, r.message, r.via, r.created_at, p.contact_id, p.display_name, p.visibility
			from contact_requests r join user_profiles p on p.user_id = r.from_user
			join users u on u.id = r.from_user and u.status = 'active'
			where r.to_user = ${userId} and r.status = 'offen' order by r.created_at desc`,
		sql`select r.id, r.created_at, p.contact_id
			from contact_requests r join user_profiles p on p.user_id = r.to_user
			where r.from_user = ${userId} and r.status = 'offen' order by r.created_at desc`,
		sql`select b.blocked as user_id, p.contact_id, b.created_at
			from blocks b join user_profiles p on p.user_id = b.blocked
			where b.blocker = ${userId} order by b.created_at desc`
	]);
	return { contacts, incoming, outgoing, blocked };
}

/** Freiwillige Entdeckung: nur Profile mit „auffindbar“, nie blockierte, nie man selbst. */
export async function discover(sql: Sql, viewerId: string, regionCode: string | null) {
	return sql`
		select p.user_id, p.contact_id, p.display_name, p.can_help, p.looking_for, p.interests, p.child_ages,
		       r.name as region_name, p.visibility
		from user_profiles p
		join users u on u.id = p.user_id and u.status = 'active' and u.email_verified_at is not null
		left join regions r on r.code = p.region_code
		where p.discoverable and p.user_id <> ${viewerId}
		  and (${regionCode}::text is null or p.region_code in (
		      with recursive sub as (select code from regions where code = ${regionCode}
		        union all select r.code from regions r join sub on r.parent_code = sub.code)
		      select code from sub))
		  and not exists (select 1 from blocks b where (b.blocker = ${viewerId} and b.blocked = p.user_id) or (b.blocker = p.user_id and b.blocked = ${viewerId}))
		order by p.updated_at desc limit 50`;
}
