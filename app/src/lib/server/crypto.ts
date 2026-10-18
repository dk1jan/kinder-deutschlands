import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256hex(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ba.length !== bb.length) return false;
	return timingSafeEqual(ba, bb);
}

/** Leitet aus APP_SECRET je Zweck einen eigenen Schlüssel ab (HKDF-SHA256). */
export function deriveKey(secret: string, purpose: string): Buffer {
	if (!secret || secret.length < 32) throw new Error('APP_SECRET fehlt oder ist kürzer als 32 Zeichen.');
	return Buffer.from(hkdfSync('sha256', secret, 'kinder-deutschlands', purpose, 32));
}

/** AES-256-GCM. Format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function encrypt(plain: string, key: Buffer): string {
	const iv = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
	return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(token: string, key: Buffer): string {
	const [v, iv, tag, ct] = token.split('.');
	if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Ungültiges Chiffrat');
	const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
	d.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export function hmac(data: string, key: Buffer): string {
	return createHmac('sha256', key).update(data).digest('base64url');
}

/** IP nur gehasht und tagesbezogen gesalzen protokollieren – keine dauerhafte Rückverfolgung. */
export function ipHash(ip: string, key: Buffer): string {
	const day = new Date().toISOString().slice(0, 10);
	return hmac(`${day}|${ip}`, key).slice(0, 16);
}
