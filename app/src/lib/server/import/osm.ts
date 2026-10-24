// OpenStreetMap über die Overpass-API: Abfrage, Übersetzung der OSM-Merkmale in unser Ortsmodell.
// Daten © OpenStreetMap-Mitwirkende, Lizenz ODbL 1.0 – Namensnennung an Karte und Detailseite.
import { CHANGING_LOCATIONS, SURFACES, type Features, type Kind } from '$lib/places';
import type { ImportRecord } from './types';
import { fetchIpv4, netCode, netError } from './net';

export const OVERPASS_DEFAULT = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];

export type Selector = 'spielplatz' | 'toilette' | 'wickeln' | 'indoor' | 'ausflug' | 'familiencafe' | 'stillen' | 'bibliothek' | 'familienzentrum' | 'unterkunft';

const NOT_PRIVATE = '["access"!~"^(private|no)$"]';

/** Typische Namen von Indoorspielplätzen (F-021) – nur zusammen mit Freizeit-/Ausflugsmerkmal, nie bei Kitas/Schulen/Geschäften. */
export const INDOOR_NAMES = /indoor.?spiel|spielparadies|kinderland|tobeland|kinderwelt|spielscheune|kinderspielhalle|indoorpark|spielarena/i;
const INDOOR_SKIP_LEISURE = /^(playground|park|pitch|garden|indoor_play|nature_reserve|stadium|track)$/;

const notPrivate = (t: Record<string, string>) => !/^(private|no)$/.test(t.access ?? '');

/** Altes OSM-Merkmal „diaper“ (vor changing_table) – noch tausendfach in den Daten: yes, room, bench oder Anzahl. */
export const DIAPER_YES = /^(yes|room|bench|[1-9][0-9]?)$/;
const hasChanging = (t: Record<string, string>) => t.changing_table === 'yes' || DIAPER_YES.test(t.diaper ?? '');

/**
 * Elterncafés & Co. über den Namen (Jan 24.10.): „Elterncafé“, „Kindercafé“, „Familien-Café“, „Spielcafé“, „Krabbelcafé“,
 * „Eltern-Kind-Café“, „Kids Café“ … – nicht an Kitas/Schulen und keine Brettspiel-/Internetcafés.
 */
export const FAMILY_CAFE_NAMES = /(eltern|kind|kinder|familien|spiel|krabbel|kids?|baby|mama|mütter|muetter)[ -]*(und[ -]*kind[ -]*)?caf[eé]/i;
const CAFE_SKIP_NAMES = /brett|würfel|wuerfel|board|gaming|e-?sport|internet|lan-/i;
const CAFE_SKIP_AMENITY = /^(kindergarten|school|childcare|college|university|place_of_worship)$/;

/** Unterkünfte für Familien (Jan 24.10.): Jugendherbergen, Familien-/Kinderhotels, Ferienhöfe, Campingplätze. */
export const FAMILY_STAY_NAMES = /familien.?hotel|kinder.?hotel|familotel|baby.?(und.?)?kinder.?hotel|familien.?resort|familien.?ferien|ferienhof|urlaub auf dem (bauern)?hof|bauernhof.?urlaub|familienherberge/i;
const HOSTEL_DJH = /jugendherberge|jugendg(ä|ae)stehaus|familienherberge/i;
const STAY_TOURISM = /^(hotel|guest_house|apartment|chalet|hostel|motel)$/;
const CAMP_SKIP_NAMES = /dauercamp|fkk|naturist/i;

/**
 * Dieselbe Auswahl wie die Overpass-Abfragen, aber auf einzelne Objekte angewandt – für den Abruf aus der
 * Deutschland-Datei (F-022). Muss zu buildQuery passen (Tests prüfen beides).
 */
export function matches(selector: Selector, t: Record<string, string>, type: OsmElement['type']): boolean {
	switch (selector) {
		case 'spielplatz':
			return (t.leisure === 'playground' && t.indoor !== 'yes' && notPrivate(t)) || (type === 'node' && !!t.playground && t.leisure !== 'playground');
		case 'toilette':
			return t.amenity === 'toilets' && notPrivate(t);
		case 'wickeln':
			return hasChanging(t) && t.amenity !== 'toilets' && notPrivate(t);
		case 'indoor':
			if (!notPrivate(t)) return false;
			if (t.leisure === 'indoor_play' || t.leisure === 'trampoline_park' || (t.leisure === 'playground' && t.indoor === 'yes')) return true;
			if (!INDOOR_NAMES.test(t.name ?? '')) return false;
			return (!!t.leisure && !INDOOR_SKIP_LEISURE.test(t.leisure)) || t.tourism === 'attraction';
		case 'ausflug':
			return (
				t.tourism === 'zoo' ||
				t.tourism === 'theme_park' ||
				t.leisure === 'water_park' ||
				(t.leisure === 'sports_centre' && /swimming/.test(t.sport ?? '')) ||
				t.amenity === 'public_bath' ||
				(t.leisure === 'miniature_golf' && notPrivate(t)) ||
				(t.leisure === 'sports_centre' && /climbing/.test(t.sport ?? '') && notPrivate(t))
			);
		case 'familiencafe':
			if (!notPrivate(t)) return false;
			if (/^(cafe|restaurant|ice_cream)$/.test(t.amenity ?? '') && /^(yes|designated|limited)$/.test(t.kids_area ?? '')) return true;
			return FAMILY_CAFE_NAMES.test(t.name ?? '') && !CAFE_SKIP_NAMES.test(t.name ?? '') && !CAFE_SKIP_AMENITY.test(t.amenity ?? '') && !t.shop;
		case 'stillen':
			return /^(yes|room)$/.test(t.baby_feeding ?? '') && notPrivate(t);
		case 'bibliothek':
			return t.amenity === 'library' && notPrivate(t);
		case 'familienzentrum':
			return t.community_centre === 'family_centre' && notPrivate(t);
		case 'unterkunft':
			return stayType(t) !== null;
	}
}

/** Art der Familienunterkunft oder null (nicht übernehmen). */
export function stayType(t: Record<string, string>): string | null {
	if (!notPrivate(t)) return null;
	const name = t.name ?? '';
	if (t.tourism === 'camp_site') {
		if (t.group_only === 'yes' || t.backcountry === 'yes' || /^(yes|designated|obligatory|customary)$/.test(t.nudism ?? '') || CAMP_SKIP_NAMES.test(name)) return null;
		return 'Campingplatz';
	}
	if (!STAY_TOURISM.test(t.tourism ?? '')) return null;
	if (HOSTEL_DJH.test(name) || /jugendherberg|\bdjh\b|deutsches jugendherbergswerk/i.test(`${t.operator ?? ''} ${t.brand ?? ''}`.trim()))
		return /familienherberge/i.test(name) ? 'Familienherberge' : 'Jugendherberge';
	if (/ferienhof|urlaub auf dem (bauern)?hof|bauernhof.?urlaub/i.test(name)) return 'Ferienhof';
	if (FAMILY_STAY_NAMES.test(name)) return 'Familienhotel';
	if (/^(hotel|guest_house|chalet)$/.test(t.tourism ?? '') && /^(yes|designated)$/.test(t.kids_area ?? '')) return 'Familienfreundliches Hotel';
	return null;
}

/** Overpass-Abfragen je Auswahl. Spielplätze mit Umriss und Spielgeräten, alles andere als Punkt. */
export function buildQuery(selector: Selector, iso: string): string {
	if (!/^DE-[A-Z]{2}$/.test(iso)) throw new Error(`Ungültiges Gebiet: ${iso}`);
	const area = `area["ISO3166-2"="${iso}"]["admin_level"="4"]->.a;`;
	const head = '[out:json][timeout:600][maxsize:536870912];';
	switch (selector) {
		case 'spielplatz':
			return `${head}${area}nwr["leisure"="playground"]["indoor"!="yes"]${NOT_PRIVATE}(area.a);out geom qt;node["playground"](area.a);out qt;`;
		case 'toilette':
			return `${head}${area}nwr["amenity"="toilets"]${NOT_PRIVATE}(area.a);out center qt;`;
		case 'wickeln':
			return `${head}${area}(nwr["changing_table"="yes"]["amenity"!="toilets"]${NOT_PRIVATE}(area.a);nwr["diaper"~"${DIAPER_YES.source}"]["amenity"!="toilets"]${NOT_PRIVATE}(area.a););out center qt;`;
		case 'indoor':
			// F-021: auch Spielplätze „drinnen“, Trampolinhallen und typische Namen an Freizeit-/Ausflugsobjekten
			return `${head}${area}(nwr["leisure"="indoor_play"]${NOT_PRIVATE}(area.a);nwr["leisure"="playground"]["indoor"="yes"]${NOT_PRIVATE}(area.a);nwr["leisure"="trampoline_park"]${NOT_PRIVATE}(area.a);nwr["leisure"]["leisure"!~"^(playground|park|pitch|garden|indoor_play|nature_reserve|stadium|track)$"]["name"~"${INDOOR_NAMES.source}",i]${NOT_PRIVATE}(area.a);nwr["tourism"="attraction"]["name"~"${INDOOR_NAMES.source}",i]${NOT_PRIVATE}(area.a););out center qt;`;
		case 'ausflug':
			return `${head}${area}(nwr["tourism"="zoo"](area.a);nwr["tourism"="theme_park"](area.a);nwr["leisure"="water_park"](area.a);nwr["leisure"="sports_centre"]["sport"~"swimming"](area.a);nwr["amenity"="public_bath"](area.a);nwr["leisure"="miniature_golf"]${NOT_PRIVATE}(area.a);nwr["leisure"="sports_centre"]["sport"~"climbing"]${NOT_PRIVATE}(area.a););out center qt;`;
		// F-018: Merkmale laut OSM-Wiki (kids_area, baby_feeding, community_centre=family_centre)
		case 'familiencafe':
			return `${head}${area}(nwr["amenity"~"^(cafe|restaurant|ice_cream)$"]["kids_area"~"^(yes|designated|limited)$"]${NOT_PRIVATE}(area.a);nwr["name"~"${FAMILY_CAFE_NAMES.source}",i]["shop"!~"."]${NOT_PRIVATE}(area.a););out center qt;`;
		case 'stillen':
			return `${head}${area}nwr["baby_feeding"~"^(yes|room)$"]${NOT_PRIVATE}(area.a);out center qt;`;
		case 'bibliothek':
			return `${head}${area}nwr["amenity"="library"]${NOT_PRIVATE}(area.a);out center qt;`;
		case 'familienzentrum':
			return `${head}${area}nwr["community_centre"="family_centre"]${NOT_PRIVATE}(area.a);out center qt;`;
		case 'unterkunft':
			return `${head}${area}(nwr["tourism"="camp_site"]${NOT_PRIVATE}(area.a);nwr["tourism"~"^(hotel|guest_house|apartment|chalet|hostel|motel)$"]["name"~"jugendherberge|jugendg(ä|ae)stehaus|${FAMILY_STAY_NAMES.source}",i]${NOT_PRIVATE}(area.a);nwr["tourism"="hostel"]["operator"~"jugendherberg|DJH",i](area.a);nwr["tourism"~"^(hotel|guest_house|chalet)$"]["kids_area"~"^(yes|designated)$"](area.a););out center qt;`;
	}
}

export interface OsmElement {
	type: 'node' | 'way' | 'relation';
	id: number;
	lat?: number;
	lon?: number;
	center?: { lat: number; lon: number };
	bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
	geometry?: { lat: number; lon: number }[];
	tags?: Record<string, string>;
}

const yes = (v: string | undefined) => v === 'yes' || v === 'designated';
const yesNo = (v: string | undefined): boolean | undefined => (v === undefined ? undefined : yes(v) ? true : v === 'no' ? false : undefined);

function webUrl(t: Record<string, string>): string | null {
	const w = t.website || t['contact:website'] || t.url;
	if (!w) return null;
	const u = /^https?:\/\//i.test(w) ? w : `https://${w}`;
	try {
		const p = new URL(u);
		return p.protocol === 'http:' || p.protocol === 'https:' ? p.toString() : null;
	} catch {
		return null;
	}
}

function address(t: Record<string, string>) {
	const a: Record<string, string> = {};
	if (t['addr:street']) a.street = t['addr:street'];
	if (t['addr:housenumber']) a.housenumber = t['addr:housenumber'];
	if (t['addr:postcode']) a.postcode = t['addr:postcode'];
	if (t['addr:city']) a.city = t['addr:city'];
	return a;
}

function age(v: string | undefined): number | undefined {
	if (!v) return undefined;
	const n = Number(v.replace(',', '.'));
	return Number.isFinite(n) && n >= 0 && n <= 18 ? Math.round(n) : undefined;
}

function common(t: Record<string, string>): Features {
	const f: Features = {};
	const rs = yesNo(t.wheelchair);
	if (rs !== undefined) f.rollstuhl = rs;
	if (t.access === 'customers') f.zugang = 'kundschaft';
	const ct = yesNo(t.changing_table) ?? (DIAPER_YES.test(t.diaper ?? '') ? true : t.diaper === 'no' ? false : undefined);
	if (ct !== undefined) f.wickeltisch = ct;
	if (t['changing_table:location'] && CHANGING_LOCATIONS[t['changing_table:location']]) f.wickeltisch_ort = CHANGING_LOCATIONS[t['changing_table:location']];
	if (t.fee === 'no') f.kostenlos = true;
	if (t.fee === 'yes') f.kostenlos = false;
	if (t.charge && t.charge.length < 40) f.gebuehr = t.charge;
	return f;
}

/** Familien-Merkmale (F-018): Spielecke, Hochstuhl, Stillraum. Dreiwertig – fehlt = unbekannt. */
function familyExtras(t: Record<string, string>, f: Features): Features {
	if (t.kids_area) f.spielecke = t.kids_area !== 'no';
	const hs = yesNo(t.highchair);
	if (hs !== undefined) f.hochstuhl = hs;
	if (t.baby_feeding === 'room') f.stillraum = true;
	else if (t.baby_feeding === 'no') f.stillraum = false;
	return f;
}

/** Spielgeräte (OSM-Schlüssel playground=…) auf unsere Merkmale. */
export function equipmentFeature(v: string): string[] {
	const out: string[] = [];
	if (/swing/.test(v)) out.push('schaukel');
	if (v === 'baby_swing') out.push('kleinkind');
	if (/slide/.test(v)) out.push('rutsche');
	if (/sandpit|sand/.test(v)) out.push('sandkasten');
	if (/climb|structure|rope|net/.test(v)) out.push('klettern');
	if (/seesaw|springy/.test(v)) out.push('wippe');
	if (/roundabout|carousel|spinner|spinning/.test(v)) out.push('karussell');
	if (/water|splash|pump|archimedes/.test(v)) out.push('wasserspiel');
	return out;
}

function pointInRing(lon: number, lat: number, ring: { lat: number; lon: number }[]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const a = ring[i], b = ring[j];
		if (a.lat > lat !== b.lat > lat && lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
	}
	return inside;
}

const closed = (g?: { lat: number; lon: number }[]) =>
	!!g && g.length >= 4 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

function centerOf(e: OsmElement): [number, number] | null {
	if (typeof e.lon === 'number' && typeof e.lat === 'number') return [e.lon, e.lat];
	if (e.center) return [e.center.lon, e.center.lat];
	if (e.bounds) return [(e.bounds.minlon + e.bounds.maxlon) / 2, (e.bounds.minlat + e.bounds.maxlat) / 2];
	if (e.geometry?.length) {
		const n = e.geometry.length;
		return [e.geometry.reduce((s, p) => s + p.lon, 0) / n, e.geometry.reduce((s, p) => s + p.lat, 0) / n];
	}
	return null;
}

const round = (n: number) => Math.round(n * 1e7) / 1e7;
const keep = (t: Record<string, string>) => {
	// Rohdaten ohne Kontaktdaten Dritter (Telefon, E-Mail) speichern – brauchen wir nicht.
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(t)) if (!/^(phone|contact:phone|email|contact:email|fax|contact:fax)$/.test(k)) out[k] = v;
	return out;
};

function base(e: OsmElement, kind: Kind, f: Features, name: string | null): ImportRecord | null {
	const c = centerOf(e);
	const t = e.tags ?? {};
	if (!c) return null;
	return {
		externalId: `${e.type}/${e.id}`,
		kind,
		name: name && name.length <= 200 ? name : null,
		lon: round(c[0]),
		lat: round(c[1]),
		area: null,
		address: address(t),
		features: f,
		openingHours: t.opening_hours && t.opening_hours.length <= 255 ? t.opening_hours : null,
		website: webUrl(t),
		url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
		raw: keep(t)
	};
}

const EINRICHTUNG: Record<string, string> = {
	cafe: 'Café',
	restaurant: 'Restaurant',
	fast_food: 'Schnellrestaurant',
	pharmacy: 'Apotheke',
	chemist: 'Drogerie',
	department_store: 'Kaufhaus',
	mall: 'Einkaufszentrum',
	supermarket: 'Supermarkt',
	library: 'Bibliothek',
	townhall: 'Rathaus',
	baby_goods: 'Babyfachgeschäft',
	toys: 'Spielwarengeschäft',
	clothes: 'Bekleidungsgeschäft',
	fuel: 'Tankstelle',
	ice_cream: 'Eiscafé'
};

/** Übersetzt Overpass-Antwortelemente in Importdatensätze. */
export function toRecords(selector: Selector, elements: OsmElement[]): ImportRecord[] {
	const out: ImportRecord[] = [];
	if (selector === 'spielplatz') {
		const areas = elements.filter((e) => e.tags?.leisure === 'playground' && e.tags?.indoor !== 'yes');
		const equipment = elements.filter((e) => e.type === 'node' && e.tags?.playground && e.tags?.leisure !== 'playground');
		// Grobes Gitter, damit die Zuordnung der Spielgeräte auch bei vielen Spielplätzen schnell bleibt
		const grid = new Map<string, OsmElement[]>();
		const cell = (lon: number, lat: number) => `${Math.floor(lon * 100)}:${Math.floor(lat * 100)}`;
		for (const a of areas) {
			if (!a.bounds) continue;
			for (let x = Math.floor(a.bounds.minlon * 100); x <= Math.floor(a.bounds.maxlon * 100); x++)
				for (let y = Math.floor(a.bounds.minlat * 100); y <= Math.floor(a.bounds.maxlat * 100); y++) {
					const k = `${x}:${y}`;
					if (!grid.has(k)) grid.set(k, []);
					grid.get(k)!.push(a);
				}
		}
		const found = new Map<OsmElement, Set<string>>();
		const inclusive = new Set<OsmElement>();
		for (const n of equipment) {
			if (typeof n.lon !== 'number' || typeof n.lat !== 'number') continue;
			for (const a of grid.get(cell(n.lon, n.lat)) ?? []) {
				const b = a.bounds!;
				if (n.lon < b.minlon || n.lon > b.maxlon || n.lat < b.minlat || n.lat > b.maxlat) continue;
				if (a.type === 'way' && closed(a.geometry) && !pointInRing(n.lon, n.lat, a.geometry!)) continue;
				if (!found.has(a)) found.set(a, new Set());
				for (const f of equipmentFeature(n.tags!.playground)) found.get(a)!.add(f);
				if (yes(n.tags!.wheelchair)) inclusive.add(a);
				const ma = age(n.tags!.max_age);
				if (ma !== undefined && ma <= 3) found.get(a)!.add('kleinkind');
			}
		}
		for (const e of areas) {
			const t = e.tags!;
			const f: Features = common(t);
			delete f.wickeltisch;
			const fenced = t.barrier === 'fence' || yes(t.fenced) || !!t.fence_type ? true : t.fenced === 'no' ? false : undefined;
			if (fenced !== undefined) f.eingezaeunt = fenced;
			const cov = yesNo(t.covered);
			if (cov !== undefined) f.ueberdacht = cov;
			const lit = yesNo(t.lit);
			if (lit !== undefined) f.beleuchtet = lit;
			if (t.surface && SURFACES[t.surface]) f.untergrund = SURFACES[t.surface];
			const mi = age(t.min_age);
			const ma = age(t.max_age);
			if (mi !== undefined) f.alter_min = mi;
			if (ma !== undefined) f.alter_max = ma;
			if (ma !== undefined && ma <= 6) f.kleinkind = true;
			for (const [k, v] of Object.entries(t)) {
				const m = /^playground:([a-z_]+)$/.exec(k);
				if (m && (yes(v) || /^\d+$/.test(v))) for (const ft of equipmentFeature(m[1])) f[ft] = true;
			}
			for (const ft of found.get(e) ?? []) f[ft] = true;
			if (inclusive.has(e)) f.inklusiv = true;
			const r = base(e, 'spielplatz', f, t.name ?? null);
			if (!r) continue;
			if (e.type === 'way' && closed(e.geometry)) {
				r.area = { type: 'Polygon', coordinates: [e.geometry!.map((p) => [round(p.lon), round(p.lat)])] };
			}
			out.push(r);
		}
		return out;
	}
	for (const e of elements) {
		const t = e.tags ?? {};
		let r: ImportRecord | null = null;
		if (selector === 'toilette') {
			r = base(e, 'toilette', common(t), t.name ?? null);
		} else if (selector === 'wickeln') {
			const f = common(t);
			f.wickeltisch = true;
			const typ = EINRICHTUNG[t.amenity] ?? EINRICHTUNG[t.shop] ?? null;
			if (typ) f.einrichtung = typ;
			r = base(e, 'wickelraum', f, t.name ?? null);
		} else if (selector === 'indoor') {
			const f = familyExtras(t, common(t));
			if (t.leisure === 'trampoline_park') f.einrichtung = 'Trampolinhalle';
			r = base(e, 'indoorspielplatz', f, t.name ?? null);
		} else if (selector === 'ausflug') {
			const climbing = t.leisure === 'sports_centre' && /climbing/.test(t.sport ?? '') && !/swimming/.test(t.sport ?? '');
			const bath = t.leisure === 'water_park' || (t.leisure === 'sports_centre' && !climbing) || t.amenity === 'public_bath';
			r = base(e, bath ? 'schwimmbad' : 'ausflugsort', common(t), t.name ?? null);
			if (r && !bath)
				r.features.einrichtung = t.tourism === 'zoo' ? 'Zoo / Tierpark' : t.leisure === 'miniature_golf' ? 'Minigolf' : climbing ? 'Kletterhalle' : 'Freizeitpark';
		} else if (selector === 'familiencafe') {
			const f = familyExtras(t, common(t));
			// Spielecke nur, wenn OSM sie nennt (Treffer über den Namen „Elterncafé“ sagen darüber nichts)
			if (/^(yes|designated|limited)$/.test(t.kids_area ?? '')) f.spielecke = true;
			const typ = EINRICHTUNG[t.amenity];
			if (typ) f.einrichtung = typ;
			r = base(e, 'familiencafe', f, t.name ?? null);
		} else if (selector === 'stillen') {
			const f = familyExtras(t, common(t));
			const typ = EINRICHTUNG[t.amenity] ?? EINRICHTUNG[t.shop] ?? null;
			if (typ) f.einrichtung = typ;
			r = base(e, 'stillraum', f, t.name ?? null);
		} else if (selector === 'bibliothek') {
			// Hochschul-, Instituts- und Archivbibliotheken sind für Familien selten offen – über den Namen auslassen
			if (/universit|hochschul|institut|archiv|seminar|fakult|akademie/i.test(t.name ?? '')) continue;
			r = base(e, 'bibliothek', familyExtras(t, common(t)), t.name ?? null);
		} else if (selector === 'familienzentrum') {
			r = base(e, 'familienzentrum', familyExtras(t, common(t)), t.name ?? null);
		} else if (selector === 'unterkunft') {
			const typ = stayType(t);
			if (!typ) continue;
			const f = familyExtras(t, common(t));
			f.einrichtung = typ;
			if (t.playground === 'yes' || t['camp_site:playground'] === 'yes') f.spielplatz_vorort = true;
			r = base(e, 'unterkunft', f, t.name ?? null);
		}
		if (r) out.push(r);
	}
	return out;
}

export interface FetchOptions {
	endpoints?: string[];
	userAgent: string;
	fetchImpl?: typeof fetch;
	retries?: number;
	waitMs?: (attempt: number) => number;
	signal?: AbortSignal;
}

/** Overpass abfragen – mit Ausweich-Servern und wachsender Wartezeit bei Überlastung (429/502/504). */
export async function overpass(query: string, o: FetchOptions): Promise<OsmElement[]> {
	const eps = o.endpoints?.length ? o.endpoints : OVERPASS_DEFAULT;
	const v4 = new Set<string>();
	const f = (ep: string, init: RequestInit) => (v4.has(ep) ? fetchIpv4(ep, init) : (o.fetchImpl ?? fetch)(ep, init));
	const retries = o.retries ?? 4;
	const wait = o.waitMs ?? ((a: number) => 30000 * 2 ** a);
	let last = '';
	for (let attempt = 0; attempt < retries; attempt++) {
		for (const ep of eps) {
			try {
				const res = await f(ep, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': o.userAgent, accept: 'application/json' },
					body: new URLSearchParams({ data: query }).toString(),
					signal: o.signal ?? AbortSignal.timeout(660000)
				});
				if (!res.ok) {
					last = `${new URL(ep).host}: HTTP ${res.status}`;
					continue;
				}
				const data = (await res.json()) as { elements?: OsmElement[]; remark?: string };
				if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
					last = `${new URL(ep).host}: ${data.remark.slice(0, 200)}`;
					continue;
				}
				if (!Array.isArray(data.elements)) {
					last = `${new URL(ep).host}: unerwartete Antwort`;
					continue;
				}
				return data.elements;
			} catch (e) {
				last = netError(e, new URL(ep).host);
				// IPv6-Anfrage scheitert beim Namensserver (F-020): beim nächsten Versuch nur über IPv4
				if (!o.fetchImpl && netCode(e) === 'EAI_AGAIN') v4.add(ep);
			}
		}
		if (attempt < retries - 1) await new Promise((r) => setTimeout(r, wait(attempt)));
	}
	throw new Error(`Overpass nicht erreichbar (${last})`);
}
