// Anzeigehilfen für den Chat (reine Funktionen, auch in Tests nutzbar).
const TZ = 'Europe/Berlin';

export function timeShort(ts: number, now = Date.now()): string {
	const d = new Date(ts);
	const day = (x: Date) => x.toLocaleDateString('de-DE', { timeZone: TZ });
	if (day(d) === day(new Date(now))) return d.toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
	if (day(d) === day(new Date(now - 86_400_000))) return 'gestern';
	if (now - ts < 6 * 86_400_000) return d.toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'short' });
	return d.toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function clock(ts: number): string {
	return new Date(ts).toLocaleTimeString('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(ts: number, now = Date.now()): string {
	const d = new Date(ts);
	const day = (x: Date) => x.toLocaleDateString('de-DE', { timeZone: TZ });
	if (day(d) === day(new Date(now))) return 'Heute';
	if (day(d) === day(new Date(now - 86_400_000))) return 'Gestern';
	return d.toLocaleDateString('de-DE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
}

/** „noch 3 Std.“ / „noch 12 Min.“ / „abgelaufen“ */
export function remaining(until: string | number | Date, now = Date.now()): string {
	const ms = new Date(until).getTime() - now;
	if (ms <= 0) return 'abgelaufen';
	const min = Math.ceil(ms / 60_000);
	if (min < 60) return `noch ${min} Min.`;
	const h = Math.floor(min / 60);
	if (h < 48) return `noch ${h} Std.`;
	return `noch ${Math.floor(h / 24)} Tage`;
}

export function duration(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fileSize(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Nachrichtentext sicher darstellen: alles maskiert, nur http(s)-Links werden klickbar (öffnen in neuem Tab). */
export function linkify(text: string): string {
	const out: string[] = [];
	let last = 0;
	const re = /\bhttps?:\/\/[^\s<>"']+/gi;
	for (const m of text.matchAll(re)) {
		let url = m[0];
		const trail = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? '';
		if (trail) url = url.slice(0, -trail.length);
		out.push(esc(text.slice(last, m.index)));
		try {
			const u = new URL(url);
			out.push(`<a href="${esc(u.toString())}" target="_blank" rel="noopener noreferrer nofollow">${esc(url)}</a>`);
		} catch {
			out.push(esc(url));
		}
		last = m.index! + url.length;
	}
	out.push(esc(text.slice(last)));
	return out.join('').replace(/\n/g, '<br>');
}

/** geo:-URI → Koordinaten */
export function parseGeo(uri: string): { lat: number; lon: number } | null {
	const m = /^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(uri ?? '');
	if (!m) return null;
	const lat = Number(m[1]), lon = Number(m[2]);
	return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
