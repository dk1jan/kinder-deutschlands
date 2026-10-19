// Zeitplan für den Chat: abgelaufene Treffen löschen (jede Minute). Eigener Takt, damit lange Datenimporte nicht bremsen.
import { db } from '../db';
import { chatEnabled } from './synapse';
import { expireTreffen } from './rooms';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick() {
	if (running) return;
	running = true;
	try {
		const n = await expireTreffen(db());
		if (n) console.log(`[chat] ${n} abgelaufene(s) Treffen gelöscht.`);
	} catch (e) {
		console.error('[chat] Zeitplan:', (e as Error).message);
	} finally {
		running = false;
	}
}

export function startChatJobs() {
	// CHAT_JOBS=on erzwingt den Takt auch bei SCHEDULER=off (Tests), CHAT_JOBS_MS verkürzt ihn
	if (timer || !chatEnabled() || (process.env.SCHEDULER === 'off' && process.env.CHAT_JOBS !== 'on')) return;
	timer = setInterval(() => void tick(), Number(process.env.CHAT_JOBS_MS) || 60_000);
}
