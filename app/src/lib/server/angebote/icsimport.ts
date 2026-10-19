// Termine aus einem Kalender-Feed (ICS) übernehmen. Nur Quellen mit geklärtem Nutzungsrecht:
// typischerweise der eigene Kalender einer verifizierten Einrichtung. Abruf über die gegen interne Adressen
// geschützte Abfrage (wie Linkkarten). Redaktionell geänderte Felder bleiben gesperrt.
import { createHash } from 'node:crypto';
import type { Sql } from '../db';
import { safeGet } from '../community/linkcard';
import { parseIcs, type ParsedEvent } from './ics';
import { regionAt } from './common';
import { berlinDateKey, seriesUntil } from './recurrence';

const MAX_BYTES = 3_000_000;

async function fetchIcs(url: string): Promise<string> {
	// Nur für automatische Tests: lokaler Nachbau ohne Netz (niemals im Betrieb gesetzt)
	if (process.env.IMPORT_ALLOW_LOCAL === '1' && /^http:\/\/127\.0\.0\.1:\d+\//.test(url)) {
		const r = await fetch(url);
		if (!r.ok) throw new Error(`Kalender antwortet mit ${r.status}.`);
		return r.text();
	}
	const r = await safeGet(url, { maxBytes: MAX_BYTES, accept: 'text/calendar, text/plain;q=0.5', timeoutMs: 20_000 });
	if (r.body.length >= MAX_BYTES) throw new Error('Kalenderdatei ist zu groß (über 3 MB).');
	const text = r.body.toString('utf8');
	if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Unter dieser Adresse liegt keine Kalenderdatei (ICS).');
	return text;
}

const hash = (e: ParsedEvent) =>
	createHash('sha256')
		.update(JSON.stringify([e.title, e.description, e.location, e.url, e.start.toISOString(), e.end?.toISOString() ?? '', e.allDay, e.rrule, e.exdates, e.cancelled, e.lat, e.lon]))
		.digest('hex')
		.slice(0, 32);

export interface IcsSourceConfig {
	type: 'ics';
	url: string;
	org_id?: string | null;
	topics?: string[];
	kind?: string;
	visibility?: 'oeffentlich' | 'mitglieder';
}

/** Ein Abruf: neu/aktualisiert/unverändert/entfernt zählen. Vergangene Termine bleiben unangetastet. */
export async function importIcs(sql: Sql, key: string, cfg: IcsSourceConfig): Promise<{ counts: Record<string, number>; message: string }> {
	const text = await fetchIcs(cfg.url);
	const parsed = parseIcs(text);
	const counts = { neu: 0, aktualisiert: 0, unveraendert: 0, abgesagt: 0, entfernt: 0, ohne_wiederholung: 0 };
	let orgLoc: { lat: number | null; lon: number | null; address: string | null; region: string | null } | null = null;
	if (cfg.org_id) {
		const [o] = await sql`select ST_Y(location) as lat, ST_X(location) as lon, address, region_code, status from organizations where id = ${cfg.org_id}`;
		if (!o || o.status !== 'verifiziert') throw new Error('Einrichtung ist nicht (mehr) verifiziert – Abruf ausgesetzt.');
		orgLoc = { lat: o.lat ?? null, lon: o.lon ?? null, address: o.address, region: o.region_code };
	}
	const origin = cfg.org_id ? 'anbieter' : 'import';
	const now = new Date();
	const seen: string[] = [];
	for (const e of parsed) {
		if (e.rruleNote) counts.ohne_wiederholung++;
		const until = seriesUntil({ startsAt: e.start, endsAt: e.end, rrule: e.rrule, exdates: e.exdates });
		// Termine, die komplett vorbei sind, nicht neu anlegen
		if (until && until.getTime() < now.getTime() - 86_400_000) continue;
		seen.push(e.uid);
		const h = hash(e);
		const [cur] = await sql`select id, source_hash, locked_fields, status from events where source_key = ${key} and external_id = ${e.uid}`;
		if (cur && cur.source_hash === h && cur.status !== 'archiviert') {
			counts.unveraendert++;
			continue;
		}
		const lat = e.lat ?? orgLoc?.lat ?? null, lon = e.lon ?? orgLoc?.lon ?? null;
		const region = lat !== null ? ((await regionAt(sql, lon!, lat)) ?? orgLoc?.region ?? null) : (orgLoc?.region ?? null);
		const status = e.cancelled ? 'abgesagt' : 'aktiv';
		if (e.cancelled) counts.abgesagt++;
		const geo = lat !== null ? sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` : null;
		const desc = e.rruleNote ? `${e.description}\n\n(Hinweis: Die Wiederholung aus dem Kalender konnte nicht übernommen werden – angezeigt wird nur der erste Termin.)`.trim() : e.description;
		if (!cur) {
			await sql`insert into events (title, description, kind, topics, origin, org_id, source_key, external_id, source_hash, source_url, location, address, region_code,
					starts_at, ends_at, all_day, rrule, exdates, series_until, visibility, status)
				values (${e.title.length >= 3 ? e.title : e.title + ' …'}, ${desc.slice(0, 8000)}, ${cfg.kind ?? 'sonstiges'}, ${cfg.topics?.length ? cfg.topics : ['freizeit']}, ${origin}, ${cfg.org_id ?? null},
					${key}, ${e.uid}, ${h}, ${e.url}, ${geo}, ${e.location || orgLoc?.address || null}, ${region},
					${e.start}, ${e.end}, ${e.allDay}, ${e.rrule}, ${e.exdates}, ${until}, ${cfg.visibility ?? 'oeffentlich'}, ${status})`;
			counts.neu++;
		} else {
			const locked = new Set<string>(cur.locked_fields ?? []);
			await sql`update events set
					title = ${locked.has('title') ? sql`title` : e.title.length >= 3 ? e.title : e.title + ' …'},
					description = ${locked.has('description') ? sql`description` : desc.slice(0, 8000)},
					starts_at = ${locked.has('starts_at') ? sql`starts_at` : e.start},
					ends_at = ${locked.has('ends_at') ? sql`ends_at` : e.end},
					all_day = ${e.allDay}, rrule = ${e.rrule}, exdates = ${e.exdates}, series_until = ${until},
					location = ${locked.has('location') ? sql`location` : geo}, address = ${locked.has('location') ? sql`address` : e.location || orgLoc?.address || null},
					region_code = ${locked.has('location') ? sql`region_code` : region}, source_url = ${e.url}, source_hash = ${h},
					status = ${cur.status === 'entfernt' ? sql`status` : status}, checked_at = now(), updated_at = now()
				where id = ${cur.id}`;
			counts.aktualisiert++;
		}
	}
	// Nicht mehr im Kalender und noch nicht vorbei → archivieren (nicht löschen)
	const gone = await sql`update events set status = 'archiviert', updated_at = now()
		where source_key = ${key} and status in ('aktiv', 'abgesagt') and not (external_id = any(${seen}))
			and coalesce(series_until, ends_at, starts_at) > now() returning id`;
	counts.entfernt = gone.length;
	await sql`update events set checked_at = now() where source_key = ${key} and external_id = any(${seen})`;
	return {
		counts,
		message: `${parsed.length} Einträge gelesen: ${counts.neu} neu, ${counts.aktualisiert} aktualisiert, ${counts.unveraendert} unverändert, ${counts.entfernt} nicht mehr im Kalender${counts.ohne_wiederholung ? `, ${counts.ohne_wiederholung}× Wiederholung nicht lesbar` : ''}.`
	};
}

export { berlinDateKey };
