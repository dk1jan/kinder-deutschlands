// Kontakte für den Chat (nur bestätigte, nicht blockierte). Legt fehlende Chat-Konten der Kontakte an.
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/chat/api';
import { overview } from '$lib/server/contacts';
import { ensureAccount, mxid } from '$lib/server/chat/synapse';

export const GET: RequestHandler = (event) =>
	chatApi(event, async (sql, userId) => {
		const o = await overview(sql, userId);
		const out = [];
		for (const c of o.contacts.slice(0, 500)) {
			const lp = await ensureAccount(sql, c.user_id as string);
			// Kontakte sehen den Anzeigenamen, außer er ist auf „nur ich“ gestellt
			const name = c.display_name && c.visibility?.display_name !== 'niemand' ? (c.display_name as string) : null;
			out.push({ contactId: c.contact_id as string, name, mxid: mxid(lp) });
		}
		return { contacts: out };
	});
