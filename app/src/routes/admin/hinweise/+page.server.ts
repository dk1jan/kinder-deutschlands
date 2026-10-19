import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { archiveNotice, createNotice } from '$lib/server/angebote/notices';
import { formValues, noticeFromForm } from '$lib/server/angebote/forms';
import { isUuid } from '$lib/server/angebote/common';

async function editor(event: Parameters<PageServerLoad>[0] | Parameters<Actions[string]>[0]) {
	const user = await requireAction(event, 'admin.access');
	const [x] = await db()`select exists(select 1 from role_assignments a join role_permissions p on p.role_key = a.role_key where a.user_id = ${user.id} and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()) and p.action in ('*', 'notices.edit')) as ok`;
	if (!x.ok) error(403, 'Dafür fehlt die Berechtigung.');
	return user;
}

export const load: PageServerLoad = async (event) => {
	await editor(event);
	const rows = await db()`select n.id, n.kind, n.title, n.source_kind, n.urgent, n.deadline, n.valid_until, n.created_at, n.status, r.name as region_name, o.name as org_name
		from notices n left join regions r on r.code = n.region_code left join organizations o on o.id = n.org_id
		where n.status = 'aktiv' and (n.valid_until is null or n.valid_until > now()) order by n.created_at desc limit 200`;
	return {
		rows: rows.map((n) => ({ id: n.id as string, kind: n.kind as string, title: n.title as string, sourceKind: n.source_kind as string, urgent: n.urgent as boolean,
			deadline: n.deadline as Date | null, validUntil: n.valid_until as Date | null, created: n.created_at as Date, regionName: n.region_name as string | null, orgName: n.org_name as string | null }))
	};
};

export const actions: Actions = {
	neu: async (event) => {
		const user = await editor(event);
		const f = await event.request.formData();
		try {
			await createNotice(db(), user.id, noticeFromForm(f));
			return { ok: 'Veröffentlicht.' };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message, values: formValues(f) });
			throw e;
		}
	},
	beenden: async (event) => {
		const user = await editor(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		try {
			await archiveNotice(db(), user.id, id);
			return { ok: 'Beendet.' };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	}
};
