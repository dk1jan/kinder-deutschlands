import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { consumeEmailToken, peekEmailToken } from '$lib/server/tokens';
import { hashPassword, passwordProblem, PASSWORD_MIN } from '$lib/server/password';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async ({ url }) => {
	const t = url.searchParams.get('t') ?? '';
	return { token: t, valid: await peekEmailToken(db(), t, 'reset'), passwordMin: PASSWORD_MIN };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const f = await request.formData();
		const t = String(f.get('t') ?? '');
		const password = String(f.get('password') ?? '');
		const password2 = String(f.get('password2') ?? '');
		const problem = passwordProblem(password) ?? (password !== password2 ? 'Die beiden Passwörter stimmen nicht überein.' : null);
		if (problem) return fail(400, { error: problem });
		const sql = db();
		const userId = await consumeEmailToken(sql, t, 'reset');
		if (!userId) return fail(400, { error: 'Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen anfordern.' });
		await sql`update users set password_hash = ${await hashPassword(password)} where id = ${userId}`;
		// Alle Geräte abmelden
		await sql`delete from sessions where user_id = ${userId}`;
		await audit(sql, { actorId: userId, action: 'password.reset' });
		redirect(303, '/anmelden?neu=1');
	}
};
