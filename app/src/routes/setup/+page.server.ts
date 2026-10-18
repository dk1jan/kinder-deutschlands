import { error, fail, redirect } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { isSetupComplete, verifySetupToken, completeSetup, SetupLockedError } from '$lib/server/setup';
import { systemChecks } from '$lib/server/system';
import { decrypt, encrypt, ipHash } from '$lib/server/crypto';
import { key, isHttps } from '$lib/server/config';
import { generateTotpSecret, otpauthUri, verifyTotp } from '$lib/server/totp';
import { hashPassword, passwordProblem, PASSWORD_MIN } from '$lib/server/password';
import { createSession } from '$lib/server/session';
import { setSessionCookie } from '$lib/server/auth';
import { rateLimit } from '$lib/server/ratelimit';

const COOKIE = 'kd_setup';
const TTL_MS = 30 * 60_000;

interface SetupState {
	exp: number;
	totp: string;
}

function readState(raw: string | undefined): SetupState | null {
	if (!raw) return null;
	try {
		const s = JSON.parse(decrypt(raw, key('setup'))) as SetupState;
		return s.exp > Date.now() ? s : null;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ cookies }) => {
	const sql = db();
	if (await isSetupComplete(sql)) error(404, 'Die Einrichtung ist abgeschlossen.');
	const state = readState(cookies.get(COOKIE));
	if (!state) return { step: 'token' as const, checks: [], qr: '', secret: '', passwordMin: PASSWORD_MIN };
	const qr = await QRCode.toString(otpauthUri(state.totp, 'Betreiber'), { type: 'svg', margin: 1 });
	return {
		step: 'konto' as const,
		checks: await systemChecks(sql),
		qr,
		secret: state.totp.replace(/(.{4})/g, '$1 ').trim(),
		passwordMin: PASSWORD_MIN
	};
};

export const actions: Actions = {
	token: async ({ request, cookies, getClientAddress }) => {
		const sql = db();
		if (await isSetupComplete(sql)) error(404, 'Die Einrichtung ist abgeschlossen.');
		if (!rateLimit(`setup:${getClientAddress()}`, 5, 15 * 60_000)) {
			return fail(429, { tokenError: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' });
		}
		const token = String((await request.formData()).get('token') ?? '');
		if (!(await verifySetupToken(sql, token))) {
			return fail(400, { tokenError: 'Das Token stimmt nicht. Es steht im Log des Containers „web“ und ändert sich bei jedem Neustart.' });
		}
		const state: SetupState = { exp: Date.now() + TTL_MS, totp: generateTotpSecret() };
		cookies.set(COOKIE, encrypt(JSON.stringify(state), key('setup')), {
			path: '/setup',
			httpOnly: true,
			secure: isHttps(),
			sameSite: 'strict',
			maxAge: TTL_MS / 1000
		});
		redirect(303, '/setup');
	},

	konto: async ({ request, cookies, getClientAddress }) => {
		const sql = db();
		if (await isSetupComplete(sql)) error(404, 'Die Einrichtung ist abgeschlossen.');
		const state = readState(cookies.get(COOKIE));
		if (!state) redirect(303, '/setup');

		const f = await request.formData();
		const email = String(f.get('email') ?? '').trim().toLowerCase();
		const password = String(f.get('password') ?? '');
		const password2 = String(f.get('password2') ?? '');
		const code = String(f.get('code') ?? '');
		const errors: Record<string, string> = {};

		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.';
		const pwProblem = passwordProblem(password);
		if (pwProblem) errors.password = pwProblem;
		else if (password !== password2) errors.password2 = 'Die beiden Passwörter stimmen nicht überein.';
		const step = verifyTotp(state.totp, code, null);
		if (step === null) errors.code = 'Der Code stimmt nicht. Bitte den aktuellen Code aus der App eingeben.';
		if (Object.keys(errors).length) return fail(400, { email, errors });

		let userId: string;
		try {
			userId = await completeSetup(sql, {
				email,
				passwordHash: await hashPassword(password),
				totpSecretEnc: encrypt(state.totp, key('totp')),
				totpStep: step!,
				ipHash: ipHash(getClientAddress(), key('ip'))
			});
		} catch (e) {
			if (e instanceof SetupLockedError) error(404, 'Die Einrichtung ist abgeschlossen.');
			throw e;
		}
		cookies.delete(COOKIE, { path: '/setup' });
		const { token, expiresAt } = await createSession(sql, userId, true, request.headers.get('user-agent'));
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, '/admin?eingerichtet=1');
	}
};
