import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db';
import { deleteSession } from '$lib/server/session';
import { clearSessionCookie } from '$lib/server/auth';
import { audit } from '$lib/server/audit';

export const actions: Actions = {
	abmelden: async ({ locals, cookies }) => {
		if (locals.session) {
			const sql = db();
			await deleteSession(sql, locals.session.idHash);
			if (locals.user) await audit(sql, { actorId: locals.user.id, action: 'logout' });
		}
		clearSessionCookie(cookies);
		redirect(303, '/');
	}
};
