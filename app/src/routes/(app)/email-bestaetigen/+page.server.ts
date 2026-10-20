import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { consumeChangeToken, peekEmailToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { mails, sendMail } from '$lib/server/mailer';

// Neue E-Mail-Adresse bestätigen (per Knopf, damit Link-Vorschauen in Mailprogrammen nichts auslösen).
export const load: PageServerLoad = async ({ url }) => {
	const t = url.searchParams.get('t') ?? '';
	return { token: t, valid: await peekEmailToken(db(), t, 'change') };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const t = String((await request.formData()).get('t') ?? '');
		const sql = db();
		const c = await consumeChangeToken(sql, t);
		if (!c) return fail(400, { error: 'Dieser Link ist abgelaufen oder wurde schon benutzt.' });
		const [old] = await sql`select email from users where id = ${c.userId} and status = 'active'`;
		if (!old) return fail(400, { error: 'Dieses Konto ist nicht aktiv.' });
		try {
			await sql`update users set email = ${c.newEmail}, email_verified_at = now() where id = ${c.userId}`;
		} catch (e) {
			if ((e as { code?: string }).code === '23505') return fail(400, { error: 'Diese Adresse wird inzwischen schon verwendet.' });
			throw e;
		}
		await audit(sql, { actorId: c.userId, action: 'email.changed' });
		await sendMail(mails.changeNotice(old.email as string)).catch(() => {});
		return { ok: true };
	}
};
