// Automatische Vormarkierung (M24). Entscheidet nie endgültig: markiert für die Moderation, hält höchstens
// bis zur Prüfung zurück (private Daten, Drohungen). Fehlalarme sind eingeplant – Menschen entscheiden.

export interface Flag {
	reason: 'private_daten' | 'drohung' | 'beleidigung' | 'spam' | 'problematischer_link' | 'betrugsverdacht';
	priority: 1 | 2 | 3;
	/** bis zur Prüfung zurückhalten */
	hold: boolean;
	detail: string;
}

export const REASON_LABEL: Record<string, string> = {
	private_daten: 'Mögliche private Daten',
	drohung: 'Mögliche Drohung',
	beleidigung: 'Mögliche Beleidigung',
	spam: 'Möglicher Spam',
	problematischer_link: 'Problematischer Link',
	betrugsverdacht: 'Betrugsverdacht',
	unangemessen: 'Unangemessen',
	kinderfoto: 'Erkennbares Kind / Kinderfoto',
	falsch: 'Falschinformation',
	sonstiges: 'Sonstiges',
	neues_ortsfoto: 'Neues Ortsfoto (Freigabe)',
	einspruch: 'Einspruch gegen Entscheidung'
};

const norm = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[0@]/g, 'o')
		.replace(/[1!|]/g, 'i')
		.replace(/3/g, 'e')
		.replace(/4/g, 'a')
		.replace(/\$/g, 's');

const INSULTS = ['arschloch', 'hurensohn', 'fotze', 'wichser', 'missgeburt', 'spast', 'schlampe', 'vollidiot', 'drecksau', 'bastard', 'hure', 'penner', 'mongo', 'behindi', 'kanake', 'schwuchtel', 'nazi-schlampe', 'fick dich', 'verpiss dich'];
const THREATS = [/\bich (bring|mach) (dich|euch) (um|kalt|fertig)\b/, /\bumbringen\b/, /\babstechen\b/, /\bich wei(ss|ß) wo (du|ihr) wohn/, /\bdu bist tot\b/, /\b(bombe|amoklauf|anschlag)\b/, /\bich (schlag|hau) (dich|dir)\b/];
const FRAUD = [/\bvorkasse\b/, /western union/, /moneygram/, /paysafe/, /\bgiftcard|gutscheincode\b/, /\bkrypto|bitcoin|usdt\b/, /\bsofort (geld|gewinn)\b/, /\bgewinnspiel\b.*\b(klick|link)\b/, /\bwhats ?app\b.*\b(schreib|melde)\b/, /\bverdien\w* (von zuhause|ohne)\b/];
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'ow.ly', 'rebrand.ly', 'shorturl.at', 't.ly', 'rb.gy', 's.id'];
const BAD_TLD = /\.(zip|mov|xyz|top|click|loan|work|gq|tk|ml|cf)$/i;

const PHONE = /(?:\+|00)\s?\d{2}[\s/.-]?\(?\d{2,5}\)?(?:[\s/.-]?\d{2,}){2,}|\b0\d{2,5}[\s/.-]?\d{3,}(?:[\s/.-]?\d{2,})*\b/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/;

function digits(s: string) {
	return s.replace(/\D/g, '').length;
}

export function checkText(text: string, opts: { links?: string[] } = {}): Flag[] {
	const flags: Flag[] = [];
	const n = norm(text);
	const phone = PHONE.exec(text);
	if (phone && digits(phone[0]) >= 9 && !/\b(19|20)\d{2}\b/.test(phone[0].trim())) flags.push({ reason: 'private_daten', priority: 2, hold: true, detail: 'Telefonnummer' });
	if (EMAIL.test(text)) flags.push({ reason: 'private_daten', priority: 2, hold: true, detail: 'E-Mail-Adresse' });
	if (IBAN.test(text.toUpperCase())) flags.push({ reason: 'private_daten', priority: 2, hold: true, detail: 'Kontonummer (IBAN)' });
	const th = THREATS.find((r) => r.test(n));
	if (th) flags.push({ reason: 'drohung', priority: 1, hold: true, detail: 'Drohwort' });
	const ins = INSULTS.find((w) => new RegExp(`(^|[^a-z])${w.replace(/[-]/g, '[- ]?')}([^a-z]|$)`).test(n));
	if (ins) flags.push({ reason: 'beleidigung', priority: 2, hold: false, detail: 'Schimpfwort' });
	if (FRAUD.some((r) => r.test(n))) flags.push({ reason: 'betrugsverdacht', priority: 2, hold: false, detail: 'typische Betrugsformulierung' });
	const urls = opts.links ?? [...text.matchAll(/https?:\/\/[^\s<>"]+/g)].map((m) => m[0]);
	if (urls.length > 4) flags.push({ reason: 'spam', priority: 3, hold: false, detail: `${urls.length} Links` });
	const letters = text.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
	if (letters.length > 60 && letters.replace(/[^A-ZÄÖÜ]/g, '').length / letters.length > 0.7) flags.push({ reason: 'spam', priority: 3, hold: false, detail: 'überwiegend Großbuchstaben' });
	for (const u of urls) {
		try {
			const h = new URL(u).hostname.toLowerCase();
			if (SHORTENERS.includes(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith('[') || BAD_TLD.test(h) || h.startsWith('xn--')) {
				flags.push({ reason: 'problematischer_link', priority: 2, hold: false, detail: h });
				break;
			}
		} catch {
			/* ungültig – wird ohnehin nicht verlinkt */
		}
	}
	return flags;
}

/** Hinweistext an die Autorin/den Autor, wenn etwas zurückgehalten wird. */
export function holdMessage(flags: Flag[]): string | null {
	const h = flags.filter((f) => f.hold);
	if (!h.length) return null;
	if (h.some((f) => f.reason === 'private_daten'))
		return 'Dein Text enthält vermutlich eine Telefonnummer, E-Mail- oder Kontonummer. Zu deinem Schutz prüft die Moderation ihn kurz, bevor andere ihn sehen. Tipp: Kontakt lieber über die Familien-ID.';
	return 'Dein Text wird kurz von der Moderation geprüft, bevor andere ihn sehen.';
}
