// Gemeinsame Begriffe für Marktplatz, Familien helfen Familien, Lebenslagen-Kompass und Einladungen.

export const MARKET_KINDS = {
	verkaufen: 'Verkaufe',
	verschenken: 'Verschenke',
	tauschen: 'Tausche',
	suchen: 'Suche'
} as const;
export type MarketKind = keyof typeof MARKET_KINDS;

export const MARKET_CATEGORIES = {
	kinderwagen: 'Kinderwagen & Buggys',
	kleidung: 'Kleidung & Schuhe',
	spielzeug: 'Spielzeug',
	buecher: 'Bücher & Medien',
	fahrraeder: 'Fahrräder & Fahrzeuge',
	ausstattung: 'Ausstattung & Pflege',
	moebel: 'Kinderzimmer & Möbel',
	autositz: 'Autositze & Babyschalen',
	sonstiges: 'Sonstiges'
} as const;
export type MarketCategory = keyof typeof MARKET_CATEGORIES;

/** Sicherheitsrelevante Kinderprodukte: Anbietende bestätigen Angaben, Interessierte sehen einen Hinweis (D-051). */
export const SAFETY_CATEGORIES: readonly string[] = ['autositz', 'kinderwagen'];

export const CONDITIONS = {
	neu: 'Neu',
	wie_neu: 'Wie neu',
	gut: 'Gut',
	gebraucht: 'Gebraucht',
	defekt: 'Defekt / für Bastler'
} as const;

export const LISTING_STATUS = {
	pruefung: 'Wird geprüft',
	verfuegbar: 'Verfügbar',
	reserviert: 'Reserviert',
	abgegeben: 'Abgegeben',
	abgelaufen: 'Abgelaufen',
	entfernt: 'Entfernt'
} as const;

export function priceLabel(kind: string, cents: number | null, negotiable: boolean): string {
	if (kind === 'verschenken') return 'zu verschenken';
	if (kind === 'tauschen') return 'zum Tauschen';
	if (kind === 'suchen') return cents !== null ? `bis ${euro(cents)}` : 'gesucht';
	if (cents === null) return negotiable ? 'Preis VB' : 'Preis auf Anfrage';
	return `${euro(cents)}${negotiable ? ' VB' : ''}`;
}

export const euro = (cents: number) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const HELP_KINDS = { brauche: 'Ich brauche Hilfe', biete: 'Ich kann helfen' } as const;
export const HELP_CATEGORIES = {
	antraege: 'Anträge & Behörden',
	alltag: 'Alltagsorganisation',
	kleidung: 'Kleidung & Ausstattung',
	kontakte: 'Anschluss & Kontakte',
	lokales: 'Lokale Angebote kennen',
	sonstiges: 'Sonstiges'
} as const;

/**
 * Offizielle Notruf- und Krisennummern (Quelle: Familienportal des BMFSFJ, „Krisentelefone und Anlaufstellen“,
 * abgerufen 19.10.2026; Notrufe 110/112). Unser Chat ist kein Notfalldienst.
 */
export const CRISIS_SOURCE = 'https://familienportal.de/familienportal/lebenslagen/krise-und-konflikt/krisetelefone-anlaufstellen';
export const CRISIS_LINES: { name: string; number: string; tel: string; hours: string }[] = [
	{ name: 'Notruf (Rettungsdienst, Feuerwehr)', number: '112', tel: '112', hours: 'rund um die Uhr' },
	{ name: 'Polizei', number: '110', tel: '110', hours: 'rund um die Uhr' },
	{ name: 'Telefonseelsorge', number: '0800 111 0 111 oder 0800 111 0 222', tel: '08001110111', hours: 'rund um die Uhr' },
	{ name: 'Elterntelefon (Nummer gegen Kummer)', number: '0800 111 0 550', tel: '08001110550', hours: 'Mo, Mi, Fr 9–17 Uhr, Di, Do 9–19 Uhr, kostenlos, anonym' },
	{ name: 'Kinder- und Jugendtelefon (Nummer gegen Kummer)', number: '116 111', tel: '116111', hours: 'Mo–Sa 14–20 Uhr, kostenlos, anonym' },
	{ name: 'Hilfetelefon Gewalt gegen Frauen', number: '08000 116 016', tel: '08000116016', hours: 'rund um die Uhr, kostenlos, anonym' },
	{ name: 'Hilfetelefon Schwangere in Not', number: '0800 40 40 020', tel: '08004040020', hours: 'rund um die Uhr, kostenlos' },
	{ name: 'Hilfe-Telefon Sexueller Missbrauch', number: '0800 22 55 530', tel: '08002255530', hours: 'kostenlos, anonym' }
];
