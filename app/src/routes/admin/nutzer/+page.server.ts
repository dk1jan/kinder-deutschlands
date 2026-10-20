import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { canMessage, messageUser } from '$lib/server/adminmsg';
import { PostError } from '$lib/server/community/posts';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'users.view');
	const sql = db();
	const users = await sql`
		select u.id, u.status, u.created_at, u.last_login_at, (u.totp_enabled_at is not null) as mfa,
		       (u.email_verified_at is not null) as verified, p.contact_id,
		       (select count(*)::int from webauthn_credentials w where w.user_id = u.id) as passkeys,
		       coalesce(array_agg(ra.role_key order by ra.role_key) filter (where ra.id is not null), '{}') as roles
		from users u
		left join user_profiles p on p.user_id = u.id
		left join role_assignments ra on ra.user_id = u.id and ra.revoked_at is null and (ra.expires_at is null or ra.expires_at > now())
		group by u.id, p.contact_id order by u.created_at limit 500`;
	return {
		users: users.map((u) => ({
			id: u.id as string,
			status: u.status as string,
			created: new Date(u.created_at).toLocaleDateString('de-DE'),
			lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '–',
			mfa: u.mfa as boolean,
			verified: u.verified as boolean,
			passkeys: u.passkeys as number,
			contactId: u.contact_id ? `${(u.contact_id as string).slice(0, 3)}-${(u.contact_id as string).slice(3, 6)}-${(u.contact_id as string).slice(6)}` : '–',
			roles: u.roles as string[]
		}))
	};
};

export const actions: Actions = {
	nachricht: async (event) => {
		const user = await requireAction(event, 'admin.access');
		const sql = db();
		if (!(await canMessage(sql, user.id))) return fail(403, { msgError: 'Dafür fehlt die Berechtigung.', cid: '', text: '' });
		const f = await event.request.formData();
		try {
			await messageUser(sql, user.id, { contactId: String(f.get('cid') ?? '') }, String(f.get('text') ?? ''));
		} catch (e) {
			if (e instanceof PostError) return fail(400, { msgError: e.message, cid: String(f.get('cid') ?? ''), text: String(f.get('text') ?? '') });
			throw e;
		}
		return { msgOk: 'Nachricht zugestellt (erscheint in den Mitteilungen des Mitglieds).' };
	}
};
