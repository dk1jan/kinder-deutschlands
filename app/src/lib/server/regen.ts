// Regen in den nächsten 2 Stunden (F-057, D-095): Regenradar RV des Deutschen Wetterdienstes (5-Minuten-Schritte, 1-km-Raster,
// 2 Stunden Vorhersage), abgefragt über die Schnittstelle von Bright Sky (brightsky.dev, „free-to-use for all purposes“, es gelten die
// Bedingungen des DWD, CC BY 4.0). Abfrage nur vom Server, für einen auf ~1 km gerundeten Punkt, ohne Konto, ohne Besucher-Adresse.
// Werte laut Bright Sky: Niederschlag in 0,01 mm je 5 Minuten (Annahme aus der Bright-Sky-Dokumentation, Issue #144).
// Eigener Betrieb von Bright Sky ist über BRIGHTSKY_URL möglich.
const base = () => (process.env.BRIGHTSKY_URL || 'https://api.brightsky.dev').replace(/\/$/, '');

export const REGEN_ATTRIBUTION = 'Regenradar: Deutscher Wetterdienst (Produkt RV, CC BY 4.0), über Bright Sky abgerufen und von uns in Regenzeiten umgerechnet';

export type RegenLevel = 0 | 1 | 2 | 3;
export const REGEN_LABEL = ['kein Regen', 'leichter Regen', 'mäßiger Regen', 'starker Regen'] as const;

/** 0,01 mm je 5 Minuten → Stufe. Grenzen wie die üblichen Regenstärken: ab ~0,6 mm/h Regen, ab 2,5 mm/h mäßig, ab 10 mm/h stark. */
export function levelOfRate(v: number): RegenLevel {
	if (!(v > 0)) return 0;
	return v >= 84 ? 3 : v >= 21 ? 2 : v >= 5 ? 1 : 0;
}

export interface RegenStep {
	at: string; // ISO
	l: RegenLevel;
}
export interface Regen {
	steps: RegenStep[];
	/** Regen in der aktuellen Zeitscheibe */
	now: RegenLevel;
	/** erste Zeitscheibe mit Regen (ISO), sonst null */
	beginsAt: string | null;
	/** Regen hört auf (zwei trockene Zeitscheiben hintereinander), sonst null */
	endsAt: string | null;
	peak: RegenLevel;
	/** letzte Zeitscheibe der Vorhersage */
	horizon: string;
}

/** Zeitreihe → Zusammenfassung ab jetzt (eine Zeitscheibe Toleranz zurück). */
export function summarize(raw: { at: Date; v: number }[], now: Date = new Date()): Regen | null {
	const steps = raw
		.filter((s) => s.at.getTime() >= now.getTime() - 5 * 60_000)
		.sort((a, b) => a.at.getTime() - b.at.getTime())
		.map((s) => ({ at: s.at.toISOString(), l: levelOfRate(s.v) }));
	if (!steps.length) return null;
	const i0 = steps.findIndex((s) => s.l > 0);
	let endsAt: string | null = null;
	if (i0 >= 0) {
		for (let j = i0 + 1; j < steps.length; j++) {
			if (steps[j].l === 0 && (steps[j + 1]?.l ?? 0) === 0) {
				endsAt = steps[j].at;
				break;
			}
		}
	}
	return { steps, now: steps[0].l, beginsAt: i0 >= 0 ? steps[i0].at : null, endsAt, peak: Math.max(...steps.map((s) => s.l)) as RegenLevel, horizon: steps.at(-1)!.at };
}

/** Antwort von /radar lesen (format=plain). Liefert je Zeitscheibe den höchsten Wert im kleinen Raster um den Punkt. */
export function parseRadar(json: unknown): { at: Date; v: number }[] | null {
	const radar = (json as { radar?: unknown })?.radar;
	if (!Array.isArray(radar)) return null;
	const out: { at: Date; v: number }[] = [];
	for (const e of radar) {
		const ts = (e as { timestamp?: unknown })?.timestamp;
		const at = typeof ts === 'string' ? new Date(ts) : null;
		const grid = (e as { precipitation_5?: unknown })?.precipitation_5;
		if (!at || Number.isNaN(at.getTime()) || !Array.isArray(grid)) continue;
		const vals = grid.flat().filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
		if (vals.length) out.push({ at, v: Math.max(...vals) });
	}
	return out.length ? out : null;
}

const cache = new Map<string, { at: number; v: Regen | null }>();
const TTL = 5 * 60_000;
const NEG_TTL = 60_000;
const calls: number[] = [];
const MAX_CALLS_PER_HOUR = 400; // rücksichtsvoll gegenüber dem kostenlosen Dienst
let lastWarn = 0;

/** Nur für Tests. */
export function resetRegenCache() {
	cache.clear();
	calls.length = 0;
}

/** Regen am Punkt (auf 0,01° gerundet), 5 Minuten zwischengespeichert. Bei Fehlern null – nie eine Fehlermeldung an Besucher. */
export async function regenAt(lat: number, lon: number, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<Regen | null> {
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || lon < 5 || lon > 16 || lat < 47 || lat > 56) return null;
	const la = Number(lat.toFixed(2));
	const lo = Number(lon.toFixed(2));
	const key = `${la}:${lo}`;
	const now = opts.now ?? new Date();
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < (hit.v ? TTL : NEG_TTL)) return hit.v;
	const t = Date.now();
	while (calls.length && t - calls[0] > 3600_000) calls.shift();
	if (calls.length >= MAX_CALLS_PER_HOUR) return hit?.v ?? null;
	calls.push(t);
	try {
		const res = await (opts.fetchImpl ?? fetch)(`${base()}/radar?lat=${la}&lon=${lo}&distance=1000&format=plain`, {
			headers: { 'user-agent': `KinderDeutschlands/1.0 (+${(process.env.APP_URL || 'https://kinder-deutschlands.de').replace(/\/$/, '')})`, accept: 'application/json' },
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const parsed = parseRadar(await res.json());
		const v = parsed ? summarize(parsed, now) : null;
		if (cache.size > 2000) cache.clear();
		cache.set(key, { at: Date.now(), v });
		return v;
	} catch (e) {
		if (Date.now() - lastWarn > 10 * 60_000) {
			lastWarn = Date.now();
			console.warn('[regen] Abruf fehlgeschlagen:', (e as Error).message);
		}
		cache.set(key, { at: Date.now(), v: null });
		return null;
	}
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

/** Erste Regen-Zeitscheibe im Zeitfenster (mit Toleranz einer Zeitscheibe nach hinten). */
export function rainIn(r: Regen, from: Date, to: Date): { at: string; level: RegenLevel } | null {
	for (const s of r.steps) {
		const t = new Date(s.at).getTime();
		if (s.l > 0 && t >= from.getTime() - 5 * 60_000 && t <= to.getTime()) return { at: s.at, level: s.l };
	}
	return null;
}

/** Satz für Karte und Terminseite; null, wenn im Zeitraum kein Regen erwartet wird. */
export function regenText(r: Regen | null): string | null {
	if (!r || !r.beginsAt) return null;
	const label = REGEN_LABEL[r.peak];
	if (r.now > 0) return `Es regnet gerade (${REGEN_LABEL[r.now]}) – ${r.endsAt ? `voraussichtlich bis ca. ${hhmm(r.endsAt)} Uhr` : `mindestens bis ca. ${hhmm(r.horizon)} Uhr`}.`;
	return `${label[0].toUpperCase()}${label.slice(1)} ab ca. ${hhmm(r.beginsAt)} Uhr erwartet${r.endsAt ? `, bis ca. ${hhmm(r.endsAt)} Uhr` : ''}.`;
}

export const regenTime = hhmm;
