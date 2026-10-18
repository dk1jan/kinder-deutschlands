import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { systemChecks, backupStatus } from '$lib/server/system';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'admin.access');
	const sql = db();
	const [[counts], checks, backup] = await Promise.all([
		sql`select
			(select count(*)::int from users where status = 'active') as users,
			(select count(*)::int from sessions where expires_at > now()) as sessions,
			(select count(*)::int from audit_log where at > now() - interval '24 hours') as audit24,
			(select count(*)::int from audit_log where at > now() - interval '24 hours' and action in ('login.failed','mfa.failed','mfa.locked')) as failed24,
			(select count(*)::int from regions) as regions`,
		systemChecks(sql),
		backupStatus()
	]);
	return { counts, checks, backup, justSetUp: event.url.searchParams.has('eingerichtet') };
};
