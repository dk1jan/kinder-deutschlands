import { env } from '$env/dynamic/private';
import { deriveKey } from './crypto';

export function appUrl(): string {
	return (env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function isHttps(): boolean {
	return appUrl().startsWith('https://');
}

export function allowIndexing(): boolean {
	return env.ALLOW_INDEXING === 'true';
}

const keys = new Map<string, Buffer>();
/** Zweckgebundener Schlüssel aus APP_SECRET (z. B. 'totp', 'setup', 'ip'). */
export function key(purpose: string): Buffer {
	let k = keys.get(purpose);
	if (!k) {
		k = deriveKey(env.APP_SECRET || '', purpose);
		keys.set(purpose, k);
	}
	return k;
}

export function smtpConfigured(): boolean {
	return !!(env.SMTP_HOST && env.SMTP_FROM);
}

export function gitSha(): string {
	return env.GIT_SHA || 'lokal';
}
