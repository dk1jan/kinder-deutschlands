import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { verifyPassword, burnPasswordCheck } from '$lib/server/password';
import { createSession } from '$lib/server/session';
import { setSessionCookie, safeRedirectTarget } from '$lib/server/auth';
import { rateLimit } from '$lib/server/ratelimit';
import { audit } from '$lib/server/audit';
import { ipHash } from '$lib/server/crypto';
import { appUrl, key } from '$lib/server/config';
import { mailConfigured, mails, sendMail } from '$lib/server/mailer';
import { createEmailToken } from '$lib/server/tokens';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user && locals.session?.mfaVerified) redirect(303, '/profil');
	if (locals.user && !locals.session?.mfaVerified) redirect(303, '/anmelden/code');
	return { next: url.searchParams.get('weiter'), reset: url.searchParams.has('neu'), mailOpen: mailConfigured() };
};

const GENERIC = 'E-Mail-Adresse oder Passwort stimmen nicht.';

export const actions: Actions = {
	anmelden: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		const ip = getClientAddress();

		if (!rateLimit(`login:ip:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:mail:${email}`, 8, 15 * 60_000)) {
			return fail(429, { email, error: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' });
		}
		if (!email || !password) return fail(400, { email, error: 'Bitte E-Mail-Adresse und Passwort eingeben.' });

		const sql = db();
		const [user] = await sql`select id, password_hash, status, totp_enabled_at, email_verified_at from users where email = ${email}`;
		if (!user) {
			await burnPasswordCheck(password);
			return fail(400, { email, error: GENERIC });
		}
		const ok = await verifyPassword(password, user.password_hash);
		if (!ok || user.status !== 'active') {
			await audit(sql, { actorId: user.id, action: 'login.failed', ipHash: ipHash(ip, key('ip')) });
			return fail(400, { email, error: GENERIC });
		}
		if (!user.email_verified_at) {
			return fail(403, { email, unverified: true, error: 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in unserer E-Mail.' });
		}

		const needsMfa = !!user.totp_enabled_at;
		const { token, expiresAt } = await createSession(sql, user.id, !needsMfa, request.headers.get('user-agent'));
		setSessionCookie(cookies, token, expiresAt);
		const next = safeRedirectTarget(url.searchParams.get('weiter'), '/profil');
		if (needsMfa) redirect(303, `/anmelden/code?weiter=${encodeURIComponent(next)}`);
		await sql`update users set last_login_at = now() where id = ${user.id}`;
		await audit(sql, { actorId: user.id, action: 'login.succeeded', ipHash: ipHash(ip, key('ip')) });
		redirect(303, next);
	},

	/** Bestätigungs-E-Mail erneut senden (keine Auskunft, ob das Konto existiert). */
	erneut: async ({ request, getClientAddress }) => {
		const email = String((await request.formData()).get('email') ?? '').trim().toLowerCase();
		if (!mailConfigured()) return fail(503, { email, error: 'Der E-Mail-Versand ist noch nicht eingerichtet.' });
		if (!rateLimit(`resend:${getClientAddress()}`, 5, 3_600_000) || !rateLimit(`resend:${email}`, 3, 3_600_000)) {
			return fail(429, { email, error: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
		}
		const sql = db();
		const [u] = await sql`select id from users where email = ${email} and status = 'active' and email_verified_at is null`;
		if (u) {
			const token = await createEmailToken(sql, u.id as string, 'verify');
			await sendMail(mails.verify(email, `${appUrl()}/registrieren/bestaetigen?t=${token}`)).catch((e) =>
				console.error('[erneut] Versand fehlgeschlagen:', e instanceof Error ? e.message : e)
			);
		}
		return { email, resent: true };
	}
};
