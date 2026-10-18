import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { consumeEmailToken, peekEmailToken } from '$lib/server/tokens';
import { ensureProfile } from '$lib/server/profiles';
import { ensurePermanentQr } from '$lib/server/qr';
import { createSession } from '$lib/server/session';
import { setSessionCookie } from '$lib/server/auth';
import { audit } from '$lib/server/audit';

// Bestätigung per Knopfdruck (POST), nicht beim bloßen Öffnen: Link-Vorschauen in Mailprogrammen lösen sie so nicht aus.
export const load: PageServerLoad = async ({ url }) => {
	const t = url.searchParams.get('t') ?? '';
	return { token: t, valid: await peekEmailToken(db(), t, 'verify') };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const t = String((await request.formData()).get('t') ?? '');
		const sql = db();
		const userId = await consumeEmailToken(sql, t, 'verify');
		if (!userId) return fail(400, { error: 'Dieser Link ist abgelaufen oder wurde schon benutzt.' });
		const [u] = await sql`update users set email_verified_at = coalesce(email_verified_at, now())
			where id = ${userId} and status = 'active' returning id, (totp_enabled_at is not null) as mfa`;
		if (!u) return fail(400, { error: 'Dieses Konto ist nicht aktiv.' });
		await ensureProfile(sql, userId);
		await ensurePermanentQr(sql, userId);
		await audit(sql, { actorId: userId, action: 'account.verified' });
		const { token, expiresAt } = await createSession(sql, userId, !u.mfa, request.headers.get('user-agent'));
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, u.mfa ? '/anmelden/code?weiter=%2Fprofil' : '/profil?willkommen=1');
	}
};
