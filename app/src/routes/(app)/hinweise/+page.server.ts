import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { listNotices } from '$lib/server/angebote/notices';
import { isUuid } from '$lib/server/angebote/common';
import { isSaved, setReminder, toggleSaved } from '$lib/server/angebote/saved';
import { userCan } from '$lib/server/roles';
import { NOTICE_KINDS, RADAR_TOPICS } from '$lib/angebote';

export const load: PageServerLoad = async ({ url, locals }) => {
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const p = url.searchParams;
	let region = p.get('region') || null;
	// Ohne Auswahl: eigene Region aus dem Profil (falls hinterlegt)
	if (!region && viewer && !p.has('region')) {
		const [u] = await sql`select region_code from user_profiles where user_id = ${viewer}`;
		region = (u?.region_code as string | null) ?? null;
	}
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const kinds = p.getAll('art').filter((k) => k in NOTICE_KINDS);
	const topics = p.getAll('thema').filter((t) => t in RADAR_TOPICS);
	const r = await listNotices(sql, { region: regionRow?.code ?? null, kinds, topics });
	const saved = viewer && r.notices.length ? await sql`select item_id, remind_at from saved_items where user_id = ${viewer} and kind = 'notice' and item_id = any(${r.notices.map((n) => n.id)})` : [];
	return {
		...r,
		saved: Object.fromEntries(saved.map((s) => [s.item_id as string, (s.remind_at as Date | null)?.toISOString() ?? ''])),
		filters: { region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null, kinds, topics },
		member: !!viewer,
		editor: viewer ? await userCan(sql, viewer, 'notices.edit') : false
	};
};

async function run<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	merken: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) error(404);
		return run(async () => ({ saved: await toggleSaved(db(), user.id, 'notice', id, null), id }));
	},
	erinnern: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) error(404);
		return run(async () => {
			const sql = db();
			if (!(await isSaved(sql, user.id, 'notice', id, null))) await toggleSaved(sql, user.id, 'notice', id, null);
			const at = await setReminder(sql, user.id, 'notice', id, null, String(f.get('offset') ?? ''));
			return { reminded: at?.toISOString() ?? null, id };
		});
	}
};
