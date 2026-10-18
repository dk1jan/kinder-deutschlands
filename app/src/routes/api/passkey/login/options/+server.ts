import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticationOptions } from '$lib/server/webauthn';
import { requireSameOrigin } from '$lib/server/api';
import { rateLimit } from '$lib/server/ratelimit';

export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event);
	if (!rateLimit(`pk-login:${event.getClientAddress()}`, 30, 15 * 60_000)) error(429, 'Zu viele Versuche.');
	return json(await authenticationOptions(event.cookies));
};
