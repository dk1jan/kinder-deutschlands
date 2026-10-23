import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';
import { appUrl } from '$lib/server/config';
import { mailConfigured } from '$lib/server/mailer';
import { db } from '$lib/server/db';
import { placeCounts } from '$lib/server/places';

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

export const load: PageServerLoad = async ({ url }) => {
	if (!cached) {
		cached = await QRCode.toString(appUrl() + '/', {
			type: 'svg',
			margin: 0,
			errorCorrectionLevel: 'M',
			color: { dark: '#0f2238', light: '#00000000' }
		});
	}
	const { counts, stand } = await stats();
	return { qr: cached, mailOpen: mailConfigured(), deleted: url.searchParams.has('geloescht'), counts, stand };
};
