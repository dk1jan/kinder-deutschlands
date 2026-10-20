import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'audit.view');
	const rows = await db()`
		select a.at, a.action, a.target_type, a.target_id, a.reason, a.meta, (case when pf.contact_id is null then null else substr(pf.contact_id,1,3) || '-' || substr(pf.contact_id,4,3) || '-' || substr(pf.contact_id,7,3) end) as actor
		from audit_log a left join user_profiles pf on pf.user_id = a.actor_id
		order by a.at desc limit 200`;
	return {
		rows: rows.map((r) => ({
			at: new Date(r.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
			action: r.action as string,
			actor: (r.actor as string) ?? '–',
			target: r.target_type ? `${r.target_type}` : '–',
			reason: (r.reason as string) ?? '',
			meta: Object.entries((r.meta ?? {}) as Record<string, unknown>)
				.map(([k, v]) => `${k}=${v}`)
				.join(', ')
		}))
	};
};
