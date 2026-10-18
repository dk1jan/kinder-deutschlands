import { randomInt } from 'node:crypto';

// Öffentliche Kontakt-ID (DECISIONS D-014):
// 8 zufällige Zeichen + 1 Prüfzeichen aus dem Crockford-Base32-Alphabet, angezeigt als „K7M-4QX-2HD“.
// Nicht fortlaufend, ~40 Bit Zufall, Tippfehler werden über das Prüfzeichen erkannt.
// Beim Eingeben werden O→0, I/L→1, Leerzeichen und Bindestriche toleriert, Groß/Klein egal.
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function checkChar(body: string): string {
	let sum = 0;
	for (let i = 0; i < body.length; i++) sum += (i + 1) * ALPHABET.indexOf(body[i]);
	return ALPHABET[sum % 32];
}

export function generateContactId(): string {
	let body = '';
	for (let i = 0; i < 8; i++) body += ALPHABET[randomInt(32)];
	return body + checkChar(body);
}

/** Normalisiert eine Eingabe; gibt null zurück, wenn sie keine gültige ID sein kann (inkl. falschem Prüfzeichen). */
export function normalizeContactId(input: string): string | null {
	const s = input
		.toUpperCase()
		.replace(/[\s\-_.]/g, '')
		.replace(/O/g, '0')
		.replace(/[IL]/g, '1');
	if (s.length !== 9) return null;
	for (const ch of s) if (!ALPHABET.includes(ch)) return null;
	return checkChar(s.slice(0, 8)) === s[8] ? s : null;
}

export function formatContactId(id: string): string {
	return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6, 9)}`;
}
