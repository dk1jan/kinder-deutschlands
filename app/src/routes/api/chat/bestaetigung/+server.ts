// Bestätigung für „Verschlüsselung neu einrichten“ (Kreuzsignierung ersetzen) – nur für das eigene Konto, 2 Minuten gültig.
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/chat/api';
import { ensureAccount, reauthToken } from '$lib/server/chat/synapse';
import { audit } from '$lib/server/audit';

export const POST: RequestHandler = (event) =>
	chatApi(event, async (sql, userId) => {
		const lp = await ensureAccount(sql, userId);
		await audit(sql, { actorId: userId, action: 'chat.keys.reset' });
		return { token: reauthToken(lp) };
	});
