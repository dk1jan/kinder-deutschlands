// Amtliche Wetterwarnungen des Deutschen Wetterdienstes vom Open-Data-Server (opendata.dwd.de, Lizenz CC BY 4.0,
// Quelle: Deutscher Wetterdienst). Produkt „DISTRICT_DWD_STAT“: alle gerade gültigen Warnungen auf Kreisebene als
// Momentaufnahme, etwa alle 10 Minuten neu, je Warnung eine CAP-Datei im ZIP.
import { fetchRetry } from '../import/net';
import { parseCap, type CapAlert } from './cap';
import { unzip } from './zip';

export const DWD_BASE = 'https://opendata.dwd.de';
const base = () => (process.env.DWD_URL || DWD_BASE).replace(/\/$/, '');
export const DWD_DIR = '/weather/alerts/cap/DISTRICT_DWD_STAT/';
const FILE = /Z_CAP_C_EDZW_(\d{14})_PVW_STATUS_PREMIUMDWD_DISTRICT_DE\.zip/g;

/** Neueste Momentaufnahme (deutsch) aus der Verzeichnisliste. */
export function latestFile(listing: string): string | null {
	const names = [...new Set([...listing.matchAll(FILE)].map((m) => m[0]))].sort();
	return names.at(-1) ?? null;
}

const UA = () => `KinderDeutschlands/1.0 (+${(process.env.APP_URL || 'https://kinder-deutschlands.de').replace(/\/$/, '')})`;

export async function fetchListing(fetchImpl: typeof fetch = fetch): Promise<string> {
	const res = await fetchRetry(base() + DWD_DIR, { headers: { 'user-agent': UA() }, timeoutMs: 60_000 }, 2, 10_000, fetchImpl);
	return res.text();
}

/** Lädt eine Momentaufnahme und liefert alle echten Warnungen (Status „Actual“). */
export async function fetchSnapshot(file: string, fetchImpl: typeof fetch = fetch): Promise<CapAlert[]> {
	if (!/^Z_CAP_C_EDZW_\d{14}_PVW_STATUS_PREMIUMDWD_DISTRICT_DE\.zip$/.test(file)) throw new Error('DWD: unerwarteter Dateiname.');
	const res = await fetchRetry(base() + DWD_DIR + file, { headers: { 'user-agent': UA() }, timeoutMs: 120_000 }, 2, 10_000, fetchImpl);
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.length > 20 * 1024 * 1024) throw new Error('DWD: Paket unerwartet groß.');
	return parseSnapshot(buf);
}

export function parseSnapshot(zip: Buffer): CapAlert[] {
	const out: CapAlert[] = [];
	for (const e of unzip(zip)) {
		if (!/\.xml$/i.test(e.name)) continue;
		const a = parseCap(e.data.toString('utf8'));
		if (a && a.status === 'Actual') out.push(a);
	}
	return out;
}
