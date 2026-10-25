// Zeitplan für Wetterwarnungen: alle 5 Minuten die Verzeichnisliste des DWD prüfen, neue Momentaufnahme übernehmen.
// Eigener Takt, unabhängig von langen Datenimporten. WARN_JOBS=off schaltet ab, WARN_JOBS=on erzwingt (Tests).
import { db, type Sql } from '../db';
import { fetchListing, fetchSnapshot, latestFile } from './dwd';
import { ingest, ingestNina, purgeWarnings, type IngestResult } from './store';
import { fetchAlert, fetchList, NINA_SOURCES, type NinaSource } from './nina';

interface State {
	file: string | null;
	seeded: boolean;
	last_ok: string | null;
	last_error: string | null;
	last_counts: IngestResult | null;
}

export async function warnState(sql: Sql): Promise<State> {
	const [r] = await sql`select value from settings where key = 'warnungen_dwd'`;
	return { file: null, seeded: false, last_ok: null, last_error: null, last_counts: null, ...((r?.value as Partial<State>) ?? {}) };
}
async function saveState(sql: Sql, s: State) {
	await sql`insert into settings (key, value) values ('warnungen_dwd', ${sql.json(s as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** Ein Durchlauf. Liefert, was passiert ist (für Tests und Protokoll). */
export async function tickWarnings(sql: Sql = db(), fetchImpl: typeof fetch = fetch): Promise<IngestResult | 'unverändert' | 'läuft'> {
	if (running) return 'läuft';
	running = true;
	const state = await warnState(sql);
	try {
		const file = latestFile(await fetchListing(fetchImpl));
		if (!file) throw new Error('DWD: keine Momentaufnahme gefunden.');
		if (file === state.file) {
			await purgeWarnings(sql);
			return 'unverändert';
		}
		const alerts = await fetchSnapshot(file, fetchImpl);
		const r = await ingest(sql, alerts, { notifyNew: state.seeded });
		await saveState(sql, { file, seeded: true, last_ok: new Date().toISOString(), last_error: null, last_counts: r });
		if (r.neu || r.beendet || r.mitteilungen) console.log(`[warnungen] ${r.aktiv} aktiv, ${r.neu} neu, ${r.beendet} beendet, ${r.mitteilungen} Mitteilung(en).`);
		return r;
	} catch (e) {
		const msg = (e as Error).message.slice(0, 300);
		console.error('[warnungen]', msg);
		await saveState(sql, { ...state, last_error: msg }).catch(() => {});
		throw e;
	} finally {
		running = false;
	}
}

// ---------- Bevölkerungsschutz (NINA, F-053) ----------

interface NinaState {
	seeded: boolean;
	last_ok: string | null;
	last_error: string | null;
	last_counts: IngestResult | null;
}
export async function ninaState(sql: Sql): Promise<NinaState> {
	const [r] = await sql`select value from settings where key = 'warnungen_nina'`;
	return { seeded: false, last_ok: null, last_error: null, last_counts: null, ...((r?.value as Partial<NinaState>) ?? {}) };
}
let ninaRunning = false;

/** Ein Durchlauf über alle NINA-Quellen. Eine ausgefallene Quelle beendet keine ihrer Warnungen. */
export async function tickNina(sql: Sql = db(), fetchImpl: typeof fetch = fetch): Promise<IngestResult | 'läuft'> {
	if (ninaRunning) return 'läuft';
	ninaRunning = true;
	const state = await ninaState(sql);
	try {
		const list: { source: NinaSource; id: string; version: number }[] = [];
		const ok: NinaSource[] = [];
		const errors: string[] = [];
		for (const source of Object.keys(NINA_SOURCES) as NinaSource[]) {
			try {
				for (const it of await fetchList(source, fetchImpl)) list.push({ source, id: it.id, version: it.version });
				ok.push(source);
			} catch (e) {
				errors.push(`${source}: ${(e as Error).message}`.slice(0, 120));
			}
		}
		if (!ok.length) throw new Error(`NINA nicht erreichbar (${errors.join('; ')})`);
		const items = new Map(list.map((x) => [x.id, x]));
		const r = await ingestNina(
			sql,
			[...items.values()],
			async (source, id) => {
				const it = items.get(id)!;
				return fetchAlert(source, { id, version: it.version, severity: 'Unknown', type: 'Alert', startDate: null, title: '' }, fetchImpl);
			},
			ok,
			{ notifyNew: state.seeded }
		);
		await sql`insert into settings (key, value) values ('warnungen_nina', ${sql.json({ seeded: true, last_ok: new Date().toISOString(), last_error: errors.join('; ') || null, last_counts: r } as never)})
			on conflict (key) do update set value = excluded.value, updated_at = now()`;
		if (r.neu || r.beendet || r.mitteilungen) console.log(`[warnungen] NINA: ${r.aktiv} aktiv, ${r.neu} neu, ${r.beendet} beendet, ${r.mitteilungen} Mitteilung(en).`);
		return r;
	} catch (e) {
		const msg = (e as Error).message.slice(0, 300);
		console.error('[warnungen] NINA', msg);
		await sql`insert into settings (key, value) values ('warnungen_nina', ${sql.json({ ...state, last_error: msg } as never)})
			on conflict (key) do update set value = excluded.value, updated_at = now()`.catch(() => {});
		throw e;
	} finally {
		ninaRunning = false;
	}
}

export function startWarningJobs() {
	const flag = process.env.WARN_JOBS;
	if (timer || flag === 'off' || (process.env.SCHEDULER === 'off' && flag !== 'on')) return;
	const ms = Number(process.env.WARN_JOBS_MS) || 5 * 60_000;
	const both = () => void tickWarnings().catch(() => {}).finally(() => void tickNina().catch(() => {}));
	setTimeout(both, 20_000);
	timer = setInterval(both, ms);
}
