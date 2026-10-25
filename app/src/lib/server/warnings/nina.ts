// Warnungen des Bevölkerungsschutzes über die NINA-Schnittstelle des BBK (warnung.bund.de/api31, ohne Schlüssel,
// dokumentiert auf nina.api.bund.dev – inoffiziell, keine Zusage zur Weiterverbreitung; Entscheidung Jan D-092).
// Ablauf je Quelle: Übersicht /{quelle}/mapData.json → für neue Kennungen oder neue Fassungen die Meldung
// /warnings/{id}.json (CAP als JSON) und das Gebiet /warnings/{id}.geojson laden.
import { fetchRetry } from '../import/net';
import type { CapAlert, CapArea } from './cap';

export const NINA_BASE = 'https://warnung.bund.de/api31';
const base = () => (process.env.NINA_URL || NINA_BASE).replace(/\/$/, '');

/** DWD fehlt bewusst – die Wetterwarnungen holen wir direkt beim DWD. */
export const NINA_SOURCES = {
	mowas: 'Bevölkerungsschutz (MoWaS)',
	katwarn: 'KATWARN',
	biwapp: 'BIWAPP',
	lhp: 'Hochwasser (Länderübergreifendes Hochwasserportal)',
	police: 'Polizei'
} as const;
export type NinaSource = keyof typeof NINA_SOURCES;

export const NINA_ATTRIBUTION =
	'Quelle: Bundesamt für Bevölkerungsschutz und Katastrophenhilfe (BBK), NINA/warnung.bund.de – Meldungen der warnenden Behörden, unverändert übernommen, ohne Gewähr';

export interface NinaListItem {
	id: string;
	version: number;
	severity: string;
	type: string;
	startDate: string | null;
	title: string;
}

const UA = () => `KinderDeutschlands/1.0 (+${(process.env.APP_URL || 'https://kinder-deutschlands.de').replace(/\/$/, '')})`;
const get = (path: string, fetchImpl: typeof fetch) =>
	fetchRetry(base() + path, { headers: { 'user-agent': UA(), accept: 'application/json' }, timeoutMs: 60_000 }, 2, Number(process.env.NINA_WAIT_MS ?? 5_000), fetchImpl);

/** Kennungen kommen in Pfade – nur harmlose Zeichen zulassen. */
export const safeId = (id: string) => /^[A-Za-z0-9._:-]{3,200}$/.test(id);

export async function fetchList(source: NinaSource, fetchImpl: typeof fetch = fetch): Promise<NinaListItem[]> {
	const data = (await (await get(`/${source}/mapData.json`, fetchImpl)).json()) as unknown;
	if (!Array.isArray(data)) throw new Error(`NINA ${source}: unerwartete Antwort`);
	return data
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string' && safeId((x as { id: string }).id))
		.map((x) => ({
			id: x.id as string,
			version: Number(x.version) || 0,
			severity: String(x.severity ?? 'Unknown'),
			type: String(x.type ?? 'Alert'),
			startDate: typeof x.startDate === 'string' ? x.startDate : null,
			title: String((x.i18nTitle as Record<string, string> | undefined)?.de ?? '')
		}));
}

/** HTML-Reste der Meldungen (<br/>, &quot; …) in schlichten Text. */
export function plain(s: unknown): string | null {
	if (typeof s !== 'string') return null;
	const t = s
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>\s*/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (m, e: string) => {
			const k = e.toLowerCase();
			if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
			return ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[k] ?? m;
		})
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return t || null;
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Ringe aus GeoJSON (Polygon/MultiPolygon, auch FeatureCollection) – nur Außenringe, für die Kreiszuordnung. */
export function ringsOf(geo: unknown): [number, number][][] {
	const out: [number, number][][] = [];
	const walk = (g: unknown) => {
		if (!g || typeof g !== 'object') return;
		const o = g as Json;
		if (o.type === 'FeatureCollection') return arr(o.features).forEach(walk);
		if (o.type === 'Feature') return walk(o.geometry);
		if (o.type === 'GeometryCollection') return arr(o.geometries).forEach(walk);
		const c = o.coordinates as unknown;
		if (o.type === 'Polygon' && Array.isArray(c) && Array.isArray(c[0])) out.push(c[0] as [number, number][]);
		if (o.type === 'MultiPolygon' && Array.isArray(c)) for (const p of c) if (Array.isArray(p) && Array.isArray(p[0])) out.push(p[0] as [number, number][]);
	};
	walk(geo);
	return out.filter((r) => r.length >= 4 && r.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])));
}

export interface NinaAlert extends CapAlert {
	source: NinaSource;
	version: number;
	contact: string | null;
	/** Gebiet als GeoJSON-Geometrien (für die Karte) */
	geometries: unknown[];
}

/** CAP als JSON (deutscher Block) + Gebiet → gemeinsame Form wie beim DWD. */
export function toAlert(source: NinaSource, item: NinaListItem, cap: Json, geo: unknown): NinaAlert | null {
	const infos = arr(cap.info);
	const info = infos.find((i) => i.language === 'de' || i.language === 'de-DE') ?? infos.find((i) => typeof i.language === 'string' && /^de/i.test(i.language as string) && i.language !== 'de-LS') ?? infos[0];
	if (!info) return null;
	const params: Record<string, string[]> = {};
	for (const p of arr(info.parameter)) {
		const k = str(p.valueName), v = str(p.value);
		if (k && v) (params[k] ??= []).push(v);
	}
	// Amtliche Regionalschlüssel der betroffenen Gemeinden/Kreise (12 Stellen, ggf. mehrere durch Leerzeichen getrennt)
	const ars = (params.warnVerwaltungsbereiche ?? []).flatMap((v) => v.split(/[\s,;]+/)).filter((v) => /^\d{5,12}$/.test(v));
	const rings = ringsOf(geo);
	const areas: CapArea[] = arr(info.area).map((a, i) => {
		const geocodes: Record<string, string[]> = {};
		for (const g of arr(a.geocode)) {
			const k = str(g.valueName), v = str(g.value);
			if (k && v) (geocodes[k] ??= []).push(v);
		}
		if (i === 0 && ars.length) geocodes.ARS = [...(geocodes.ARS ?? []), ...ars];
		return { desc: plain(a.areaDesc) ?? '', polygons: i === 0 ? rings : [], geocodes };
	});
	if (!areas.length) areas.push({ desc: '', polygons: rings, geocodes: ars.length ? { ARS: ars } : {} });
	const refs = (str(cap.references) ?? '')
		.split(/\s+/)
		.map((r) => r.split(',')[1])
		.filter((x): x is string => !!x);
	const geometries: unknown[] = [];
	const collect = (g: unknown) => {
		if (!g || typeof g !== 'object') return;
		const o = g as Json;
		if (o.type === 'FeatureCollection') arr(o.features).forEach(collect);
		else if (o.type === 'Feature') collect(o.geometry);
		else if (o.type === 'Polygon' || o.type === 'MultiPolygon') geometries.push(o);
	};
	collect(geo);
	return {
		identifier: item.id,
		sender: str(cap.sender),
		sent: str(cap.sent) ?? item.startDate ?? new Date().toISOString(),
		status: str(cap.status) ?? 'Actual',
		msgType: str(cap.msgType) ?? item.type,
		references: refs,
		event: str(info.event),
		eventGroup: null,
		urgency: str(info.urgency),
		severity: str(info.severity) ?? item.severity,
		headline: plain(info.headline) ?? item.title ?? 'Warnung',
		description: plain(info.description),
		instruction: plain(info.instruction),
		senderName: params.sender_langname?.[0] ?? str(info.senderName),
		web: str(info.web),
		effective: str(info.effective),
		onset: str(info.onset),
		expires: str(info.expires),
		areas,
		source,
		version: item.version,
		contact: plain(info.contact),
		geometries
	};
}

export async function fetchAlert(source: NinaSource, item: NinaListItem, fetchImpl: typeof fetch = fetch): Promise<NinaAlert | null> {
	const id = encodeURIComponent(item.id);
	const cap = (await (await get(`/warnings/${id}.json`, fetchImpl)).json()) as Json;
	// Gebiet ist nicht immer vorhanden – dann nur über die Regionalschlüssel zuordnen
	const geo = await get(`/warnings/${id}.geojson`, fetchImpl)
		.then((r) => r.json())
		.catch(() => null);
	return toAlert(source, item, cap, geo);
}

/** Webadresse der Meldung säubern (oft ohne https://). */
export function webUrl(w: string | null): string | null {
	if (!w) return null;
	try {
		const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
	} catch {
		return null;
	}
}
