import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { verifyAuthentication } from '$lib/server/webauthn';
import { requireSameOrigin } from '$lib/server/api';
import { createSession } from '$lib/server/session';
import { setSessionCookie, safeRedirectTarget } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { ipHash } from '$lib/server/crypto';
import { key } from '$lib/server/config';

// Passkey mit Nutzerverifikation (PIN/Biometrie) = Besitz + Wissen/Merkmal → gilt als zweiter Faktor.
export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event);
	const body = await event.request.json().catch(() => null);
	if (!body?.response) error(400, 'Ungültige Anfrage.');
	const sql = db();
	let userId: string;
	try {
		userId = await verifyAuthentication(sql, event.cookies, body.response);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Passkey ungültig.');
	}
	const [u] = await sql`select email_verified_at from users where id = ${userId} and status = 'active'`;
	if (!u?.email_verified_at) error(403, 'Bitte bestätige zuerst deine E-Mail-Adresse.');
	const { token, expiresAt } = await createSession(sql, userId, true, event.request.headers.get('user-agent'));
	setSessionCookie(event.cookies, token, expiresAt);
	await sql`update users set last_login_at = now() where id = ${userId}`;
	await audit(sql, { actorId: userId, action: 'login.succeeded', meta: { passkey: true }, ipHash: ipHash(event.getClientAddress(), key('ip')) });
	return json({ redirect: safeRedirectTarget(typeof body.next === 'string' ? body.next : null, '/profil') });
};
