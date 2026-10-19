// Gemeinsame Begriffe für Veranstaltungen, Angebote, Einrichtungen, Hinweise und Radar (Server und Oberfläche).

/** Radar-Themen (M05, festgehaltenes Beispiel Bremen) – auch zum Verschlagworten von Terminen, Angeboten, Hinweisen. */
export const RADAR_TOPICS = {
	leistungen: 'Familienleistungen & Vergünstigungen',
	betreuung: 'Kita, Betreuung & Elternkurse',
	beratung: 'Beratung, Jugendhilfe & Selbsthilfe',
	freizeit: 'Veranstaltungen & Ferienangebote',
	gesundheit: 'Gesundheit & Entwicklung'
} as const;
export type RadarTopic = keyof typeof RADAR_TOPICS;
export const isRadarTopic = (t: unknown): t is RadarTopic => typeof t === 'string' && t in RADAR_TOPICS;

export const EVENT_KINDS = {
	flohmarkt: 'Kinderflohmarkt',
	fest: 'Fest',
	kurs: 'Kurs',
	workshop: 'Workshop',
	ferien: 'Ferienprogramm',
	verein: 'Vereinsangebot',
	treffen: 'Treffen',
	beratung: 'Beratung / Sprechstunde',
	sonstiges: 'Sonstiges'
} as const;
export type EventKind = keyof typeof EVENT_KINDS;

export const ORG_KINDS = {
	familienzentrum: 'Familienzentrum / Haus der Familie',
	beratung: 'Beratungsstelle',
	jugendhilfe: 'Jugendhilfe',
	kommune: 'Kommune / Amt',
	verein: 'Verein',
	kita: 'Kita / Betreuung',
	kursanbieter: 'Kursanbieter',
	veranstalter: 'Veranstalter',
	gesundheit: 'Gesundheit',
	sonstiges: 'Sonstige Einrichtung'
} as const;
export type OrgKind = keyof typeof ORG_KINDS;

export const OFFER_KINDS = {
	elternkurs: 'Elternkurs',
	babyschwimmen: 'Babyschwimmen',
	ferienprogramm: 'Ferienprogramm',
	betreuung: 'Betreuung',
	kurs: 'Kurs',
	beratung: 'Beratung',
	sonstiges: 'Sonstiges'
} as const;
export type OfferKind = keyof typeof OFFER_KINDS;

/** Verfügbarkeit: ohne gültige Bestätigung immer „unbekannt“ – fehlende Angaben heißen nie „frei“. */
export const AVAILABILITY = {
	frei: 'Plätze frei',
	wenige: 'Wenige Plätze',
	warteliste: 'Warteliste',
	ausgebucht: 'Ausgebucht',
	unbekannt: 'Verfügbarkeit unbekannt'
} as const;
export type Availability = keyof typeof AVAILABILITY;

export const NOTICE_KINDS = {
	neu: 'Neu',
	aktualisiert: 'Aktualisiert',
	absage: 'Absage',
	frist: 'Frist',
	sperrung: 'Sperrung',
	leistung: 'Leistung / Vergünstigung',
	info: 'Information'
} as const;
export type NoticeKind = keyof typeof NOTICE_KINDS;

/** Herkunft eines Hinweises – immer sichtbar (M20). */
export const SOURCE_KINDS = {
	amtlich: 'Amtlich bestätigt',
	anbieter: 'Anbieterinformation',
	redaktion: 'Redaktion',
	mitglied: 'Hinweis eines Mitglieds – ungeprüft'
} as const;
export type SourceKind = keyof typeof SOURCE_KINDS;

export const ORIGINS = {
	anbieter: 'Vom Anbieter',
	mitglied: 'Von einem Mitglied',
	redaktion: 'Redaktion',
	import: 'Aus einer Quelle übernommen'
} as const;

export const ACCESSIBILITY = {
	kinderwagen: 'Kinderwagengerecht',
	rollstuhl: 'Rollstuhlgerecht',
	barrierearm: 'Barrierearm',
	wickeln: 'Wickelmöglichkeit',
	gebaerdensprache: 'Gebärdensprache',
	einfache_sprache: 'Einfache Sprache'
} as const;

export const SETTINGS = { drinnen: 'Drinnen', draussen: 'Draußen', beides: 'Drinnen und draußen' } as const;

export const VISIBILITY = {
	oeffentlich: 'Öffentlich – auch ohne Konto im Internet sichtbar',
	mitglieder: 'Im Netzwerk – nur für angemeldete Mitglieder',
	privat: 'Privat – nur wer den Link hat'
} as const;

/** Altersgruppen für Filter und Radar (Jahre, inklusive). */
export const AGE_GROUPS = {
	'0-1': { label: 'unter 1 Jahr', min: 0, max: 0 },
	'1-3': { label: '1–3 Jahre', min: 1, max: 3 },
	'3-6': { label: '3–6 Jahre', min: 3, max: 6 },
	'6-10': { label: '6–10 Jahre', min: 6, max: 10 },
	'10-14': { label: '10–14 Jahre', min: 10, max: 14 },
	'14-18': { label: '14–18 Jahre', min: 14, max: 18 }
} as const;
export type AgeGroup = keyof typeof AGE_GROUPS;

export function ageLabel(min: number | null, max: number | null): string | null {
	if (min === null && max === null) return null;
	if (min !== null && max !== null) return min === max ? `${min} Jahre` : `${min}–${max} Jahre`;
	if (min !== null) return `ab ${min} Jahren`;
	return `bis ${max} Jahre`;
}

/** Passt eine Altersspanne zu mindestens einer gewählten Altersgruppe? Ohne Angabe passt alles. */
export function ageMatches(min: number | null, max: number | null, groups: string[]): boolean {
	if (!groups.length || (min === null && max === null)) return true;
	const lo = min ?? 0, hi = max ?? 18;
	return groups.some((g) => {
		const a = AGE_GROUPS[g as AgeGroup];
		return a && lo <= a.max && hi >= a.min;
	});
}
