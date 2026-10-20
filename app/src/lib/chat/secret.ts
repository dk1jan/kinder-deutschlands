// Chat-Schlüssel aus dem Passwort (F-004, D-066). Im Browser wird aus Passwort und Chat-Kennung ein Geheimnis
// abgeleitet (PBKDF2, 310 000 Runden). Daraus entsteht – nochmals mit eigener Ableitung des Matrix-Standards –
// der Schlüssel der verschlüsselten Sicherung. Der Server bekommt das Geheimnis nie; gespeichert wird es nur
// in diesem Browser (localStorage), damit das Gerät sich beim Chat-Start selbst entsperrt.
const KEY = 'kd_chat_secret';
const ROUNDS = 310_000;

function b64(buf: ArrayBuffer): string {
	let s = '';
	for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
	return btoa(s);
}

export async function deriveChatSecret(password: string, mxid: string): Promise<string> {
	const enc = new TextEncoder();
	const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`kinder-deutschlands/chat/v1:${mxid}`), iterations: ROUNDS }, base, 256);
	return b64(bits);
}

export function storeSecret(mxid: string, secret: string) {
	try {
		localStorage.setItem(KEY, JSON.stringify({ mxid, s: secret }));
	} catch {
		/* privater Modus: dann fragt der Chat beim nächsten Start einmal nach dem Passwort */
	}
}

export function readSecret(mxid: string): string | null {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { mxid: string; s: string } | null;
		return v && v.mxid === mxid ? v.s : null;
	} catch {
		return null;
	}
}

export function clearSecret() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* egal */
	}
}

/**
 * Nach Anmeldung oder Passwortwechsel: Chat-Kennung holen (legt das Chat-Konto bei Bedarf an) und Geheimnis ablegen.
 * Klappt das nicht (z. B. Chat-Server gerade weg), fragt der Chat später einmal nach dem Passwort.
 */
export async function rememberPassword(password: string): Promise<string | null> {
	try {
		const r = await fetch('/api/chat/salz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
		if (!r.ok) return null;
		const { mxid } = (await r.json()) as { mxid: string };
		const s = await deriveChatSecret(password, mxid);
		storeSecret(mxid, s);
		return s;
	} catch {
		return null;
	}
}
