import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { mailConfigured, mails, sendMail } from '$lib/server/mailer';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { systemChecks, backupStatus } from '$lib/server/system';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'admin.access');
	const sql = db();
	const [[counts], checks, backup] = await Promise.all([
		sql`select
			(select count(*)::int from users where status = 'active') as users,
			(select count(*)::int from users where status = 'active' and email_verified_at is null) as unverified,
			(select count(*)::int from contacts) as contacts,
			(select count(*)::int from sessions where expires_at > now()) as sessions,
			(select count(*)::int from audit_log where at > now() - interval '24 hours') as audit24,
			(select count(*)::int from audit_log where at > now() - interval '24 hours' and action in ('login.failed','mfa.failed','mfa.locked')) as failed24,
			(select count(*)::int from regions) as regions`,
		systemChecks(sql),
		backupStatus()
	]);
	return { counts, checks, backup, justSetUp: event.url.searchParams.has('eingerichtet'), mailOpen: mailConfigured() };
};

export const actions: Actions = {
	testmail: async (event) => {
		const user = await requireAction(event, 'mail.test');
		try {
			await sendMail(mails.test(user.email));
		} catch (e) {
			return fail(500, { mailError: `Versand fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannter Fehler'}` });
		}
		await audit(db(), { actorId: user.id, action: 'mail.test' });
		return { mailOk: `Test-E-Mail an ${user.email} verschickt. Bitte Posteingang und Spam-Ordner prüfen.` };
	}
};
