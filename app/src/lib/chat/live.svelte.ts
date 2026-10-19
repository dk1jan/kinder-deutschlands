// Live-Standort im Chat (M06): freiwillig, sichtbar aktiv, zeitlich begrenzt (15/30/60 Min.), sofort stoppbar.
// Positionen gehen nur verschlüsselt in den Raum – der Server sieht sie nicht. Im Browser läuft das Teilen nur,
// solange die Seite geöffnet ist (Betriebssysteme erlauben Web-Apps keine Ortung im Hintergrund).
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { getClient } from './client.svelte';

export const LIVE_TYPE = 'de.kinder.live';
export const LIVE_MINUTES = [15, 30, 60] as const;

interface Sharing {
	until: number;
	watch: number;
	timer: ReturnType<typeof setTimeout>;
	last: { lat: number; lon: number; t: number } | null;
	error: string;
}
const active = new Map<string, Sharing>();
export const live = $state({ rooms: {} as Record<string, { until: number; error: string }> });

function publish() {
	const r: Record<string, { until: number; error: string }> = {};
	for (const [k, v] of active) r[k] = { until: v.until, error: v.error };
	live.rooms = r;
}

const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
	const R = 6371000, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
	const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(x));
};

export function startLive(roomId: string, minutes: number): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!('geolocation' in navigator)) return reject(new Error('Dieser Browser kann keinen Standort bestimmen.'));
		stopLive(roomId, false);
		const until = Date.now() + minutes * 60_000;
		let first = true;
		const s: Sharing = { until, watch: 0, timer: setTimeout(() => stopLive(roomId), minutes * 60_000), last: null, error: '' };
		s.watch = navigator.geolocation.watchPosition(
			(pos) => {
				const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: Date.now() };
				// höchstens alle 20 Sekunden oder bei mehr als 25 m Bewegung
				if (s.last && p.t - s.last.t < 20_000 && dist(s.last, p) < 25) return;
				s.last = p;
				s.error = '';
				void getClient()
					?.sendEvent(roomId, LIVE_TYPE as never, { lat: Number(p.lat.toFixed(6)), lon: Number(p.lon.toFixed(6)), acc: Math.round(pos.coords.accuracy), until, ts: p.t } as never)
					.catch(() => {});
				publish();
				if (first) {
					first = false;
					resolve();
				}
			},
			(err) => {
				s.error = err.code === err.PERMISSION_DENIED ? 'Standort im Browser nicht erlaubt.' : 'Standort gerade nicht verfügbar.';
				publish();
				if (first) {
					first = false;
					stopLive(roomId, false);
					reject(new Error(s.error));
				}
			},
			{ enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
		);
		active.set(roomId, s);
		publish();
	});
}

export function stopLive(roomId: string, announce = true) {
	const s = active.get(roomId);
	if (!s) return;
	navigator.geolocation.clearWatch(s.watch);
	clearTimeout(s.timer);
	active.delete(roomId);
	publish();
	if (announce) void getClient()?.sendEvent(roomId, LIVE_TYPE as never, { stop: true, ts: Date.now() } as never).catch(() => {});
}

export interface LivePoint {
	userId: string;
	name: string;
	lat: number;
	lon: number;
	acc: number;
	ts: number;
	until: number;
	mine: boolean;
}

/** Aktive Live-Standorte im Raum (letzte Meldung je Person; abgelaufen, gestoppt oder älter als 5 Min. → nicht mehr). */
export function livePoints(room: Room, now = Date.now()): LivePoint[] {
	const me = getClient()?.getUserId();
	const latest = new Map<string, MatrixEvent>();
	for (const ev of room.getLiveTimeline().getEvents()) {
		if (ev.getType() !== LIVE_TYPE) continue;
		latest.set(ev.getSender() ?? '', ev);
	}
	const out: LivePoint[] = [];
	for (const [uid, ev] of latest) {
		const c = ev.getContent() as { lat?: number; lon?: number; acc?: number; until?: number; ts?: number; stop?: boolean };
		if (c.stop || typeof c.lat !== 'number' || typeof c.lon !== 'number') continue;
		const ts = ev.getTs();
		const until = Math.min(Number(c.until) || 0, ts + 60 * 60_000);
		if (until < now || now - ts > 5 * 60_000) continue;
		out.push({ userId: uid, name: room.getMember(uid)?.name ?? 'Mitglied', lat: c.lat, lon: c.lon, acc: Number(c.acc) || 0, ts, until, mine: uid === me });
	}
	return out;
}
