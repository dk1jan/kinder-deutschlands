// F-057: Regen in den nächsten 2 Stunden – Auswertung des Regenradars (DWD RV über Bright Sky), Zwischenspeicher, Ausfälle. Alles künstlich.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { levelOfRate, parseRadar, rainIn, regenAt, regenText, resetRegenCache, summarize } from '../src/lib/server/regen';

const T0 = new Date('2026-10-25T12:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
/** 25 Zeitscheiben ab T0; rain = Werte je Minute-Offset */
const series = (rain: Record<number, number>) => Array.from({ length: 25 }, (_, i) => ({ at: at(i * 5), v: rain[i * 5] ?? 0 }));
const body = (rain: Record<number, number>) => ({
	radar: series(rain).map((s) => ({ timestamp: s.at.toISOString(), source: 'RADARCOMP::RV::x', precipitation_5: [[0, s.v, 0], [0, 0, 0], [null, 0, 0]] })),
	geometry: { type: 'Polygon', coordinates: [] },
	bbox: [1, 2, 3, 4]
});
const ok = (b: unknown) => vi.fn(async () => new Response(JSON.stringify(b), { status: 200 })) as unknown as typeof fetch;

describe('Regen: Stufen und Auswertung (F-057)', () => {
	beforeEach(() => resetRegenCache());

	it('Stufen nach 0,01 mm je 5 Minuten', () => {
		expect([0, 4, 5, 20, 21, 83, 84, 500, -1, NaN].map(levelOfRate)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 0, 0]);
	});

	it('kein Regen: keine Meldung, aber Zeitreihe da', () => {
		const r = summarize(series({}), T0)!;
		expect(r.beginsAt).toBeNull();
		expect(r.endsAt).toBeNull();
		expect(r.peak).toBe(0);
		expect(r.steps).toHaveLength(25);
		expect(regenText(r)).toBeNull();
	});

	it('Regen beginnt in 25 Minuten und hört nach zwei trockenen Zeitscheiben auf', () => {
		const r = summarize(series({ 25: 30, 30: 10, 35: 0, 40: 12, 45: 0, 50: 0 }), T0)!;
		expect(r.now).toBe(0);
		expect(r.beginsAt).toBe(at(25).toISOString());
		expect(r.endsAt).toBe(at(45).toISOString()); // eine einzelne trockene Scheibe (35) beendet den Regen nicht
		expect(r.peak).toBe(2);
		expect(regenText(r)).toMatch(/^Mäßiger Regen ab ca\. \d\d:\d\d Uhr erwartet, bis ca\. \d\d:\d\d Uhr\.$/);
	});

	it('es regnet schon und bis zum Ende der Vorhersage', () => {
		const rain = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i * 5, 8]));
		const r = summarize(series(rain), T0)!;
		expect(r.now).toBe(1);
		expect(r.endsAt).toBeNull();
		expect(regenText(r)).toMatch(/^Es regnet gerade \(leichter Regen\) – mindestens bis ca\. \d\d:\d\d Uhr\.$/);
	});

	it('vergangene Zeitscheiben (älter als eine Scheibe) fallen weg', () => {
		const r = summarize(series({ 0: 50, 5: 0 }), new Date(T0.getTime() + 12 * 60_000))!;
		expect(r.steps[0].at).toBe(at(10).toISOString());
		expect(r.beginsAt).toBeNull();
		expect(summarize(series({}), new Date(T0.getTime() + 3 * 3600_000))).toBeNull();
	});

	it('rainIn: nur Regen im Zeitfenster', () => {
		const r = summarize(series({ 40: 30 }), T0)!;
		expect(rainIn(r, at(0), at(30))).toBeNull();
		expect(rainIn(r, at(0), at(60))).toEqual({ at: at(40).toISOString(), level: 2 });
		expect(rainIn(r, at(50), at(60))).toBeNull();
	});

	it('Antwort lesen: höchster Wert im Raster, Lücken (null) ignoriert, Unsinn → null', () => {
		const p = parseRadar(body({ 10: 7 }))!;
		expect(p).toHaveLength(25);
		expect(p[2].v).toBe(7);
		expect(parseRadar({ radar: [{ timestamp: 'kaputt', precipitation_5: [[1]] }, { timestamp: at(0).toISOString(), precipitation_5: [[null]] }] })).toBeNull();
		expect(parseRadar({})).toBeNull();
		expect(parseRadar(null)).toBeNull();
	});
});

describe('Regen: Abruf (F-057)', () => {
	beforeEach(() => resetRegenCache());

	it('fragt gerundeten Punkt ab, nutzt den Zwischenspeicher, sendet kein Konto', async () => {
		const f = ok(body({ 20: 30 }));
		const a = await regenAt(53.0749, 8.8071, { fetchImpl: f, now: T0 });
		expect(a?.beginsAt).toBe(at(20).toISOString());
		const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
		expect(url).toBe('https://api.brightsky.dev/radar?lat=53.07&lon=8.81&distance=1000&format=plain');
		expect(JSON.stringify(init.headers)).not.toMatch(/cookie|authorization/i);
		await regenAt(53.0701, 8.8099, { fetchImpl: f, now: T0 }); // gleicher gerundeter Punkt
		expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
		await regenAt(53.2, 8.8, { fetchImpl: f, now: T0 });
		expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
	});

	it('Ausfall (HTTP-Fehler, Netz, Unsinn) → null, kein Absturz, Fehler kurz gemerkt', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const bad = vi.fn(async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
		expect(await regenAt(50.1, 8.1, { fetchImpl: bad, now: T0 })).toBeNull();
		expect(await regenAt(50.1, 8.1, { fetchImpl: bad, now: T0 })).toBeNull();
		expect((bad as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1); // nicht bei jedem Aufruf neu versuchen
		const down = vi.fn(async () => { throw new Error('Netz weg'); }) as unknown as typeof fetch;
		expect(await regenAt(50.2, 8.1, { fetchImpl: down, now: T0 })).toBeNull();
		expect(await regenAt(50.3, 8.1, { fetchImpl: ok({ unsinn: true }), now: T0 })).toBeNull();
		warn.mockRestore();
	});

	it('Punkte außerhalb Deutschlands werden gar nicht abgefragt', async () => {
		const f = ok(body({}));
		expect(await regenAt(0, 0, { fetchImpl: f })).toBeNull();
		expect(await regenAt(NaN, 8, { fetchImpl: f })).toBeNull();
		expect(await regenAt(40.4, -3.7, { fetchImpl: f })).toBeNull();
		expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
	});

	it('BRIGHTSKY_URL erlaubt eigenen Betrieb', async () => {
		process.env.BRIGHTSKY_URL = 'http://127.0.0.1:5000/';
		const f = ok(body({}));
		await regenAt(52.5, 13.4, { fetchImpl: f, now: T0 });
		expect((f as unknown as { mock: { calls: [string][] } }).mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:5000\/radar\?/);
		delete process.env.BRIGHTSKY_URL;
	});
});
