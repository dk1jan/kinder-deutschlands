import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { hashPassword, passwordProblem, PASSWORD_MIN } from '$lib/server/password';
import { mailConfigured, mails, sendMail } from '$lib/server/mailer';
import { createEmailToken } from '$lib/server/tokens';
import { ensureProfile } from '$lib/server/profiles';
import { rateLimit } from '$lib/server/ratelimit';
import { audit } from '$lib/server/audit';
import { appUrl, key } from '$lib/server/config';
import { ipHash } from '$lib/server/crypto';
import { EMAIL_RE } from '$lib/server/validate';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/profil');
	return { open: mailConfigured(), passwordMin: PASSWORD_MIN };
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (!mailConfigured()) return fail(503, { error: 'Die Registrierung ist noch nicht geöffnet.' });
		const ip = getClientAddress();
		if (!rateLimit(`register:${ip}`, 5, 3_600_000)) {
			return fail(429, { error: 'Zu viele Registrierungen von diesem Anschluss. Bitte später erneut versuchen.' });
		}
		const f = await request.formData();
		const email = String(f.get('email') ?? '').trim().toLowerCase();
		const password = String(f.get('password') ?? '');
		const password2 = String(f.get('password2') ?? '');
		const adult = f.get('adult') === 'on';
		const errors: Record<string, string> = {};
		if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.';
		const pw = passwordProblem(password);
		if (pw) errors.password = pw;
		else if (password !== password2) errors.password2 = 'Die beiden Passwörter stimmen nicht überein.';
		if (!adult) errors.adult = 'Konten gibt es nur für Erwachsene.';
		if (Object.keys(errors).length) return fail(400, { email, errors });

		const sql = db();
		const [existing] = await sql`select id, status, email_verified_at from users where email = ${email}`;
		try {
			if (existing && existing.status !== 'deleted') {
				// Keine Auskunft, ob es die Adresse schon gibt: gleiche Antwort, aber passende E-Mail
				if (!existing.email_verified_at) {
					const token = await createEmailToken(sql, existing.id as string, 'verify');
					await sendMail(mails.verify(email, `${appUrl()}/registrieren/bestaetigen?t=${token}`));
				} else {
					await sendMail(mails.alreadyRegistered(email));
				}
			} else {
				const [u] = await sql`insert into users (email, password_hash) values (${email}, ${await hashPassword(password)}) returning id`;
				await ensureProfile(sql, u.id as string);
				const token = await createEmailToken(sql, u.id as string, 'verify');
				await audit(sql, { actorId: u.id as string, action: 'account.registered', ipHash: ipHash(ip, key('ip')) });
				await sendMail(mails.verify(email, `${appUrl()}/registrieren/bestaetigen?t=${token}`));
			}
		} catch (e) {
			console.error('[registrieren] E-Mail-Versand fehlgeschlagen:', e instanceof Error ? e.message : e);
			return fail(500, { email, error: 'Die Bestätigungs-E-Mail konnte nicht verschickt werden. Bitte später erneut versuchen.' });
		}
		return { sent: email };
	}
};
