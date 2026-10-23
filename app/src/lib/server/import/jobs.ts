// Zeitplan für alle Quellen. Läuft im Web-Container, immer nur ein Abruf gleichzeitig (Datenbank-Sperre).
// Abschalten (Tests, Entwicklung): SCHEDULER=off.
import type { Sql } from '../db';
import { db } from '../db';
import { appUrl } from '../config';
import { runPlaceSource, pruneRuns, assignRegions, type SourceRow } from './engine';
import { overpass, toRecords, buildQuery, type Selector } from './osm';
import { fetchFromExtract, osmSource, osmiumAvailable } from './osmfile';
import { importOsmDistricts, importVg250 } from './regions';
import { refreshTiles } from './tiles';
import { dropKnown, fetchOverture, toRecord } from './overture';
import type { ImportRecord } from './types';
import { pruneAerialCache } from '../aerial';
import { autoMergeDuplicates } from '../datacenter';
import { importIcs, type IcsSourceConfig } from '../angebote/icsimport';

const LOCK_ID = 7_302_011; // beliebige feste Zahl für pg_advisory_lock
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

export function userAgent(): string {
	return `kinder-deutschlands/1.0 (+${appUrl()})`;
}

function overpassEndpoints(): string[] | undefined {
	const v = process.env.OVERPASS_URL;
	return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

async function fetchOsm(src: SourceRow, signal: AbortSignal) {
	const selector = src.config.selector as Selector;
	// F-022: zuerst aus dem Deutschland-Auszug (eigener Server), Overpass nur als Rückfall
	const mode = osmSource();
	let fileError = '';
	if (mode === 'datei' || (mode === 'auto' && (await osmiumAvailable()))) {
		try {
			return toRecords(selector, await fetchFromExtract(selector, userAgent(), signal));
		} catch (e) {
			fileError = (e as Error).message;
			if (mode === 'datei') throw e;
			console.warn(`[import] ${src.key}: OSM-Auszug nicht nutzbar (${fileError}) – versuche Overpass`);
		}
	}
	try {
		return await fetchOverpass(src, selector, signal);
	} catch (e) {
		throw fileError ? new Error(`Auszug: ${fileError} · Overpass: ${(e as Error).message}`.slice(0, 500)) : e;
	}
}

async function fetchOverpass(src: SourceRow, selector: Selector, signal: AbortSignal) {
	const areas = (src.config.areas as string[] | undefined) ?? ['DE-HB'];
	const out = [];
	for (const [i, iso] of areas.entries()) {
		// Overpass schonen: kurze Pause zwischen den Ländern (F-015, ganz Deutschland)
		if (i) await new Promise((r) => setTimeout(r, Number(process.env.OVERPASS_PAUSE_MS ?? 5000)));
		const els = await overpass(buildQuery(selector, iso), { userAgent: userAgent(), endpoints: overpassEndpoints(), signal });
		out.push(...toRecords(selector, els));
	}
	return out;
}

/** Overture (F-028): passende Orte in Deutschland, ohne die, die es aus OSM oder von Mitgliedern schon gibt. */
async function fetchOvertureRecords(sql: Sql, src: SourceRow, signal: AbortSignal) {
	const minConfidence = Number(src.config.min_confidence ?? 0.8);
	const r = await fetchOverture({ minConfidence, release: (src.config.release as string | undefined) || undefined, signal });
	const recs = r.places.map((p) => toRecord(p, minConfidence)).filter((x): x is ImportRecord => !!x);
	const fresh = await dropKnown(sql, src.key, recs);
	console.log(`[import] ${src.key}: Ausgabe ${r.release}${r.cached ? ' (zwischengespeichert)' : ''} · ${r.stats.zeilen_gelesen} Zeilen geprüft · ${recs.length} passend · ${recs.length - fresh.length} schon vorhanden`);
	return fresh;
}

/** Nicht-Orte-Quellen (Regionen, Karte) protokollieren ihre Läufe ebenfalls in import_runs. */
async function runSimple(sql: Sql, src: SourceRow, trigger: 'zeitplan' | 'manuell', actorId: string | null, work: () => Promise<{ counts: Record<string, number>; message: string }>) {
	const [run] = await sql`insert into import_runs (source_key, trigger, triggered_by, status) values (${src.key}, ${trigger}, ${actorId}, 'laeuft') returning id`;
	await sql`update data_sources set last_run_at = now() where key = ${src.key}`;
	try {
		const r = await work();
		await sql`update import_runs set status = 'uebernommen', finished_at = now(), applied_at = now(), counts = ${sql.json(r.counts as never)}, message = ${r.message} where id = ${run.id}`;
		await sql`update data_sources set last_success_at = now(), last_error = null, runs_ok = runs_ok + 1, runs_failed = 0,
			next_run_at = now() + make_interval(hours => interval_hours) where key = ${src.key}`;
	} catch (e) {
		const msg = (e as Error).message.slice(0, 500);
		await sql`update import_runs set status = 'fehler', finished_at = now(), message = ${msg} where id = ${run.id}`;
		await sql`update data_sources set last_error = ${msg}, runs_failed = runs_failed + 1,
			next_run_at = now() + least(make_interval(hours => interval_hours), make_interval(hours => power(2, least(runs_failed, 6))::int))
			where key = ${src.key}`;
	}
	await pruneRuns(sql, src.key);
	return Number(run.id);
}

/** Eindeutige Dubletten gleich nach jedem Abruf zusammenführen (F-029). Schlägt das fehl, bleiben sie zur Prüfung. */
async function mergeNow(sql: Sql) {
	try {
		const r = await autoMergeDuplicates(sql);
		if (r.zusammengefuehrt) console.log(`[import] Dubletten: ${r.zusammengefuehrt} automatisch zusammengeführt, ${r.offen} offen zur Prüfung`);
	} catch (e) {
		console.error('Dubletten zusammenführen:', (e as Error).message);
	}
}

export class BusyError extends Error {}

/** Führt eine Quelle sofort aus. Wirft BusyError, wenn gerade ein anderer Abruf läuft. */
export async function runSource(sql: Sql, key: string, trigger: 'zeitplan' | 'manuell', actorId: string | null = null, force = false): Promise<number> {
	const reserved = await sql.reserve();
	try {
		const [{ ok }] = await reserved`select pg_try_advisory_lock(${LOCK_ID}) as ok`;
		if (!ok) throw new BusyError('Es läuft bereits ein Abruf. Bitte kurz warten.');
		try {
			const [src] = (await sql`select * from data_sources where key = ${key}`) as unknown as SourceRow[];
			if (!src) throw new Error('Quelle nicht gefunden.');
			const type = src.config.type as string;
			if (src.kind === 'orte' && (type === 'osm' || type === 'overture')) {
				const runId = await runPlaceSource(sql, src, {
					trigger,
					actorId,
					fetchRecords: type === 'osm' ? fetchOsm : (s, signal) => fetchOvertureRecords(sql, s, signal)
				});
				await mergeNow(sql);
				return runId;
			}
			if (type === 'vg250') {
				return await runSimple(sql, src, trigger, actorId, async () => {
					const r = await importVg250(sql, src.config as { laender?: string[]; url?: string });
					await assignRegions(sql);
					// Stadtteile hängen an den Stadtgrenzen – direkt danach (neu) zuordnen
					await sql`update data_sources set next_run_at = now() where config->>'type' = 'osm-stadtteile' and not paused`;
					return r;
				});
			}
			if (type === 'osm-stadtteile') {
				return await runSimple(sql, src, trigger, actorId, async () => {
					const r = await importOsmDistricts(sql, src.config as { iso?: string; admin_level?: number }, { userAgent: userAgent(), endpoints: overpassEndpoints() });
					await assignRegions(sql);
					return r;
				});
			}
			if (type === 'protomaps') {
				return await runSimple(sql, src, trigger, actorId, () =>
					refreshTiles(sql, { bbox: String(src.config.bbox), maxzoom: Number(src.config.maxzoom ?? 15) }, force || trigger === 'manuell')
				);
			}
			if (type === 'ics') {
				return await runSimple(sql, src, trigger, actorId, () => importIcs(sql, src.key, src.config as unknown as IcsSourceConfig));
			}
			throw new Error(`Unbekannter Quellentyp: ${type}`);
		} finally {
			await reserved`select pg_advisory_unlock(${LOCK_ID})`;
		}
	} finally {
		reserved.release();
	}
}

/** Manueller Start aus der Datenzentrale: läuft im Hintergrund weiter, die Seite zeigt den Fortschritt. */
export function runInBackground(key: string, actorId: string) {
	void runSource(db(), key, 'manuell', actorId).catch((e) => {
		if (!(e instanceof BusyError)) console.error(`Abruf ${key} fehlgeschlagen:`, (e as Error).message);
	});
}

export async function isRunning(sql: Sql): Promise<boolean> {
	const [r] = await sql`select exists(select 1 from import_runs where status = 'laeuft') as x`;
	return !!r.x;
}

let lastPrune = 0;
let lastMerge = 0;

async function tick() {
	if (busy) return;
	busy = true;
	try {
		if (Date.now() - lastPrune > 24 * 3600 * 1000) {
			lastPrune = Date.now();
			const n = await pruneAerialCache().catch(() => 0);
			if (n) console.log(`Luftbild-Zwischenspeicher: ${n} alte Kacheln entfernt.`);
		}
		const sql = db();
		// Einmal täglich (und kurz nach dem Start) den Dubletten-Bestand abarbeiten – unter derselben Sperre wie Abrufe
		if (Date.now() - lastMerge > 24 * 3600 * 1000) {
			lastMerge = Date.now();
			const reserved = await sql.reserve();
			try {
				const [{ ok }] = await reserved`select pg_try_advisory_lock(${LOCK_ID}) as ok`;
				if (ok) {
					try {
						await mergeNow(sql);
					} finally {
						await reserved`select pg_advisory_unlock(${LOCK_ID})`;
					}
				} else lastMerge = 0;
			} finally {
				reserved.release();
			}
		}
		// Noch nie gelaufene Quellen zuerst – neue Quellen füllen sich nach einem Update von selbst, ohne Knopfdruck
		const due = await sql`select key from data_sources where not paused and next_run_at <= now() order by (last_success_at is null) desc, next_run_at limit 1`;
		if (due.length) await runSource(sql, due[0].key, 'zeitplan');
	} catch (e) {
		if (!(e instanceof BusyError)) console.error('Zeitplan:', (e as Error).message);
	} finally {
		busy = false;
	}
}

export async function startScheduler() {
	if (timer || process.env.SCHEDULER === 'off') return;
	// Nach einem Neustart hängengebliebene Läufe sauber beenden
	await db()`update import_runs set status = 'fehler', finished_at = now(), message = 'Abgebrochen durch Neustart.' where status = 'laeuft'`;
	timer = setInterval(() => void tick(), 60_000);
	setTimeout(() => void tick(), 20_000);
}
