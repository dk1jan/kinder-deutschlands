// Partnerlinks (M08): Amazon-Links in offenen Community-Beiträgen bekommen – wenn in der Verwaltung eingeschaltet –
// die Partnerkennung von Kinder Deutschlands. Gespeichert wird immer der Originallink; umgewandelt wird nur beim Anzeigen.
// Regel für fremde Kennungen: nie überschreiben – der Link bleibt unverändert und wird sichtbar markiert (D-058).

export type AffiliateResult = { href: string; kind: 'ergaenzt' | 'fremd' | 'keiner' };

const AMAZON_DE = /(^|\.)amazon\.de$/i;

export function isAmazonDe(url: string): boolean {
	try {
		const u = new URL(url);
		return (u.protocol === 'https:' || u.protocol === 'http:') && AMAZON_DE.test(u.hostname);
	} catch {
		return false;
	}
}

/** Kennung prüfen (Format, nicht Gültigkeit – die kennt nur Amazon). */
export const validTag = (t: string) => /^[A-Za-z0-9][A-Za-z0-9-]{1,38}[A-Za-z0-9]$/.test(t);

export function affiliateLink(url: string, tag: string | null): AffiliateResult {
	if (!tag || !isAmazonDe(url)) return { href: url, kind: 'keiner' };
	const u = new URL(url);
	const existing = u.searchParams.get('tag');
	if (existing && existing !== tag) return { href: url, kind: 'fremd' };
	u.searchParams.set('tag', tag);
	u.protocol = 'https:';
	return { href: u.toString(), kind: 'ergaenzt' };
}

export const AFFILIATE_NOTE = 'Partnerlink: Kauft jemand darüber ein, kann Kinder Deutschlands eine Provision erhalten.';
export const FOREIGN_NOTE = 'Dieser Link enthält die Partnerkennung einer anderen Person oder Seite – wir ändern ihn nicht.';
