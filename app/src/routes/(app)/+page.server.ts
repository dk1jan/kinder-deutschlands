import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';
import { appUrl } from '$lib/server/config';
import { mailConfigured } from '$lib/server/mailer';
import { db } from '$lib/server/db';
import { placeCounts } from '$lib/server/places';
import { overview as warnOverview } from '$lib/server/warnings/store';

// Echter QR-Code (führt auf diese Plattform) für die Beispiel-Familien-ID auf der Startseite.
let cached: string | null = null;

// Datenübersicht (F-029): echte Zählung, 10 Minuten zwischengespeichert – die Startseite wird oft aufgerufen.
let statCache: { at: number; counts: Partial<Record<string, number>>; stand: string | null } | null = null;
async function stats() {
	if (statCache && Date.now() - statCache.at < 10 * 60 * 1000) return statCache;
	try {
		const sql = db();
		const [counts, [s]] = await Promise.all([placeCounts(sql), sql`select max(last_success_at) as t from data_sources where kind = 'orte'`]);
		// Leerer Bestand (frisch aufgesetzt) nicht zwischenspeichern – sonst bliebe die Übersicht nach dem ersten Abruf 10 Min. leer
		const empty = !Object.values(counts).some((n) => (n ?? 0) > 0);
		statCache = { at: empty ? 0 : Date.now(), counts, stand: s?.t ? new Date(s.t).toISOString() : null };
	} catch {
		statCache = { at: Date.now() - 9 * 60 * 1000, counts: {}, stand: null }; // bei Fehler in 1 Min. erneut versuchen
	}
	return statCache;
}

// Unwetterwarnungen auf der Startseite (Jan 24.10.): was gerade in Deutschland aktiv ist, 2 Minuten zwischengespeichert
let warnCache: { at: number; v: { severe: number; kreise: number; markant: number } } | null = null;
async function warnings() {
	if (warnCache && Date.now() - warnCache.at < 2 * 60 * 1000) return warnCache.v;
	try {
		const o = await warnOverview(db());
		const g = (n: number) => o.byLevel[n] ?? { n: 0, kreise: 0 };
		warnCache = { at: Date.now(), v: { severe: g(3).n + g(4).n, kreise: g(3).kreise + g(4).kreise, markant: g(2).n } };
	} catch {
		warnCache = { at: Date.now(), v: { severe: 0, kreise: 0, markant: 0 } };
	}
	return warnCache.v;
}

export const load: PageServerLoad = async ({ url }) => {
	if (!cached) {
		cached = await QRCode.toString(appUrl() + '/', {
			type: 'svg',
			margin: 0,
			errorCorrectionLevel: 'M',
			color: { dark: '#0f2238', light: '#00000000' }
		});
	}
	const [{ counts }, warn] = await Promise.all([stats(), warnings()]);
	return { qr: cached, mailOpen: mailConfigured(), deleted: url.searchParams.has('geloescht'), counts, warn };
};
