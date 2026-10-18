import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'users.view');
	const sql = db();
	const users = await sql`
		select u.id, u.email, u.status, u.created_at, u.last_login_at, (u.totp_enabled_at is not null) as mfa,
		       coalesce(array_agg(ra.role_key order by ra.role_key) filter (where ra.id is not null), '{}') as roles
		from users u
		left join role_assignments ra on ra.user_id = u.id and ra.revoked_at is null and (ra.expires_at is null or ra.expires_at > now())
		group by u.id order by u.created_at limit 500`;
	return {
		users: users.map((u) => ({
			id: u.id as string,
			email: u.email as string,
			status: u.status as string,
			created: new Date(u.created_at).toLocaleDateString('de-DE'),
			lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–',
			mfa: u.mfa as boolean,
			roles: u.roles as string[]
		}))
	};
};
