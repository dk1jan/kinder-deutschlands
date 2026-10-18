import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { mailConfigured, mails, sendMail } from '$lib/server/mailer';
import { createEmailToken } from '$lib/server/tokens';
import { rateLimit } from '$lib/server/ratelimit';
import { appUrl } from '$lib/server/config';
import { EMAIL_RE } from '$lib/server/validate';

export const load: PageServerLoad = async () => ({ open: mailConfigured() });

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		if (!mailConfigured()) return fail(503, { error: 'Der E-Mail-Versand ist noch nicht eingerichtet.' });
		const email = String((await request.formData()).get('email') ?? '').trim().toLowerCase();
		if (!EMAIL_RE.test(email)) return fail(400, { email, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
		if (!rateLimit(`reset:ip:${getClientAddress()}`, 10, 3_600_000) || !rateLimit(`reset:mail:${email}`, 3, 3_600_000)) {
			return fail(429, { email, error: 'Zu viele Anfragen. Bitte in einer Stunde erneut versuchen.' });
		}
		const sql = db();
		const [u] = await sql`select id from users where email = ${email} and status = 'active' and email_verified_at is not null`;
		if (u) {
			try {
				const token = await createEmailToken(sql, u.id as string, 'reset');
				await sendMail(mails.reset(email, `${appUrl()}/passwort-neu?t=${token}`));
			} catch (e) {
				console.error('[passwort] E-Mail-Versand fehlgeschlagen:', e instanceof Error ? e.message : e);
				return fail(500, { email, error: 'Die E-Mail konnte nicht verschickt werden. Bitte später erneut versuchen.' });
			}
		}
		// Gleiche Antwort, ob es das Konto gibt oder nicht
		return { sent: true };
	}
};
