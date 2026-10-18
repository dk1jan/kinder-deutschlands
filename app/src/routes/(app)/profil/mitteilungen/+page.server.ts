import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const items = await sql`select id, kind, text, link, created_at, read_at from notifications where user_id = ${user.id} order by created_at desc limit 100`;
	const restrictions = await sql`select kind, reason, until, created_at from user_restrictions where user_id = ${user.id} and lifted_at is null and (until is null or until > now() or kind = 'verwarnung') order by created_at desc limit 10`;
	// Beim Öffnen als gelesen markieren
	await sql`update notifications set read_at = now() where user_id = ${user.id} and read_at is null`;
	return { items, restrictions };
};

export const actions: Actions = {
	leeren: async (event) => {
		const user = requireMember(event);
		await db()`delete from notifications where user_id = ${user.id}`;
		return { ok: true };
	}
};
