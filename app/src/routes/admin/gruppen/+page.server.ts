import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { saveGroup } from '$lib/server/community/groups';
import { PostError } from '$lib/server/community/posts';
import { isUuid } from '$lib/server/contacts';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'group.manage');
	const sql = db();
	const [groups, topics] = await Promise.all([
		sql`select g.*, r.name as region_name, (select count(*)::int from group_members m where m.group_id = g.id and m.status = 'aktiv') as members,
				(select count(*)::int from group_members m where m.group_id = g.id and m.status = 'angefragt') as pending,
				(select count(*)::int from role_assignments a where a.scope_type = 'group' and a.scope_id = g.id::text and a.revoked_at is null) as mods
			from community_groups g left join regions r on r.code = g.region_code order by g.name`,
		sql`select key, name from topics order by sort`
	]);
	return { groups, topics, edit: event.url.searchParams.get('bearbeiten') };
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'group.manage');
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		try {
			await saveGroup(db(), user.id, isUuid(id) ? id : null, {
				slug: String(f.get('slug') ?? '').trim(),
				name: String(f.get('name') ?? ''),
				description: String(f.get('description') ?? ''),
				rules: String(f.get('rules') ?? '').trim() || null,
				kind: String(f.get('kind') ?? ''),
				topicKey: String(f.get('topic') ?? '') || null,
				regionCode: String(f.get('region_code') ?? '') || null,
				admission: String(f.get('admission') ?? '').split('\n')
			});
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			if ((e as { code?: string }).code === '23505') return fail(400, { error: 'Kurzname ist schon vergeben.' });
			throw e;
		}
		return { ok: 'Gespeichert.' };
	}
};
