// Import-Kern (M23): Abruf → Abgleich mit Bestand → Vorschau → Übernahme. Wiederholbar und nachvollziehbar.
// Manuelle Korrekturen (locked_fields) werden nie überschrieben. Verschwundene Einträge werden archiviert, nicht gelöscht.
import { createHash } from 'node:crypto';
import type { Sql } from '../db';
import type { ImportRecord, RunCounts } from './types';

export interface SourceRow {
	key: string;
	name: string;
	kind: 'orte' | 'regionen' | 'karte';
	config: Record<string, unknown>;
	interval_hours: number;
	auto_apply: boolean;
	max_removal_pct: number;
	paused: boolean;
	runs_failed: number;
}

export function recordHash(r: ImportRecord): string {
	const { raw, ...rest } = r;
	const stable = JSON.stringify(rest, Object.keys(rest).sort()) + JSON.stringify(Object.entries(raw).sort());
	return createHash('sha256').update(stable).digest('hex').slice(0, 32);
}

export interface Diff {
	items: { externalId: string; action: 'neu' | 'geaendert' | 'entfernt'; name: string | null; data: unknown }[];
	seen: string[];
	counts: RunCounts;
	removalPct: number;
}

/** Vergleicht einen Abruf mit dem Bestand dieser Quelle. Dubletten innerhalb der Lieferung werden zusammengefasst. */
export async function diffSource(sql: Sql, sourceKey: string, records: ImportRecord[]): Promise<Diff> {
	const byId = new Map<string, ImportRecord>();
	for (const r of records) byId.set(r.externalId, r);
	const existing = await sql`select external_id, hash, gone_at from place_sources where source_key = ${sourceKey}`;
	const known = new Map(existing.map((e) => [e.external_id as string, e]));
	const items: Diff['items'] = [];
	const seen: string[] = [];
	let unchanged = 0;
	for (const [id, r] of byId) {
		const h = recordHash(r);
		const k = known.get(id);
		if (!k) items.push({ externalId: id, action: 'neu', name: r.name, data: { ...r, hash: h } });
		else if (k.hash !== h || k.gone_at) items.push({ externalId: id, action: 'geaendert', name: r.name, data: { ...r, hash: h } });
		else {
			unchanged++;
			seen.push(id);
		}
	}
	let removed = 0;
	let active = 0;
	for (const [id, k] of known) {
		if (k.gone_at) continue;
		active++;
		if (!byId.has(id)) {
			removed++;
			items.push({ externalId: id, action: 'entfernt', name: null, data: {} });
		}
	}
	const counts: RunCounts = {
		gelesen: records.length,
		neu: items.filter((i) => i.action === 'neu').length,
		geaendert: items.filter((i) => i.action === 'geaendert').length,
		entfernt: removed,
		unveraendert: unchanged
	};
	return { items, seen, counts, removalPct: active ? Math.round((removed / active) * 100) : 0 };
}

const PLACE_FIELDS = ['name', 'location', 'area', 'address', 'features', 'opening_hours', 'website'] as const;

/** Übernimmt einen Lauf in den Bestand. Läuft in einer Transaktion. */
export async function applyRun(sql: Sql, runId: number, actorId: string | null): Promise<RunCounts> {
	return (await sql.begin(async (tx) => {
		const [run] = await tx`select r.id, r.source_key, r.status, r.counts from import_runs r where r.id = ${runId} for update`;
		if (!run) throw new Error('Lauf nicht gefunden.');
		if (run.status !== 'vorschau' && run.status !== 'laeuft') throw new Error('Dieser Lauf wurde bereits abgeschlossen.');
		const key = run.source_key as string;
		const items = await tx`select external_id, action, data from import_items where run_id = ${runId}`;
		const touched: string[] = [];
		for (const it of items) {
			const d = it.data as ImportRecord & { hash: string };
			if (it.action === 'entfernt') {
				const [ps] = await tx`update place_sources set gone_at = now() where source_key = ${key} and external_id = ${it.external_id}
					and gone_at is null returning place_id`;
				if (ps) {
					// Archivieren nur, wenn keine andere Quelle den Ort noch führt und niemand ihn bestätigt hat
					await tx`update places p set status = 'archiviert', updated_at = now()
						where p.id = ${ps.place_id} and p.status = 'aktiv' and p.confirmation = 'importiert'
						and not exists (select 1 from place_sources s where s.place_id = p.id and s.gone_at is null)`;
				}
				continue;
			}
			const area = d.area ? JSON.stringify(d.area) : null;
			if (it.action === 'neu') {
				const [p] = await tx`
					insert into places (kind, name, location, area, address, features, opening_hours, website, status, confirmation, checked_at)
					values (${d.kind}, ${d.name},
						${area ? tx`ST_PointOnSurface(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${area}), 4326)))` : tx`ST_SetSRID(ST_MakePoint(${d.lon}, ${d.lat}), 4326)`},
						${area ? tx`ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${area}), 4326))` : null},
						${tx.json(d.address as never)}, ${tx.json(d.features as never)}, ${d.openingHours}, ${d.website}, 'aktiv', 'importiert', now())
					returning id`;
				await tx`insert into place_sources (source_key, external_id, place_id, external_url, hash, raw)
					values (${key}, ${it.external_id}, ${p.id}, ${d.url}, ${d.hash}, ${tx.json(d.raw as never)})
					on conflict (source_key, external_id) do update set place_id = excluded.place_id, hash = excluded.hash, raw = excluded.raw,
						external_url = excluded.external_url, last_seen_at = now(), changed_at = now(), gone_at = null`;
				touched.push(p.id);
				continue;
			}
			// geändert (oder wieder aufgetaucht)
			const [ps] = await tx`update place_sources set hash = ${d.hash}, raw = ${tx.json(d.raw as never)}, external_url = ${d.url},
				last_seen_at = now(), changed_at = now(), gone_at = null
				where source_key = ${key} and external_id = ${it.external_id} returning place_id`;
			if (!ps) continue;
			// Zusammengeführte Orte: nur die älteste noch aktive Quelle pflegt die Angaben (kein Hin und Her)
			const [older] = await tx`select 1 from place_sources a, place_sources b
				where b.source_key = ${key} and b.external_id = ${it.external_id} and a.place_id = b.place_id
				and a.gone_at is null and (a.first_seen_at, a.source_key, a.external_id) < (b.first_seen_at, b.source_key, b.external_id)`;
			if (older) {
				touched.push(ps.place_id);
				continue;
			}
			const [cur] = await tx`select locked_fields, features from places where id = ${ps.place_id}`;
			const locked = new Set<string>(cur?.locked_fields ?? []);
			const has = (f: (typeof PLACE_FIELDS)[number]) => !locked.has(f);
			// Einzelne Merkmale können gesperrt sein ('features.wasserspiel') – die behalten ihren Wert
			const features: Record<string, unknown> = { ...(d.features as Record<string, unknown>) };
			const curF = (cur?.features ?? {}) as Record<string, unknown>;
			for (const l of locked) {
				if (!l.startsWith('features.')) continue;
				const k = l.slice(9);
				if (k in curF) features[k] = curF[k];
				else delete features[k];
			}
			await tx`update places set
				name = ${has('name') ? tx`${d.name}` : tx`name`},
				location = ${has('location') ? (area ? tx`ST_PointOnSurface(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${area}), 4326)))` : tx`ST_SetSRID(ST_MakePoint(${d.lon}, ${d.lat}), 4326)`) : tx`location`},
				area = ${has('area') ? (area ? tx`ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${area}), 4326))` : tx`null`) : tx`area`},
				address = ${has('address') ? tx`${tx.json(d.address as never)}` : tx`address`},
				features = ${tx.json(features as never)},
				opening_hours = ${has('opening_hours') ? tx`${d.openingHours}` : tx`opening_hours`},
				website = ${has('website') ? tx`${d.website}` : tx`website`},
				status = case when status = 'archiviert' and confirmation = 'importiert' then 'aktiv' else status end,
				updated_at = now(), checked_at = now()
				where id = ${ps.place_id}`;
			touched.push(ps.place_id);
		}
		// Unveränderte als gesehen markieren
		await tx`update place_sources set last_seen_at = now() where source_key = ${key} and gone_at is null
			and last_seen_at < (select started_at from import_runs where id = ${runId})
			and external_id not in (select external_id from import_items where run_id = ${runId})`;
		await tx`update places p set checked_at = now() from place_sources s
			where s.place_id = p.id and s.source_key = ${key} and s.gone_at is null`;
		let dubletten = 0;
		if (touched.length) {
			await assignRegions(tx as unknown as Sql, touched);
			dubletten = await detectDuplicates(tx as unknown as Sql, touched);
		}
		const counts = { ...(run.counts as RunCounts), dubletten };
		await tx`update import_runs set status = 'uebernommen', applied_at = now(), applied_by = ${actorId}, finished_at = coalesce(finished_at, now()),
			counts = ${tx.json(counts as never)} where id = ${runId}`;
		return counts;
	})) as RunCounts;
}

/** Feinste passende Region (Stadtteil vor Gemeinde vor Kreis vor Land) über die Geometrie. */
export async function assignRegions(sql: Sql, placeIds?: string[]) {
	await sql`update places p set region_code = (
			select r.code from regions r where r.geom is not null and ST_Covers(r.geom, p.location)
			order by case r.level when 'stadtteil' then 1 when 'gemeinde' then 2 when 'kreis' then 3 when 'land' then 4 else 5 end limit 1)
		where ${placeIds ? sql`p.id = any(${placeIds}::uuid[])` : sql`true`}`;
}

/** Gleiche Art, höchstens 30 m entfernt, beide sichtbar → Prüffall. Bereits entschiedene Paare bleiben entschieden. */
export async function detectDuplicates(sql: Sql, placeIds: string[]): Promise<number> {
	const r = await sql`
		insert into place_duplicates (place_a, place_b, distance_m)
		select least(a.id, b.id), greatest(a.id, b.id), ST_Distance(a.location::geography, b.location::geography)
		from places a join places b on b.kind = a.kind and b.id <> a.id
			and ST_DWithin(a.location::geography, b.location::geography, 30)
		where a.id = any(${placeIds}::uuid[]) and a.status in ('aktiv', 'pruefung') and b.status in ('aktiv', 'pruefung')
		on conflict do nothing`;
	return r.count;
}

export interface RunOptions {
	trigger: 'zeitplan' | 'manuell';
	actorId?: string | null;
	fetchRecords: (src: SourceRow, signal: AbortSignal) => Promise<ImportRecord[]>;
}

/** Ein kompletter Lauf für eine Orte-Quelle. Gibt die Lauf-ID zurück. */
export async function runPlaceSource(sql: Sql, src: SourceRow, o: RunOptions): Promise<number> {
	const [run] = await sql`insert into import_runs (source_key, trigger, triggered_by, status)
		values (${src.key}, ${o.trigger}, ${o.actorId ?? null}, 'laeuft') returning id`;
	const runId = Number(run.id);
	await sql`update data_sources set last_run_at = now() where key = ${src.key}`;
	try {
		const records = await o.fetchRecords(src, AbortSignal.timeout(45 * 60 * 1000));
		if (!records.length) throw new Error('Die Quelle hat keine Einträge geliefert – nichts übernommen.');
		const diff = await diffSource(sql, src.key, records);
		if (diff.items.length) {
			for (let i = 0; i < diff.items.length; i += 500) {
				const chunk = diff.items.slice(i, i + 500).map((it) => ({
					run_id: runId,
					external_id: it.externalId,
					action: it.action,
					name: it.name,
					data: it.data
				}));
				await sql`insert into import_items ${sql(chunk as never, 'run_id', 'external_id', 'action', 'name', 'data')}`;
			}
		}
		await sql`update import_runs set counts = ${sql.json(diff.counts as never)} where id = ${runId}`;
		const tooManyRemovals = diff.counts.entfernt > 5 && diff.removalPct > src.max_removal_pct;
		if (!src.auto_apply || tooManyRemovals) {
			const msg = tooManyRemovals
				? `${diff.counts.entfernt} Einträge (${diff.removalPct} %) wären entfernt worden – mehr als erlaubt (${src.max_removal_pct} %). Bitte Vorschau prüfen.`
				: 'Wartet auf Freigabe.';
			await sql`update import_runs set status = 'vorschau', finished_at = now(), message = ${msg} where id = ${runId}`;
		} else {
			await applyRun(sql, runId, null);
		}
		await sql`update data_sources set last_success_at = now(), last_error = null, runs_ok = runs_ok + 1, runs_failed = 0,
			next_run_at = now() + make_interval(hours => interval_hours) where key = ${src.key}`;
	} catch (e) {
		const msg = (e as Error).message.slice(0, 500);
		await sql`update import_runs set status = 'fehler', finished_at = now(), message = ${msg} where id = ${runId}`;
		// Wiederholung mit wachsendem Abstand: 1 h, 2 h, 4 h … höchstens bis zum regulären Rhythmus
		await sql`update data_sources set last_error = ${msg}, runs_failed = runs_failed + 1,
			next_run_at = now() + least(make_interval(hours => interval_hours), make_interval(hours => power(2, least(runs_failed, 6))::int))
			where key = ${src.key}`;
	}
	await pruneRuns(sql, src.key);
	return runId;
}

/** Speicher klein halten: Vorschau-Einträge nur für die letzten 3 Läufe, Laufliste 60 je Quelle. */
export async function pruneRuns(sql: Sql, key: string) {
	await sql`delete from import_items where run_id in (
		select id from import_runs where source_key = ${key} and status <> 'vorschau' order by id desc offset 3)`;
	await sql`delete from import_runs where id in (select id from import_runs where source_key = ${key} order by id desc offset 60)`;
}

export async function discardRun(sql: Sql, runId: number, actorId: string) {
	const r = await sql`update import_runs set status = 'verworfen', applied_by = ${actorId}, applied_at = now()
		where id = ${runId} and status = 'vorschau'`;
	if (!r.count) throw new Error('Nur Läufe in der Vorschau können verworfen werden.');
	await sql`delete from import_items where run_id = ${runId}`;
}

export { PLACE_FIELDS };
