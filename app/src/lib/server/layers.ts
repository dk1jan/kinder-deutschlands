// Zusatzebenen der Familienkarte (M10): Termine, Kinderwagenrouten, Marktplatz, Hilfe.
// Termine und Routen erscheinen an ihrem (öffentlichen) Ort. Marktplatz und Hilfe nur für Mitglieder und nur
// zusammengefasst je Gegend („7 Anzeigen in Findorff“) – nie als einzelne Punkte, weil der Ort ohnehin nur der
// Mittelpunkt der Region ist und einzelne Punkte eine Genauigkeit vortäuschen würden.
import type { Sql } from './db';
import type { Bbox } from './places';
import { listOccurrences } from './angebote/events';
import { berlinDateKey } from './angebote/recurrence';
import { EVENT_KINDS, ORG_KINDS } from '$lib/angebote';
import { visibleShares } from './live';

export const LAYERS = {
	einrichtungen: { label: 'Einrichtungen', members: false },
	termine: { label: 'Termine', members: false },
	routen: { label: 'Kinderwagenrouten', members: false },
	marktplatz: { label: 'Marktplatz', members: true },
	hilfe: { label: 'Hilfe', members: true },
	live: { label: 'Live unterwegs', members: true }
} as const;
export type LayerKey = keyof typeof LAYERS;
export const isLayer = (k: string): k is LayerKey => k in LAYERS;

export interface LayerPoint {
	id: string;
	layer: LayerKey;
	title: string;
	sub: string;
	href: string;
	lon: number;
	lat: number;
	count?: number;
}
export interface LayerLine {
	id: string;
	title: string;
	sub: string;
	href: string;
	coords: [number, number][];
}

const env = (sql: Sql, b: Bbox) => sql`ST_MakeEnvelope(${b.w}, ${b.s}, ${b.e}, ${b.n}, 4326)`;
const LIMIT = 300;

function whenText(start: Date, allDay: boolean, now: Date): string {
	const day = berlinDateKey(start);
	const today = berlinDateKey(now);
	const tomorrow = berlinDateKey(new Date(now.getTime() + 86_400_000));
	const d = day === today ? 'heute' : day === tomorrow ? 'morgen' : start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Berlin' });
	return allDay ? d : `${d}, ${start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr`;
}

export async function layerData(sql: Sql, viewerId: string | null, b: Bbox, layers: LayerKey[], opts: { days?: number; now?: Date } = {}) {
	const now = opts.now ?? new Date();
	const points: LayerPoint[] = [];
	const lines: LayerLine[] = [];
	const want = layers.filter((l) => !LAYERS[l].members || viewerId);

	if (want.includes('termine')) {
		const days = Math.min(Math.max(opts.days ?? 7, 1), 31);
		const occ = await listOccurrences(sql, { id: viewerId }, { from: now, to: new Date(now.getTime() + days * 86_400_000), bbox: [b.w, b.s, b.e, b.n], limit: 2000 });
		// je Termin nur das nächste, nicht abgesagte Datum
		const seen = new Set<string>();
		for (const o of occ) {
			if (o.cancelled || o.lat === null || o.lon === null || seen.has(o.id)) continue;
			seen.add(o.id);
			points.push({
				id: `t:${o.id}`,
				layer: 'termine',
				title: o.title,
				sub: `${whenText(o.start, o.allDay, now)} · ${(EVENT_KINDS as Record<string, string>)[o.kind] ?? 'Termin'}${o.orgName ? ` · ${o.orgName}` : ''}`,
				href: `/veranstaltungen/${o.id}?am=${o.date}`,
				lon: o.lon,
				lat: o.lat
			});
			if (seen.size >= LIMIT) break;
		}
	}

	// F-034: geprüfte Einrichtungen mit Standort (Familienzentren, Vereine, Kitas …) – öffentlich wie ihre Seite
	if (want.includes('einrichtungen')) {
		const rows = await sql`select id, slug, name, kind, address, ST_X(location) as lon, ST_Y(location) as lat from organizations
			where status = 'verifiziert' and location is not null and location && ${env(sql, b)} order by name limit ${LIMIT}`;
		for (const r of rows)
			points.push({
				id: `e:${r.id}`,
				layer: 'einrichtungen',
				title: r.name,
				sub: [(ORG_KINDS as Record<string, string>)[r.kind] ?? 'Einrichtung', r.address].filter(Boolean).join(' · '),
				href: `/einrichtungen/${r.slug}`,
				lon: r.lon,
				lat: r.lat
			});
	}

	if (want.includes('routen')) {
		const rows = await sql`select id, title, distance_m, is_loop, ST_AsGeoJSON(geom)::json as g
			from stroller_routes where status = 'aktiv' and geom && ${env(sql, b)} order by created_at desc limit ${LIMIT}`;
		for (const r of rows)
			lines.push({
				id: r.id,
				title: r.title,
				sub: `${(r.distance_m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km${r.is_loop ? ' · Rundweg' : ''}`,
				href: `/routen/${r.id}`,
				coords: (r.g as { coordinates: [number, number][] }).coordinates
			});
	}

	if (want.includes('marktplatz') && viewerId) {
		const rows = await sql`select l.region_code, r.name, count(*)::int as n, ST_X(r.center) as lon, ST_Y(r.center) as lat
			from market_listings l join regions r on r.code = l.region_code join users u on u.id = l.user_id and u.status = 'active'
			where l.status in ('verfuegbar', 'reserviert') and l.expires_at > now() and r.center is not null and r.center && ${env(sql, b)}
				and not exists(select 1 from blocks x where (x.blocker = l.user_id and x.blocked = ${viewerId}) or (x.blocker = ${viewerId} and x.blocked = l.user_id))
			group by l.region_code, r.name, r.center limit ${LIMIT}`;
		for (const r of rows)
			points.push({ id: `m:${r.region_code}`, layer: 'marktplatz', title: `${r.n} ${r.n === 1 ? 'Anzeige' : 'Anzeigen'}`, sub: `Marktplatz · ${r.name}`, href: `/marktplatz?region=${encodeURIComponent(r.region_code)}`, lon: r.lon, lat: r.lat, count: r.n });
	}

	if (want.includes('hilfe') && viewerId) {
		const rows = await sql`select h.region_code, r.name, count(*)::int as n, ST_X(r.center) as lon, ST_Y(r.center) as lat
			from help_posts h join regions r on r.code = h.region_code join users u on u.id = h.user_id and u.status = 'active'
			where h.status = 'offen' and h.expires_at > now() and r.center is not null and r.center && ${env(sql, b)}
				and not exists(select 1 from blocks x where (x.blocker = h.user_id and x.blocked = ${viewerId}) or (x.blocker = ${viewerId} and x.blocked = h.user_id))
			group by h.region_code, r.name, r.center limit ${LIMIT}`;
		for (const r of rows)
			points.push({ id: `h:${r.region_code}`, layer: 'hilfe', title: `${r.n} ${r.n === 1 ? 'Eintrag' : 'Einträge'}`, sub: `Familien helfen Familien · ${r.name}`, href: `/hilfe?region=${encodeURIComponent(r.region_code)}`, lon: r.lon, lat: r.lat, count: r.n });
	}

	// F-037: Live unterwegs – nur Mitglieder, nur freigegebene, nicht abgelaufene, nicht blockierte (siehe live.ts)
	if (want.includes('live') && viewerId) {
		for (const x of await visibleShares(sql, viewerId, b))
			points.push({ id: `v:${x.id}`, layer: 'live', title: x.name, sub: `Live unterwegs · noch ca. ${x.minutesLeft} Min.`, href: `/live/${x.id}`, lon: x.lon, lat: x.lat });
	}

	return { points, lines, hidden: layers.filter((l) => !want.includes(l)) };
}
