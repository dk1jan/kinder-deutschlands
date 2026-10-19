import type { RequestHandler } from './$types';
import { chatApi } from '$lib/server/chat/api';
import { pushTest } from '$lib/server/push';
import { rateLimit } from '$lib/server/ratelimit';
import { ChatError } from '$lib/server/chat/synapse';

export const POST: RequestHandler = (event) =>
	chatApi(
		event,
		async (sql, userId) => {
			if (!rateLimit(`pushtest:${userId}`, 10, 3600_000)) throw new ChatError('Bitte später erneut testen.');
			return { sent: await pushTest(sql, userId) };
		},
		{ needsChat: false }
	);
