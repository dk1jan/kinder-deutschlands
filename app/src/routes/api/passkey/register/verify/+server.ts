import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { verifyRegistration } from '$lib/server/webauthn';
import { requireSameOrigin } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event);
	const { user, session } = event.locals;
	if (!user || !session?.mfaVerified) error(401, 'Bitte zuerst vollständig anmelden.');
	const body = await event.request.json().catch(() => null);
	if (!body?.response) error(400, 'Ungültige Anfrage.');
	try {
		await verifyRegistration(db(), event.cookies, user.id, body.response, String(body.name ?? 'Passkey'));
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Passkey konnte nicht gespeichert werden.');
	}
	return json({ ok: true });
};
