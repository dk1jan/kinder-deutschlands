import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt aus Node (keine native Zusatzbibliothek). Parameter entsprechen OWASP-Empfehlung (N=2^17, r=8, p=1).
const N = 2 ** 17;
const r = 8;
const p = 1;
const KEYLEN = 32;
const MAXMEM = 256 * 1024 * 1024;

function scrypt(pw: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
	return new Promise((resolve, reject) =>
		scryptCb(pw.normalize('NFKC'), salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key)))
	);
}

export const PASSWORD_MIN = 12;

export function passwordProblem(pw: string): string | null {
	if (pw.length < PASSWORD_MIN) return `Das Passwort braucht mindestens ${PASSWORD_MIN} Zeichen.`;
	if (pw.length > 256) return 'Das Passwort darf höchstens 256 Zeichen lang sein.';
	return null;
}

export async function hashPassword(pw: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await scrypt(pw, salt, { N, r, p, maxmem: MAXMEM });
	return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
	const [alg, n, rr, pp, salt, hash] = stored.split('$');
	if (alg !== 'scrypt' || !salt || !hash) return false;
	const key = await scrypt(pw, Buffer.from(salt, 'base64url'), {
		N: Number(n),
		r: Number(rr),
		p: Number(pp),
		maxmem: MAXMEM
	});
	const expected = Buffer.from(hash, 'base64url');
	return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Für unbekannte Konten trotzdem rechnen, damit die Antwortzeit nichts verrät. */
const DUMMY = 'scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export async function burnPasswordCheck(pw: string): Promise<void> {
	await verifyPassword(pw, DUMMY);
}
