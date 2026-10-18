import { createHmac, randomBytes } from 'node:crypto';

// TOTP nach RFC 6238 (SHA-1, 6 Stellen, 30 s) – kompatibel mit gängigen Authenticator-Apps.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of buf) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return out;
}

export function base32Decode(s: string): Buffer {
	const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of clean) {
		value = (value << 5) | ALPHABET.indexOf(ch);
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

export function generateTotpSecret(): string {
	return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(counter));
	const h = createHmac('sha1', secret).update(msg).digest();
	const offset = h[h.length - 1] & 0x0f;
	const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
	return String(bin % 10 ** digits).padStart(digits, '0');
}

export function currentStep(nowMs = Date.now()): number {
	return Math.floor(nowMs / 1000 / 30);
}

/**
 * Prüft einen Code mit ±1 Zeitfenster. Gibt den verwendeten Zeitschritt zurück (für Replay-Schutz) oder null.
 * Codes mit Schritt <= lastStep werden abgelehnt.
 */
export function verifyTotp(secretB32: string, code: string, lastStep: number | null, nowMs = Date.now()): number | null {
	const c = code.replace(/\s/g, '');
	if (!/^\d{6}$/.test(c)) return null;
	const secret = base32Decode(secretB32);
	const now = currentStep(nowMs);
	for (const step of [now - 1, now, now + 1]) {
		if (lastStep !== null && step <= lastStep) continue;
		if (hotp(secret, step) === c) return step;
	}
	return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'Kinder Deutschlands'): string {
	const label = encodeURIComponent(`${issuer}:${account}`);
	return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
