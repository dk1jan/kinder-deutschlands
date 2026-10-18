import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { registrationOptions } from '$lib/server/webauthn';
import { requireSameOrigin } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event);
	const { user, session } = event.locals;
	if (!user || !session?.mfaVerified) error(401, 'Bitte zuerst vollständig anmelden.');
	return json(await registrationOptions(db(), event.cookies, user));
};
