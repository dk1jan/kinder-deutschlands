// Zeitplan für Abschnitt 5: Erinnerungen (jede Minute), Radar-Zusammenfassungen und Bitten um erneute
// Bestätigung freier Plätze (alle 10 Minuten). Eigener Takt, unabhängig von langen Datenimporten.
import { db } from '../db';
import { sendReminders } from './saved';
import { sendDigests } from './radar';
import { remindReconfirm } from './offers';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let ticks = 0;

export async function tickAngebote(full = false) {
	if (running) return;
	running = true;
	try {
		const sql = db();
		const r = await sendReminders(sql);
		if (r) console.log(`[angebote] ${r} Erinnerung(en) verschickt.`);
		if (full || ticks % 10 === 0) {
			const d = await sendDigests(sql);
			if (d) console.log(`[radar] ${d} Zusammenfassung(en) verschickt.`);
			await remindReconfirm(sql);
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
