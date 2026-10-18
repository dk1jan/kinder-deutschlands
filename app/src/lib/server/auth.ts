import type { Cookies } from '@sveltejs/kit';
import { SESSION_COOKIE } from './session';
import { isHttps } from './config';

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: isHttps(),
		sameSite: 'lax',
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/** Nur relative Weiterleitungen innerhalb der Plattform zulassen. */
export function safeRedirectTarget(target: string | null, fallback: string): string {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
	return target;
}
