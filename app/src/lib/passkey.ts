import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

// Passkeys im Browser. Der Server prüft alles; hier wird nur die Geräte-Abfrage ausgelöst.

export async function passkeySupported(): Promise<boolean> {
	return browserSupportsWebAuthn();
}

async function post(url: string, body?: unknown) {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.message ?? 'Das hat nicht geklappt. Bitte erneut versuchen.');
	return data;
}

function friendly(e: unknown): Error {
	if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
		return new Error('Abgebrochen oder keine Antwort vom Gerät.');
	}
	return e instanceof Error ? e : new Error('Passkey fehlgeschlagen.');
}

/** Meldet mit einem Passkey an und gibt das Weiterleitungsziel zurück. */
export async function passkeyLogin(next: string | null): Promise<string> {
	const options = await post('/api/passkey/login/options');
	let response;
	try {
		response = await startAuthentication({ optionsJSON: options });
	} catch (e) {
		throw friendly(e);
	}
	const res = await post('/api/passkey/login/verify', { response, next });
	return res.redirect as string;
}

export async function passkeyRegister(name: string): Promise<void> {
	const options = await post('/api/passkey/register/options');
	let response;
	try {
		response = await startRegistration({ optionsJSON: options });
	} catch (e) {
		throw friendly(e);
	}
	await post('/api/passkey/register/verify', { response, name });
}
