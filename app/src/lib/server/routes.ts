// Kinderwagenfreundliche Routen (M14): von Mitgliedern oder der Redaktion selbst eingezeichnete Wege.
// Nur eigene Erfahrung bzw. Daten mit geklärter Lizenz. Start und Ziel sollen öffentliche Orte sein – Mitglieder-Routen
// prüft die Redaktion vor der Veröffentlichung. Keine Bewegungsprofile, keine GPS-Aufzeichnung: gezeichnet wird von Hand.
// Angaben zu Untergrund, Steigung und Treppen sind Erfahrungen, keine Garantie für Sicherheit oder Barrierefreiheit.
import type { Sql } from './db';
import { audit } from './audit';
import { userCan } from './roles';
import { PostError, notify } from './community/posts';
import { checkText } from './community/automod';
import { regionAt, subtree } from './angebote/common';

export const SURFACES = { asphalt: 'Asphalt', pflaster: 'Pflaster', wassergebunden: 'Wassergebunden (Kies/Splitt)', waldweg: 'Wald-/Feldweg', gemischt: 'Gemischt' } as const;
export const INCLINES = { eben: 'eben', leicht: 'leichte Steigungen', steil: 'steile Stellen' } as const;
export const REPORT_KINDS = { passt: 'Gut mit Kinderwagen gegangen', hindernis: 'Hindernis (z. B. Baustelle, Stufe)', gesperrt: 'Weg gesperrt' } as const;

export interface RouteInput {
	title: string;
	description: string;
	coords: [number, number][];
	surface: string | null;
	incline: string | null;
	stairs: boolean | null;
	narrow: boolean | null;
	shade: boolean | null;
	restSpots: string | null;
	durationMin: number | null;
	publicEnds: boolean;
}

/** Länge in Metern (Haversine) – gleiche Rechnung im Browser für die Anzeige beim Zeichnen. */
export function lengthM(c: [number, number][]): number {
	let m = 0;
	for (let i = 1; i < c.length; i++) {
		const [lo1, la1] = c[i - 1], [lo2, la2] = c[i];
		const r = Math.PI / 180;
		const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
		m += 2 * 6371000 * Math.asin(Math.sqrt(a));
	}
	return Math.round(m);
}

export function parseCoords(raw: string): [number, number][] {
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		throw new PostError('Weg konnte nicht gelesen werden – bitte neu einzeichnen.');
	}
	if (!Array.isArray(v)) throw new PostError('Weg fehlt.');
	const out: [number, number][] = [];
	for (const p of v) {
		if (!Array.isArray(p) || p.length !== 2) throw new PostError('Weg ungültig.');
		const lon = Number(p[0]), lat = Number(p[1]);
		if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < 47 || lat > 55.2 || lon < 5.5 || lon > 15.5) throw new PostError('Der Weg liegt nicht (ganz) in Deutschland.');
		out.push([Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6]);
	}
	return out;
}

function validate(i: RouteInput) {
	if (i.title.trim().length < 3 || i.title.length > 120) throw new PostError('Titel: 3 bis 120 Zeichen.');
	if (i.description.length > 3000) throw new PostError('Beschreibung zu lang.');
	if (i.coords.length < 2) throw new PostError('Bitte den Weg mit mindestens zwei Punkten einzeichnen.');
	if (i.coords.length > 500) throw new PostError('Zu viele Punkte (höchstens 500).');
	const m = lengthM(i.coords);
	if (m < 100) throw new PostError('Der Weg ist kürzer als 100 m.');
	if (m > 50000) throw new PostError('Der Weg ist länger als 50 km – bitte in Etappen aufteilen.');
	for (let k = 1; k < i.coords.length; k++) if (lengthM([i.coords[k - 1], i.coords[k]]) > 3000) throw new PostError('Zwischen zwei Punkten liegen mehr als 3 km – bitte genauer einzeichnen.');
	if (i.surface && !(i.surface in SURFACES)) throw new PostError('Ungültiger Untergrund.');
	if (i.incline && !(i.incline in INCLINES)) throw new PostError('Ungültige Steigung.');
	if (i.durationMin !== null && (i.durationMin < 5 || i.durationMin > 600)) throw new PostError('Dauer zwischen 5 und 600 Minuten.');
	if (!i.publicEnds) throw new PostError('Bitte bestätigen, dass Start und Ziel öffentliche Orte sind (keine Wohnadresse).');
}

const lineSql = (sql: Sql, c: [number, number][]) => sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify({ type: 'LineString', coordinates: c })}), 4326)`;

export async function createRoute(sql: Sql, userId: string, i: RouteInput, opts: { asRedaktion?: boolean } = {}) {
	validate(i);
	const redaktion = !!opts.asRedaktion && (await userCan(sql, userId, 'routes.edit'));
	if (opts.asRedaktion && !redaktion) throw new PostError('Keine Berechtigung für Redaktionsrouten.');
	const [{ n }] = await sql`select count(*)::int as n from stroller_routes where created_by = ${userId} and created_at > now() - interval '1 day'`;
	if (n >= 5) throw new PostError('Heute schon mehrere Routen eingetragen. Bitte morgen weitermachen.');
	const flags = checkText(`${i.title}\n${i.description}\n${i.restSpots ?? ''}`);
	if (flags.some((f) => f.hold)) throw new PostError('Bitte keine Telefonnummern, E-Mail-Adressen oder Hausnummern privater Wohnungen in die Beschreibung.');
	const [start, end] = [i.coords[0], i.coords[i.coords.length - 1]];
	const region = await regionAt(sql, start[0], start[1]);
	const loop = lengthM([start, end]) < 80;
	const [r] = await sql`insert into stroller_routes (title, description, geom, distance_m, is_loop, surface, incline, stairs, narrow, shade, rest_spots, duration_min, region_code, origin, status, created_by, checked_at)
		values (${i.title.trim()}, ${i.description.trim()}, ${lineSql(sql, i.coords)}, ${lengthM(i.coords)}, ${loop}, ${i.surface}, ${i.incline}, ${i.stairs}, ${i.narrow}, ${i.shade},
			${i.restSpots?.trim() || null}, ${i.durationMin}, ${region}, ${redaktion ? 'redaktion' : 'mitglied'}, ${redaktion ? 'aktiv' : 'pruefung'}, ${userId}, ${redaktion ? sql`now()` : null})
		returning id`;
	await audit(sql, { actorId: userId, action: 'route.created', targetType: 'route', targetId: r.id, meta: { origin: redaktion ? 'redaktion' : 'mitglied' } });
	return { id: r.id as string, held: !redaktion };
}

export async function updateRoute(sql: Sql, userId: string, id: string, i: RouteInput) {
	const [cur] = await sql`select created_by, origin, status from stroller_routes where id = ${id}`;
	const editor = await userCan(sql, userId, 'routes.edit');
	if (!cur || cur.status === 'entfernt' || (cur.created_by !== userId && !editor)) throw new PostError('Route nicht gefunden.');
	validate(i);
	const start = i.coords[0];
	const region = await regionAt(sql, start[0], start[1]);
	// Änderungen von Mitgliedern an veröffentlichten Routen werden erneut geprüft
	const status = cur.status === 'aktiv' && !editor ? 'pruefung' : cur.status;
	await sql`update stroller_routes set title = ${i.title.trim()}, description = ${i.description.trim()}, geom = ${lineSql(sql, i.coords)}, distance_m = ${lengthM(i.coords)},
		is_loop = ${lengthM([start, i.coords[i.coords.length - 1]]) < 80}, surface = ${i.surface}, incline = ${i.incline}, stairs = ${i.stairs}, narrow = ${i.narrow}, shade = ${i.shade},
		rest_spots = ${i.restSpots?.trim() || null}, duration_min = ${i.durationMin}, region_code = ${region}, status = ${status}, updated_at = now() where id = ${id}`;
	return status;
}

export async function reviewRoute(sql: Sql, userId: string, id: string, approve: boolean, note: string) {
	if (!(await userCan(sql, userId, 'routes.edit'))) throw new PostError('Keine Berechtigung.');
	if (!approve && note.trim().length < 3) throw new PostError('Bitte kurz begründen.');
	const [r] = await sql`update stroller_routes set status = ${approve ? 'aktiv' : 'abgelehnt'}, review_note = ${note.trim().slice(0, 500) || null}, checked_at = now(), updated_at = now()
		where id = ${id} and status = 'pruefung' returning created_by, title`;
	if (!r) throw new PostError('Route wartet nicht auf Prüfung.');
	await audit(sql, { actorId: userId, action: approve ? 'route.approved' : 'route.rejected', targetType: 'route', targetId: id, reason: note.trim() || undefined });
	if (r.created_by) await notify(sql, r.created_by, 'route', approve ? `Deine Route „${r.title}“ ist jetzt für alle sichtbar. Danke!` : `Deine Route „${r.title}“ wurde nicht veröffentlicht: ${note.trim()}`, `/routen/${id}`);
}

export async function removeRoute(sql: Sql, userId: string, id: string) {
	const [cur] = await sql`select created_by from stroller_routes where id = ${id}`;
	if (!cur || (cur.created_by !== userId && !(await userCan(sql, userId, 'routes.edit')))) throw new PostError('Route nicht gefunden.');
	await sql`update stroller_routes set status = 'entfernt', updated_at = now() where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'route.removed', targetType: 'route', targetId: id });
}

export interface RouteFilter {
	region?: string | null;
	near?: { lat: number; lon: number; km: number } | null;
	maxKm?: number | null;
	surface?: string | null;
	noStairs?: boolean;
	flat?: boolean;
	loop?: boolean;
	status?: 'aktiv' | 'pruefung';
	mine?: string | null;
}

export async function listRoutes(sql: Sql, f: RouteFilter) {
	const near = f.near ? sql`ST_SetSRID(ST_MakePoint(${f.near.lon}, ${f.near.lat}), 4326)::geography` : null;
	const rows = await sql`select r.id, r.title, r.distance_m, r.is_loop, r.surface, r.incline, r.stairs, r.narrow, r.duration_min, r.origin, r.status, r.created_at,
			g.name as region_name, ST_AsGeoJSON(ST_Simplify(r.geom, 0.00005), 6) as geo,
			${near ? sql`ST_Distance(r.geom::geography, ${near}) / 1000` : sql`null::float`} as km,
			(select count(*)::int from route_reports x where x.route_id = r.id and x.kind = 'passt') as ok_count,
			exists(select 1 from route_reports x where x.route_id = r.id and x.kind in ('hindernis', 'gesperrt') and x.ended_at is null and x.created_at > now() - interval '60 days') as warning
		from stroller_routes r left join regions g on g.code = r.region_code
		where ${f.mine ? sql`r.created_by = ${f.mine} and r.status <> 'entfernt'` : sql`r.status = ${f.status ?? 'aktiv'}`}
			${f.region ? sql`and r.region_code in ${subtree(sql, f.region)}` : sql``}
			${near ? sql`and ST_DWithin(r.geom::geography, ${near}, ${f.near!.km * 1000})` : sql``}
			${f.maxKm ? sql`and r.distance_m <= ${f.maxKm * 1000}` : sql``}
			${f.surface ? sql`and r.surface = ${f.surface}` : sql``}
			${f.noStairs ? sql`and r.stairs = false` : sql``}
			${f.flat ? sql`and r.incline = 'eben'` : sql``}
			${f.loop ? sql`and r.is_loop` : sql``}
		order by ${near ? sql`km` : sql`r.created_at desc`} limit 200`;
	return rows.map((r) => ({
		id: r.id as string,
		title: r.title as string,
		distanceM: r.distance_m as number,
		loop: r.is_loop as boolean,
		surface: r.surface as string | null,
		incline: r.incline as string | null,
		stairs: r.stairs as boolean | null,
		narrow: r.narrow as boolean | null,
		durationMin: r.duration_min as number | null,
		origin: r.origin as string,
		status: r.status as string,
		regionName: r.region_name as string | null,
		coords: (JSON.parse(r.geo).coordinates as [number, number][]),
		km: r.km !== null ? Math.round(Number(r.km) * 10) / 10 : null,
		okCount: r.ok_count as number,
		warning: r.warning as boolean
	}));
}

export async function getRoute(sql: Sql, viewerId: string | null, id: string) {
	const [r] = await sql`select r.*, ST_AsGeoJSON(r.geom, 6) as geo, g.name as region_name from stroller_routes r left join regions g on g.code = r.region_code where r.id = ${id}`;
	if (!r || r.status === 'entfernt') return null;
	const editor = viewerId ? await userCan(sql, viewerId, 'routes.edit') : false;
	const mine = !!viewerId && r.created_by === viewerId;
	if (r.status !== 'aktiv' && !mine && !editor) return null;
	const places = await sql`select p.id, p.kind, p.name, round(ST_Distance(p.location::geography, ${sql`(select geom from stroller_routes where id = ${id})`}::geography))::int as m
		from places p where p.status = 'aktiv' and p.kind in ('spielplatz', 'toilette', 'wickelraum', 'stillraum', 'familiencafe')
			and ST_DWithin(p.location::geography, (select geom from stroller_routes where id = ${id})::geography, 150)
		order by p.kind, m limit 40`;
	const reports = await sql`select kind, text, created_at from route_reports where route_id = ${id} and ended_at is null and created_at > now() - interval '180 days' order by created_at desc limit 20`;
	return {
		id: r.id as string,
		title: r.title as string,
		description: r.description as string,
		coords: JSON.parse(r.geo).coordinates as [number, number][],
		distanceM: r.distance_m as number,
		loop: r.is_loop as boolean,
		surface: r.surface as string | null,
		incline: r.incline as string | null,
		stairs: r.stairs as boolean | null,
		narrow: r.narrow as boolean | null,
		shade: r.shade as boolean | null,
		restSpots: r.rest_spots as string | null,
		durationMin: r.duration_min as number | null,
		regionName: r.region_name as string | null,
		origin: r.origin as string,
		status: r.status as string,
		reviewNote: mine || editor ? (r.review_note as string | null) : null,
		checkedAt: r.checked_at as Date | null,
		updatedAt: r.updated_at as Date,
		mine,
		editor,
		places: places.map((p) => ({ id: p.id as string, kind: p.kind as string, name: p.name as string | null, m: p.m as number })),
		reports: reports.map((x) => ({ kind: x.kind as string, text: x.kind === 'passt' ? null : (x.text as string | null), at: x.created_at as Date }))
	};
}

/** Erfahrung melden: „passt“ zählt mit; Hindernis/Sperrung erscheint sofort als ungeprüfter Hinweis (ohne Namen). */
export async function reportRoute(sql: Sql, userId: string, id: string, kind: string, text: string | null) {
	if (!(kind in REPORT_KINDS)) throw new PostError('Bitte auswählen.');
	const [r] = await sql`select status, title, created_by from stroller_routes where id = ${id}`;
	if (!r || r.status !== 'aktiv') throw new PostError('Route nicht gefunden.');
	const t = text?.trim().slice(0, 300) || null;
	if (t && checkText(t).some((f) => f.hold)) throw new PostError('Bitte keine Telefonnummern oder E-Mail-Adressen.');
	const [{ n }] = await sql`select count(*)::int as n from route_reports where route_id = ${id} and user_id = ${userId} and created_at > now() - interval '1 day'`;
	if (n >= 3) throw new PostError('Danke! Für heute reicht das.');
	await sql`insert into route_reports (route_id, user_id, kind, text) values (${id}, ${userId}, ${kind}, ${t})`;
	if (kind !== 'passt') {
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, reporter_id, priority, region_code)
			select 'route', ${id}, 'meldung', 'falsch', ${`${REPORT_KINDS[kind as keyof typeof REPORT_KINDS]}${t ? `: ${t}` : ''}`.slice(0, 500)}, ${userId}, 2, region_code from stroller_routes where id = ${id}`;
	}
}

export async function endReports(sql: Sql, userId: string, id: string) {
	if (!(await userCan(sql, userId, 'routes.edit'))) throw new PostError('Keine Berechtigung.');
	await sql`update route_reports set ended_at = now() where route_id = ${id} and ended_at is null and kind <> 'passt'`;
	await sql`update stroller_routes set checked_at = now() where id = ${id}`;
}

/** GPX-Datei zum Übernehmen in eine Navigations-App. */
export function toGpx(title: string, coords: [number, number][], url: string): string {
	const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kinder Deutschlands" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(title)}</name><link href="${esc(url)}"><text>Kinder Deutschlands</text></link></metadata>
  <trk><name>${esc(title)}</name><trkseg>
${coords.map(([lon, lat]) => `    <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('\n')}
  </trkseg></trk>
</gpx>
`;
}

const tri = (v: FormDataEntryValue | null) => (v === 'ja' ? true : v === 'nein' ? false : null);

/** Formular → Eingabe (Neu und Bearbeiten). */
export function routeFromForm(f: FormData): RouteInput {
	const d = String(f.get('duration') ?? '').trim();
	return {
		title: String(f.get('title') ?? '').trim().slice(0, 140),
		description: String(f.get('description') ?? '').trim().slice(0, 3000),
		coords: parseCoords(String(f.get('coords') ?? '[]')),
		surface: String(f.get('surface') ?? '') || null,
		incline: String(f.get('incline') ?? '') || null,
		stairs: tri(f.get('stairs')),
		narrow: tri(f.get('narrow')),
		shade: tri(f.get('shade')),
		restSpots: String(f.get('rest') ?? '').trim().slice(0, 300) || null,
		durationMin: d ? Number(d) : null,
		publicEnds: f.get('public_ends') === 'on'
	};
}
