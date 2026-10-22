// GPS-Aufzeichnung von Kinderwagenrouten (F-027, D-059 angepasst). Läuft nur im Browser; nichts davon geht an den
// Server, bevor man absendet. Gespeichert wird nur die Linie – keine Zeitstempel, kein Tempo.
export type Pt = [number, number]; // [lon, lat]

const R = 6371000;
const rad = Math.PI / 180;

export function distM(a: Pt, b: Pt): number {
	const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
	const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(x));
}

export function lengthM(c: Pt[]): number {
	let m = 0;
	for (let i = 1; i < c.length; i++) m += distM(c[i - 1], c[i]);
	return m;
}

/** Punkt auf der Strecke a→b bei Anteil t (0..1) */
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Schneidet am Anfang `fromStart` und am Ende `fromEnd` Meter entlang des Wegs ab (für den Schutz der Wohnadresse). */
export function trimEnds(c: Pt[], fromStart: number, fromEnd: number): Pt[] {
	const total = lengthM(c);
	if (c.length < 2 || fromStart + fromEnd >= total - 1) return [];
	const cutStart = (pts: Pt[], m: number): Pt[] => {
		if (m <= 0) return pts;
		let acc = 0;
		for (let i = 1; i < pts.length; i++) {
			const d = distM(pts[i - 1], pts[i]);
			if (acc + d >= m) return [lerp(pts[i - 1], pts[i], d ? (m - acc) / d : 0), ...pts.slice(i)];
			acc += d;
		}
		return [];
	};
	const head = cutStart(c, fromStart);
	return cutStart([...head].reverse(), fromEnd).reverse();
}

/** Douglas-Peucker in Metern (lokale Projektion – reicht für Spaziergänge). */
export function simplify(c: Pt[], tolM: number): Pt[] {
	if (c.length < 3) return c.slice();
	const lat0 = c[0][1] * rad;
	const xy = c.map(([lo, la]) => [lo * rad * R * Math.cos(lat0), la * rad * R] as const);
	const keep = new Uint8Array(c.length);
	keep[0] = keep[c.length - 1] = 1;
	const stack: [number, number][] = [[0, c.length - 1]];
	while (stack.length) {
		const [s, e] = stack.pop()!;
		const [x1, y1] = xy[s], [x2, y2] = xy[e];
		const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
		let best = -1, bi = -1;
		for (let i = s + 1; i < e; i++) {
			const [x, y] = xy[i];
			let t = len2 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
			t = Math.max(0, Math.min(1, t));
			const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
			if (d > best) [best, bi] = [d, i];
		}
		if (best > tolM && bi > 0) {
			keep[bi] = 1;
			stack.push([s, bi], [bi, e]);
		}
	}
	return c.filter((_, i) => keep[i]);
}

export const MAX_POINTS = 480; // Server nimmt höchstens 500

/** Für die Prüfung/das Absenden: Enden kürzen, auf höchstens MAX_POINTS Punkte vereinfachen, auf 6 Nachkommastellen runden. */
export function prepare(raw: Pt[], trimStart: number, trimEnd: number): Pt[] {
	// Erst GPS-Zittern glätten, dann kürzen: Zickzack würde die Strecke künstlich verlängern, und „50 m“ wären in
	// Wirklichkeit weniger Abstand zur Haustür.
	const cut = trimEnds(simplify(raw, 6), trimStart, trimEnd);
	let tol = 3;
	let out = simplify(cut, tol);
	while (out.length > MAX_POINTS && tol < 200) out = simplify(cut, (tol *= 1.6));
	return out.map(([lo, la]) => [Math.round(lo * 1e6) / 1e6, Math.round(la * 1e6) / 1e6]);
}

/** Neuen GPS-Punkt übernehmen? Ungenaue (> 35 m) und Zittern (< 5 m Bewegung) werden verworfen. */
export function acceptFix(last: Pt | null, p: Pt, accuracyM: number): boolean {
	if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || accuracyM > 35) return false;
	return !last || distM(last, p) >= 5;
}
