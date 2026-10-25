// Zeitplan für Abschnitt 5 und 6: Erinnerungen (jede Minute); alle 10 Minuten Radar-Zusammenfassungen, Bitten um
// erneute Bestätigung freier Plätze, Marktplatz-Suchaufträge, Ablauf von Anzeigen/Hilfe-Einträgen und das Löschen
// vergangener Einladungen. Eigener Takt, unabhängig von langen Datenimporten.
import { db } from '../db';
import { sendReminders } from './saved';
import { sendDigests } from './radar';
import { remindReconfirm } from './offers';
import { checkSearches, expireListings } from '../alltag/market';
import { expireHelp } from '../alltag/help';
import { purgeInvitations } from '../alltag/invitations';
import { tickEventWeather } from './wetter';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
import { purgeLive } from '../live';
let ticks = 0;

export async function tickAngebote(full = false) {
	if (running) return;
	running = true;
	try {
		const sql = db();
		await purgeLive(sql); // F-037: abgelaufene Live-Freigaben jede Minute löschen
		const r = await sendReminders(sql);
		if (r) console.log(`[angebote] ${r} Erinnerung(en) verschickt.`);
		if (full || ticks % 10 === 0) {
			const d = await sendDigests(sql);
			if (d) console.log(`[radar] ${d} Zusammenfassung(en) verschickt.`);
			await remindReconfirm(sql);
			await expireListings(sql);
			await expireHelp(sql);
			const m = await checkSearches(sql);
			if (m) console.log(`[markt] ${m} Suchauftrag/-aufträge mit neuen Anzeigen.`);
			const p = await purgeInvitations(sql);
			if (p) console.log(`[einladungen] ${p} vergangene Einladung(en) gelöscht.`);
		}
		if (full || ticks % 5 === 0) {
			const w = await tickEventWeather(sql); // F-056: Wetterwarnung zur Terminzeit
			if (w) console.log(`[wetter] ${w} Mitteilung(en) zu Terminen mit Wetterwarnung.`);
		}
		ticks++;
	} catch (e) {
		console.error('[angebote] Zeitplan:', (e as Error).message);
	} finally {
		running = false;
	}
}

export function startAngeboteJobs() {
	if (timer || (process.env.SCHEDULER === 'off' && process.env.ANGEBOTE_JOBS !== 'on')) return;
	timer = setInterval(() => void tickAngebote(), Number(process.env.ANGEBOTE_JOBS_MS) || 60_000);
}
