import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import type { Cookies } from '@sveltejs/kit';
import type { Sql } from './db';
import { appUrl, isHttps, key } from './config';
import { decrypt, encrypt } from './crypto';
import { audit } from './audit';

// Passkeys (WebAuthn). Die Herausforderung liegt verschlüsselt in einem kurzlebigen Cookie.
const COOKIE = 'kd_wa';

function rp() {
	const url = new URL(appUrl());
	return { rpID: url.hostname, origin: url.origin };
}

function setChallenge(cookies: Cookies, kind: 'reg' | 'auth', challenge: string, userId?: string) {
	cookies.set(COOKIE, encrypt(JSON.stringify({ kind, challenge, userId, exp: Date.now() + 5 * 60_000 }), key('webauthn')), {
		path: '/',
		httpOnly: true,
		secure: isHttps(),
		sameSite: 'strict',
		maxAge: 300
	});
}

function takeChallenge(cookies: Cookies, kind: 'reg' | 'auth'): { challenge: string; userId?: string } | null {
	const raw = cookies.get(COOKIE);
	cookies.delete(COOKIE, { path: '/' });
	if (!raw) return null;
	try {
		const s = JSON.parse(decrypt(raw, key('webauthn')));
		return s.kind === kind && s.exp > Date.now() ? s : null;
	} catch {
		return null;
	}
}

export async function registrationOptions(sql: Sql, cookies: Cookies, user: { id: string; email: string }) {
	const existing = await sql`select id, transports from webauthn_credentials where user_id = ${user.id}`;
	const opts = await generateRegistrationOptions({
		rpName: 'Kinder Deutschlands',
		rpID: rp().rpID,
		userName: user.email,
		userID: new TextEncoder().encode(user.id),
		attestationType: 'none',
		excludeCredentials: existing.map((c) => ({ id: c.id as string, transports: c.transports as AuthenticatorTransportFuture[] })),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
	});
	setChallenge(cookies, 'reg', opts.challenge, user.id);
	return opts;
}

export async function verifyRegistration(sql: Sql, cookies: Cookies, userId: string, response: RegistrationResponseJSON, name: string) {
	const c = takeChallenge(cookies, 'reg');
	if (!c || c.userId !== userId) throw new Error('Die Anfrage ist abgelaufen. Bitte erneut versuchen.');
	const { rpID, origin } = rp();
	const v = await verifyRegistrationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
	if (!v.verified || !v.registrationInfo) throw new Error('Der Passkey konnte nicht bestätigt werden.');
	const cred = v.registrationInfo.credential;
	await sql`insert into webauthn_credentials (id, user_id, public_key, counter, transports, name)
		values (${cred.id}, ${userId}, ${Buffer.from(cred.publicKey)}, ${cred.counter}, ${cred.transports ?? []}, ${name.slice(0, 60) || 'Passkey'})`;
	await audit(sql, { actorId: userId, action: 'passkey.added' });
}

export async function authenticationOptions(cookies: Cookies) {
	const opts = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: 'required', allowCredentials: [] });
	setChallenge(cookies, 'auth', opts.challenge);
	return opts;
}

/** Gibt die Nutzer-ID zurück, wenn der Passkey gültig ist (mit Nutzerverifikation = zwei Faktoren). */
export async function verifyAuthentication(sql: Sql, cookies: Cookies, response: AuthenticationResponseJSON): Promise<string> {
	const c = takeChallenge(cookies, 'auth');
	if (!c) throw new Error('Die Anfrage ist abgelaufen. Bitte erneut versuchen.');
	const [cred] = await sql`select w.id, w.user_id, w.public_key, w.counter, w.transports
		from webauthn_credentials w join users u on u.id = w.user_id and u.status = 'active'
		where w.id = ${response.id}`;
	if (!cred) throw new Error('Dieser Passkey ist nicht (mehr) hinterlegt.');
	const { rpID, origin } = rp();
	const v = await verifyAuthenticationResponse({
		response,
		expectedChallenge: c.challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		requireUserVerification: true,
		credential: {
			id: cred.id as string,
			publicKey: new Uint8Array(cred.public_key as Buffer),
			counter: Number(cred.counter),
			transports: cred.transports as AuthenticatorTransportFuture[]
		}
	});
	if (!v.verified) throw new Error('Der Passkey konnte nicht bestätigt werden.');
	await sql`update webauthn_credentials set counter = ${v.authenticationInfo.newCounter}, last_used_at = now() where id = ${cred.id}`;
	return cred.user_id as string;
}
