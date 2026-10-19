// Anmeldedaten für den Chat im Browser: kurzlebiges Token für das eigene Chat-Konto (2 Minuten gültig).
import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/chat/api';
import { chatDisplayName, ensureAccount, loginJwt, mxid } from '$lib/server/chat/synapse';
import { getSettings, PUSH_APP_ID, vapidKeys } from '$lib/server/push';
import { appUrl } from '$lib/server/config';

export const POST: RequestHandler = (event) =>
	chatApi(event, async (sql, userId) => {
		const lp = await ensureAccount(sql, userId);
		const [settings, keys] = await Promise.all([getSettings(sql, userId), vapidKeys(sql)]);
		return {
			homeserver: appUrl(),
			userId: mxid(lp),
			token: loginJwt(lp),
			displayName: await chatDisplayName(sql, userId),
			push: { appId: PUSH_APP_ID, url: (process.env.CHAT_INTERNAL_URL || 'http://web:3000').replace(/\/$/, '') + '/_matrix/push/v1/notify', vapidPublicKey: keys.publicKey },
			settings: { readReceipts: settings.read_receipts, typing: settings.typing }
		};
	});
