import { describe, expect, it } from 'vitest';
import { acceptFix, distM, lengthM, prepare, simplify, trimEnds, MAX_POINTS, type Pt } from '../src/lib/routes/record';

// Gerade Strecke nach Osten in Bremen, Punkte alle ~1 m (wie GPS in kurzen Abständen), 1 km lang
const lat = 53.08;
const mPerDegLon = (Math.PI / 180) * 6371000 * Math.cos((lat * Math.PI) / 180);
const line = (meters: number, step = 1): Pt[] => Array.from({ length: Math.floor(meters / step) + 1 }, (_, i) => [8.8 + (i * step) / mPerDegLon, lat]);

describe('GPS-Routen (F-027)', () => {
	it('Länge und Abstand stimmen auf den Meter', () => {
		expect(Math.round(lengthM(line(1000)))).toBe(1000);
		expect(Math.round(distM([8.8, lat], [8.8 + 100 / mPerDegLon, lat]))).toBe(100);
	});

	it('Enden kürzen: 50 m Standard nimmt genau 50 m vorn und hinten weg; 0 m lässt alles', () => {
		const c = line(1000, 7);
		const t = trimEnds(c, 50, 50);
		expect(Math.round(distM(c[0], t[0]))).toBe(50);
		expect(Math.round(distM(c[c.length - 1], t[t.length - 1]))).toBe(50);
		expect(Math.round(lengthM(t))).toBe(Math.round(lengthM(c)) - 100);
		expect(trimEnds(c, 0, 0)).toEqual(c);
		expect(Math.round(distM(c[0], trimEnds(c, 200, 0)[0]))).toBe(200);
		expect(trimEnds(c, 600, 500)).toEqual([]); // zu kurz → nichts übrig
	});

	it('Vereinfachen: gerade Strecke → 2 Punkte; Ecken bleiben erhalten', () => {
		expect(simplify(line(1000), 3)).toHaveLength(2);
		const corner: Pt[] = [...line(300), ...Array.from({ length: 300 }, (_, i) => [8.8 + 300 / mPerDegLon, lat + (i + 1) / 111_200] as Pt)];
		const s = simplify(corner, 3);
		expect(s).toHaveLength(3);
		expect(Math.round(distM(s[1], corner[300]))).toBe(0);
	});

	it('Langer, zittriger Spaziergang → höchstens 480 Punkte, Länge bleibt fast gleich, Enden gekürzt', () => {
		// 8 km Schlangenlinie mit GPS-Zittern (± 4 m), Messung alle 2 m → gefiltert wie bei der Aufzeichnung
		const candidates: Pt[] = Array.from({ length: 4000 }, (_, i) => {
			const along = i * 2;
			const wiggle = Math.sin(i / 40) * 60 + Math.sin(i * 7.3) * 4;
			return [8.8 + along / mPerDegLon, lat + wiggle / 111_200];
		});
		// wie bei der echten Aufzeichnung: nur Punkte mit ≥ 5 m Bewegung
		const raw: Pt[] = [];
		for (const c of candidates) if (acceptFix(raw[raw.length - 1] ?? null, c, 8)) raw.push(c);
		const p = prepare(raw, 50, 50);
		expect(p.length).toBeLessThanOrEqual(MAX_POINTS);
		expect(p.length).toBeGreaterThan(20);
		// Glatte Strecke ohne Zittern als Vergleich: 50 m werden wirklich 50 m entlang des echten Wegs gekürzt
		const smooth: Pt[] = candidates.map((_, i) => [8.8 + (i * 2) / mPerDegLon, lat + (Math.sin(i / 40) * 60) / 111_200]);
		const want = lengthM(smooth) - 100;
		expect(Math.abs(lengthM(p) - want) / want).toBeLessThan(0.05);
		// Abstand des neuen Starts zum echten Start: wie bei der glatten Strecke nach 50 m
		const ref = trimEnds(smooth, 50, 50)[0];
		expect(distM(p[0], ref)).toBeLessThan(15); // im Rahmen der GPS-Genauigkeit
		// Schutz: der neue Start liegt nicht näher am echten Anfang (Haustür) als bei der glatten Strecke
		expect(distM(raw[0], p[0])).toBeGreaterThanOrEqual(distM(smooth[0], ref) - 5);
		expect(p.every(([lo, la]) => String(lo).split('.')[1]?.length <= 6 && String(la).split('.')[1]?.length <= 6)).toBe(true);
	});

	it('GPS-Punkte: ungenau oder Zittern wird verworfen', () => {
		const a: Pt = [8.8, lat];
		expect(acceptFix(null, a, 10)).toBe(true);
		expect(acceptFix(null, a, 80)).toBe(false);
		expect(acceptFix(a, [8.8 + 3 / mPerDegLon, lat], 5)).toBe(false);
		expect(acceptFix(a, [8.8 + 8 / mPerDegLon, lat], 5)).toBe(true);
		expect(acceptFix(a, [NaN, lat], 5)).toBe(false);
	});
});
