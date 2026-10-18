import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { deleteAccount } from '$lib/server/account';
import { verifyPassword } from '$lib/server/password';
import { clearSessionCookie } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	return {};
};

export const actions: Actions = {
	loeschen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		if (String(f.get('confirm') ?? '').trim().toUpperCase() !== 'LÖSCHEN') {
			return fail(400, { error: 'Bitte zur Bestätigung LÖSCHEN eintippen.' });
		}
		const sql = db();
		const [u] = await sql`select password_hash from users where id = ${user.id}`;
		if (!(await verifyPassword(String(f.get('current') ?? ''), u.password_hash))) return fail(400, { error: 'Das Passwort stimmt nicht.' });
		try {
			await deleteAccount(sql, user.id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Löschen fehlgeschlagen.' });
		}
		clearSessionCookie(event.cookies);
		redirect(303, '/?geloescht=1');
	}
};
