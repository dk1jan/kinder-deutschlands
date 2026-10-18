// Ortsarten und Merkmale – gemeinsam für Server, Karte, Liste und Detailseite.
// Merkmale sind dreiwertig: true (ja), false (nein), fehlt (unbekannt). „Unbekannt“ wird ehrlich so angezeigt.

export const KINDS = {
	spielplatz: { label: 'Spielplatz', plural: 'Spielplätze', color: '#ffc53d', ink: '#0f2238', icon: 'spielplatz' },
	indoorspielplatz: { label: 'Indoorspielplatz', plural: 'Indoorspielplätze', color: '#d63d31', ink: '#ffffff', icon: 'indoor' },
	wickelraum: { label: 'Wickelmöglichkeit', plural: 'Wickeln', color: '#a9d4ec', ink: '#0f2238', icon: 'wickeln' },
	toilette: { label: 'Toilette', plural: 'Toiletten', color: '#1f7468', ink: '#ffffff', icon: 'wc' },
	stillraum: { label: 'Stillmöglichkeit', plural: 'Stillen', color: '#a9d4ec', ink: '#0f2238', icon: 'stillen' },
	familiencafe: { label: 'Familiencafé', plural: 'Familiencafés', color: '#d63d31', ink: '#ffffff', icon: 'cafe' },
	ausflugsort: { label: 'Ausflugsort', plural: 'Ausflugsorte', color: '#0f2238', ink: '#ffc53d', icon: 'ausflug' },
	schwimmbad: { label: 'Schwimmbad', plural: 'Bäder', color: '#1f7468', ink: '#ffffff', icon: 'bad' }
} as const;
export type Kind = keyof typeof KINDS;
export const KIND_KEYS = Object.keys(KINDS) as Kind[];
export const isKind = (k: unknown): k is Kind => typeof k === 'string' && k in KINDS;

/** Filter-Chips auf der Karte. „Wickeln“ umfasst auch Toiletten mit Wickeltisch. */
export const KIND_FILTERS: { key: string; label: string; kinds: Kind[]; feature?: string }[] = [
	{ key: 'spielplatz', label: 'Spielplätze', kinds: ['spielplatz'] },
	{ key: 'wickeln', label: 'Wickeln', kinds: ['wickelraum'], feature: 'wickeltisch' },
	{ key: 'toilette', label: 'Toiletten', kinds: ['toilette'] },
	{ key: 'drinnen', label: 'Drinnen spielen', kinds: ['indoorspielplatz'] },
	{ key: 'ausflug', label: 'Ausflüge & Bäder', kinds: ['ausflugsort', 'schwimmbad'] },
	{ key: 'cafe', label: 'Familiencafés', kinds: ['familiencafe', 'stillraum'] }
];

export type FeatureGroup = 'ausstattung' | 'spielgeraete' | 'zugang' | 'service';
export interface FeatureDef {
	label: string;
	group: FeatureGroup;
	kinds: Kind[] | 'alle';
	/** als Filter-Chip auf der Karte anbieten */
	filter?: boolean;
}

export const FEATURES: Record<string, FeatureDef> = {
	schatten: { label: 'Schatten', group: 'ausstattung', kinds: ['spielplatz'], filter: true },
	baenke: { label: 'Sitzbänke', group: 'ausstattung', kinds: ['spielplatz'] },
	eingezaeunt: { label: 'Eingezäunt', group: 'ausstattung', kinds: ['spielplatz'], filter: true },
	ueberdacht: { label: 'Überdacht', group: 'ausstattung', kinds: ['spielplatz'] },
	beleuchtet: { label: 'Beleuchtet', group: 'ausstattung', kinds: ['spielplatz'] },
	wasserspiel: { label: 'Wasserspiel', group: 'spielgeraete', kinds: ['spielplatz'], filter: true },
	sandkasten: { label: 'Sandkasten', group: 'spielgeraete', kinds: ['spielplatz'] },
	schaukel: { label: 'Schaukel', group: 'spielgeraete', kinds: ['spielplatz'] },
	rutsche: { label: 'Rutsche', group: 'spielgeraete', kinds: ['spielplatz'] },
	klettern: { label: 'Klettern', group: 'spielgeraete', kinds: ['spielplatz'] },
	wippe: { label: 'Wippe', group: 'spielgeraete', kinds: ['spielplatz'] },
	karussell: { label: 'Karussell', group: 'spielgeraete', kinds: ['spielplatz'] },
	kleinkind: { label: 'Geräte für Kleinkinder', group: 'spielgeraete', kinds: ['spielplatz'], filter: true },
	kinderwagen: { label: 'Kinderwagengerecht', group: 'zugang', kinds: 'alle', filter: true },
	rollstuhl: { label: 'Rollstuhlgerecht', group: 'zugang', kinds: 'alle' },
	inklusiv: { label: 'Inklusive Spielgeräte', group: 'zugang', kinds: ['spielplatz'] },
	wickeltisch: { label: 'Wickeltisch', group: 'service', kinds: ['toilette', 'wickelraum', 'familiencafe', 'indoorspielplatz', 'schwimmbad', 'ausflugsort'] },
	toilette: { label: 'Toilette vor Ort', group: 'service', kinds: ['spielplatz', 'ausflugsort', 'familiencafe'] },
	kostenlos: { label: 'Kostenlos', group: 'service', kinds: ['toilette', 'wickelraum', 'ausflugsort', 'schwimmbad'] }
};
export const FEATURE_GROUPS: Record<FeatureGroup, string> = {
	ausstattung: 'Ausstattung',
	spielgeraete: 'Spielgeräte',
	zugang: 'Zugang',
	service: 'Service'
};
export const FILTER_FEATURES = Object.entries(FEATURES)
	.filter(([, f]) => f.filter)
	.map(([key, f]) => ({ key, label: f.label }));

export const featuresFor = (kind: Kind) =>
	Object.entries(FEATURES).filter(([, f]) => f.kinds === 'alle' || (f.kinds as readonly string[]).includes(kind));

export type Features = Record<string, unknown> & {
	alter_min?: number;
	alter_max?: number;
	untergrund?: string;
	zugang?: 'oeffentlich' | 'kundschaft';
	wickeltisch_ort?: string;
	gebuehr?: string;
};

export const SURFACES: Record<string, string> = {
	sand: 'Sand',
	grass: 'Rasen',
	woodchips: 'Holzschnitzel',
	bark: 'Rindenmulch',
	tartan: 'Fallschutzbelag',
	rubber: 'Fallschutzbelag',
	rubber_mulch: 'Fallschutzbelag',
	pebblestone: 'Kies',
	gravel: 'Kies',
	fine_gravel: 'Feinkies',
	paving_stones: 'Pflaster',
	asphalt: 'Asphalt',
	compacted: 'fester Boden',
	dirt: 'Erde',
	ground: 'Erde'
};

export const CHANGING_LOCATIONS: Record<string, string> = {
	wheelchair_toilet: 'in der barrierefreien Toilette',
	female_toilet: 'in der Damentoilette',
	male_toilet: 'in der Herrentoilette',
	unisex_toilet: 'in der Unisex-Toilette',
	dedicated_room: 'in einem eigenen Raum',
	room: 'in einem eigenen Raum',
	sales_area: 'im Verkaufsraum'
};

export const CONFIRMATION: Record<string, { label: string; text: string }> = {
	importiert: { label: 'Importiert', text: 'Aus offener Quelle übernommen, nicht vor Ort geprüft.' },
	community: { label: 'Von Mitgliedern', text: 'Von Mitgliedern eingetragen, von der Redaktion freigegeben.' },
	redaktion: { label: 'Redaktion geprüft', text: 'Von der Redaktion geprüft.' },
	anbieter: { label: 'Vom Anbieter', text: 'Vom verifizierten Anbieter gepflegt.' }
};

export const REPORT_KINDS: Record<string, string> = {
	falsche_angabe: 'Angabe stimmt nicht',
	existiert_nicht: 'Gibt es nicht mehr',
	defekt: 'Etwas ist kaputt',
	gesperrt: 'Gesperrt',
	dublette: 'Doppelt eingetragen',
	sonstiges: 'Sonstiges'
};

export function ageText(f: Features): string | null {
	const a = typeof f.alter_min === 'number' ? f.alter_min : null;
	const b = typeof f.alter_max === 'number' ? f.alter_max : null;
	if (a !== null && b !== null) return `${a}–${b} Jahre`;
	if (a !== null) return `ab ${a} Jahren`;
	if (b !== null) return `bis ${b} Jahre`;
	return null;
}

/** Anzeigename: eigener Name oder „Spielplatz in Findorff“. */
export function displayName(kind: Kind, name: string | null | undefined, regionName?: string | null): string {
	if (name && name.trim()) return name.trim();
	const k = KINDS[kind]?.label ?? 'Ort';
	return regionName ? `${k} in ${regionName}` : k;
}

/** Entfernung in Metern (Haversine). */
export function distanceM(a: [number, number], b: [number, number]): number {
	const R = 6371008.8;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b[1] - a[1]);
	const dLon = toRad(b[0] - a[0]);
	const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(s));
}

export function distanceText(m: number): string {
	if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
	return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
}
