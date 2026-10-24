// Zeitplan für Wetterwarnungen: alle 5 Minuten die Verzeichnisliste des DWD prüfen, neue Momentaufnahme übernehmen.
// Eigener Takt, unabhängig von langen Datenimporten. WARN_JOBS=off schaltet ab, WARN_JOBS=on erzwingt (Tests).
import { db, type Sql } from '../db';
import { fetchListing, fetchSnapshot, latestFile } from './dwd';
import { ingest, purgeWarnings, type IngestResult } from './store';

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

export function startWarningJobs() {
	const flag = process.env.WARN_JOBS;
	if (timer || flag === 'off' || (process.env.SCHEDULER === 'off' && flag !== 'on')) return;
	const ms = Number(process.env.WARN_JOBS_MS) || 5 * 60_000;
	setTimeout(() => void tickWarnings().catch(() => {}), 20_000);
	timer = setInterval(() => void tickWarnings().catch(() => {}), ms);
}
