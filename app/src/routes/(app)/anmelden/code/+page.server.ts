import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { verifyTotp } from '$lib/server/totp';
import { decrypt, ipHash } from '$lib/server/crypto';
import { key } from '$lib/server/config';
import { markMfaVerified, deleteSession } from '$lib/server/session';
import { clearSessionCookie, safeRedirectTarget } from '$lib/server/auth';
import { rateLimit } from '$lib/server/ratelimit';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/anmelden');
	if (locals.session?.mfaVerified) redirect(303, '/profil');
	return {};
};

export const actions: Actions = {
	verify: async ({ request, locals, getClientAddress, url, cookies }) => {
		if (!locals.user || !locals.session) redirect(303, '/anmelden');
		const sql = db();
		const ip = getClientAddress();
		if (!rateLimit(`mfa:${locals.user.id}`, 6, 15 * 60_000)) {
			// Zu viele Fehlversuche: Sitzung beenden, neu anmelden
			await deleteSession(sql, locals.session.idHash);
			clearSessionCookie(cookies);
			await audit(sql, { actorId: locals.user.id, action: 'mfa.locked', ipHash: ipHash(ip, key('ip')) });
			return fail(429, { error: 'Zu viele falsche Codes. Bitte in 15 Minuten neu anmelden.' });
		}
		const code = String((await request.formData()).get('code') ?? '');
		const [u] = await sql`select totp_secret_enc, totp_last_step from users where id = ${locals.user.id}`;
		if (!u?.totp_secret_enc) return fail(400, { error: 'Für dieses Konto ist keine Zwei-Faktor-Anmeldung eingerichtet.' });
		const secret = decrypt(u.totp_secret_enc, key('totp'));
		const lastStep = u.totp_last_step === null ? null : Number(u.totp_last_step);
		const step = verifyTotp(secret, code, lastStep);
		if (step === null) {
			await audit(sql, { actorId: locals.user.id, action: 'mfa.failed', ipHash: ipHash(ip, key('ip')) });
			return fail(400, { error: 'Der Code stimmt nicht oder wurde schon verwendet. Bitte den aktuellen Code eingeben.' });
		}
		await sql`update users set totp_last_step = ${step}, last_login_at = now() where id = ${locals.user.id}`;
		await markMfaVerified(sql, locals.session.idHash);
		await audit(sql, { actorId: locals.user.id, action: 'login.succeeded', meta: { mfa: true }, ipHash: ipHash(ip, key('ip')) });
		redirect(303, safeRedirectTarget(url.searchParams.get('weiter'), '/profil'));
	}
};
