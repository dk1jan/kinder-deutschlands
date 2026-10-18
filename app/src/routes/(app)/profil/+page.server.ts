import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { deleteSession } from '$lib/server/session';
import { clearSessionCookie } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { ensureProfile, getProfile } from '$lib/server/profiles';
import { ensurePermanentQr, qrSvg } from '$lib/server/qr';
import { formatContactId } from '$lib/server/contactid';
import { mailConfigured } from '$lib/server/mailer';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !locals.session?.mfaVerified) return { member: null, mailOpen: mailConfigured() };
	const sql = db();
	const userId = locals.user.id;
	await ensureProfile(sql, userId);
	await ensurePermanentQr(sql, userId);
	const p = (await getProfile(sql, userId))!;
	const [q] = await sql`select token from qr_tokens where user_id = ${userId} and kind = 'dauerhaft' and revoked_at is null`;
	const [counts] = await sql`select
		(select count(*)::int from contacts where user_a = ${userId} or user_b = ${userId}) as contacts,
		(select count(*)::int from contact_requests where to_user = ${userId} and status = 'offen') as requests,
		(select count(*)::int from webauthn_credentials where user_id = ${userId}) as passkeys,
		(select (totp_enabled_at is not null) from users where id = ${userId}) as totp`;
	return {
		member: {
			contactId: formatContactId(p.contact_id),
			displayName: p.display_name,
			preset: p.privacy_preset,
			discoverable: p.discoverable,
			complete: !!(p.display_name || p.can_help || p.looking_for || p.interests.length),
			qr: q ? await qrSvg(q.token as string) : '',
			counts
		},
		welcome: url.searchParams.has('willkommen'),
		mailOpen: mailConfigured()
	};
};

export const actions: Actions = {
	abmelden: async ({ locals, cookies }) => {
		if (locals.session) {
			const sql = db();
			await deleteSession(sql, locals.session.idHash);
			if (locals.user) await audit(sql, { actorId: locals.user.id, action: 'logout' });
		}
		clearSessionCookie(cookies);
		redirect(303, '/');
	}
};
