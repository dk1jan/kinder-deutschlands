// Wiederkehrende Termine (Teilmenge von RFC 5545) in deutscher Ortszeit – Sommer-/Winterzeit wird berücksichtigt:
// „jeden Samstag 10 Uhr“ bleibt 10 Uhr, auch nach der Zeitumstellung.
// Unterstützt: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY (wöchentlich: MO,TU…; monatlich: 1SA, -1SU …), COUNT, UNTIL.

const TZ = 'Europe/Berlin';
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
type Day = (typeof DAYS)[number];

export interface Rule {
	freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
	interval: number;
	byday: { day: Day; nth: number | null }[];
	count: number | null;
	until: Date | null;
}

export class RuleError extends Error {}

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

export interface Civil {
	y: number;
	m: number; // 1–12
	d: number;
	h: number;
	mi: number;
}

/** Ortszeit (Berlin) eines Zeitpunkts. */
export function berlinParts(t: Date): Civil {
	const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
	return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute) };
}

/** Zeitpunkt zu einer Ortszeit in Berlin (bei Lücken der Zeitumstellung: nächster gültiger Zeitpunkt). */
export function berlinToUtc(c: Civil): Date {
	const naive = Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi);
	let t = naive;
	for (let i = 0; i < 3; i++) {
		const p = berlinParts(new Date(t));
		const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - naive;
		if (diff === 0) break;
		t -= diff;
	}
	return new Date(t);
}

export const dateKey = (c: Pick<Civil, 'y' | 'm' | 'd'>) => `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
export const berlinDateKey = (t: Date) => dateKey(berlinParts(t));

/** Kalenderrechnung auf reinen Daten (ohne Zeitzone). */
function addDays(c: Civil, n: number): Civil {
	const t = new Date(Date.UTC(c.y, c.m - 1, c.d + n));
	return { ...c, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
const weekday = (c: Civil) => (new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7; // 0 = Montag
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function parseRule(raw: string): Rule {
	const parts = Object.fromEntries(
		raw
			.replace(/^RRULE:/i, '')
			.split(';')
			.filter(Boolean)
			.map((kv) => {
				const [k, v] = kv.split('=');
				return [k.trim().toUpperCase(), (v ?? '').trim().toUpperCase()];
			})
	);
	const allowed = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL', 'WKST']);
	for (const k of Object.keys(parts)) if (!allowed.has(k)) throw new RuleError(`Wiederholung „${k}“ wird nicht unterstützt.`);
	const freq = parts.FREQ;
	if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') throw new RuleError('Wiederholung: nur täglich, wöchentlich oder monatlich.');
	const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
	if (!Number.isInteger(interval) || interval < 1 || interval > 12) throw new RuleError('Ungültiger Abstand.');
	const byday = (parts.BYDAY ? parts.BYDAY.split(',') : []).map((b: string) => {
		const m = /^(-?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/.exec(b);
		if (!m) throw new RuleError('Ungültiger Wochentag.');
		const nth = m[1] ? Number(m[1]) : null;
		if (nth !== null && freq !== 'MONTHLY') throw new RuleError('„Erster/letzter Wochentag“ nur bei monatlicher Wiederholung.');
		return { day: m[2] as Day, nth };
	});
	if (freq === 'DAILY' && byday.length) throw new RuleError('Bei täglicher Wiederholung keine Wochentage angeben.');
	const count = parts.COUNT ? Number(parts.COUNT) : null;
	if (count !== null && (!Number.isInteger(count) || count < 1 || count > 500)) throw new RuleError('Anzahl 1–500.');
	let until: Date | null = null;
	if (parts.UNTIL) {
		const u = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(parts.UNTIL);
		if (!u) throw new RuleError('Ungültiges Ende der Wiederholung.');
		until = u[4]
			? u[7]
				? new Date(Date.UTC(+u[1], +u[2] - 1, +u[3], +u[4], +u[5], +u[6]))
				: berlinToUtc({ y: +u[1], m: +u[2], d: +u[3], h: +u[4], mi: +u[5] })
			: berlinToUtc({ y: +u[1], m: +u[2], d: +u[3], h: 23, mi: 59 });
	}
	return { freq, interval, byday, count, until };
}

export function ruleToString(r: Rule): string {
	const p = [`FREQ=${r.freq}`];
	if (r.interval > 1) p.push(`INTERVAL=${r.interval}`);
	if (r.byday.length) p.push(`BYDAY=${r.byday.map((b) => `${b.nth ?? ''}${b.day}`).join(',')}`);
	if (r.count) p.push(`COUNT=${r.count}`);
	if (r.until) p.push(`UNTIL=${r.until.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
	return p.join(';');
}

export interface Occurrence {
	date: string; // YYYY-MM-DD (Ortszeit)
	start: Date;
	end: Date | null;
	cancelled: boolean;
}

export interface Series {
	startsAt: Date;
	endsAt: Date | null;
	rrule: string | null;
	exdates: string[];
}

const MAX_YEARS = 3;

/** Alle Termine einer Serie, die das Zeitfenster [from, to) berühren. Einzelabsagen bleiben sichtbar (cancelled). */
export function expand(s: Series, from: Date, to: Date, limit = 400): Occurrence[] {
	const dur = s.endsAt ? s.endsAt.getTime() - s.startsAt.getTime() : 0;
	const ex = new Set(s.exdates);
	const mk = (c: Civil): Occurrence => {
		const start = berlinToUtc(c);
		return { date: dateKey(c), start, end: s.endsAt ? new Date(start.getTime() + dur) : null, cancelled: ex.has(dateKey(c)) };
	};
	const hits = (o: Occurrence) => (o.end ?? o.start).getTime() >= from.getTime() && o.start.getTime() < to.getTime();
	if (!s.rrule) {
		const o = mk(berlinParts(s.startsAt));
		return hits(o) ? [o] : [];
	}
	const r = parseRule(s.rrule);
	const base = berlinParts(s.startsAt);
	const hardEnd = new Date(Math.min(to.getTime(), s.startsAt.getTime() + MAX_YEARS * 366 * 86_400_000));
	const out: Occurrence[] = [];
	let n = 0;
	// Vergleich auf ganze Minuten: Startzeiten mit Sekunden (z. B. aus Kalender-Importen) dürfen den ersten Termin nicht verlieren
	const first = Math.floor(s.startsAt.getTime() / 60_000) * 60_000;
	const accept = (c: Civil): boolean => {
		// gibt false zurück, wenn die Serie zu Ende ist
		const o = mk(c);
		if (o.start.getTime() < first) return true;
		if (r.until && o.start.getTime() > r.until.getTime()) return false;
		if (o.start.getTime() >= hardEnd.getTime()) return false;
		n++;
		if (r.count && n > r.count) return false;
		if (hits(o)) out.push(o);
		return out.length < limit;
	};
	if (r.freq === 'DAILY') {
		for (let i = 0; i < 3000; i++) if (!accept(addDays(base, i * r.interval))) break;
	} else if (r.freq === 'WEEKLY') {
		const days = r.byday.length ? r.byday.map((b) => DAYS.indexOf(b.day)).sort((a, b) => a - b) : [weekday(base)];
		const monday = addDays(base, -weekday(base));
		outer: for (let w = 0; w < 1000; w++) {
			const wk = addDays(monday, w * 7 * r.interval);
			for (const d of days) if (!accept(addDays(wk, d))) break outer;
		}
	} else {
		outer: for (let mo = 0; mo < 400; mo++) {
			const total = base.m - 1 + mo * r.interval;
			const y = base.y + Math.floor(total / 12), m = (total % 12) + 1;
			const cands: Civil[] = [];
			if (!r.byday.length) {
				if (base.d <= daysInMonth(y, m)) cands.push({ ...base, y, m, d: base.d });
			} else {
				for (const b of r.byday) {
					const wd = DAYS.indexOf(b.day);
					const all: number[] = [];
					for (let d = 1; d <= daysInMonth(y, m); d++) if (weekday({ ...base, y, m, d }) === wd) all.push(d);
					const picks = b.nth === null ? all : [b.nth > 0 ? all[b.nth - 1] : all[all.length + b.nth]].filter((x) => x !== undefined);
					for (const d of picks) cands.push({ ...base, y, m, d });
				}
				cands.sort((a, b) => a.d - b.d);
			}
			for (const c of cands) if (!accept(c)) break outer;
		}
	}
	return out;
}

/** Ende der Serie (letzter Termin) oder null, wenn sie offen ist – für die Suche in der Datenbank. */
export function seriesUntil(s: Series): Date | null {
	if (!s.rrule) return s.endsAt ?? s.startsAt;
	const r = parseRule(s.rrule);
	if (!r.count && !r.until) return null;
	const all = expand(s, s.startsAt, new Date(s.startsAt.getTime() + MAX_YEARS * 366 * 86_400_000), 600);
	const last = all.at(-1);
	return last ? (last.end ?? last.start) : s.endsAt ?? s.startsAt;
}

/** Kurzbeschreibung für die Oberfläche, z. B. „jeden Samstag“, „jeden 1. Sonntag im Monat“. */
export function describeRule(raw: string | null): string | null {
	if (!raw) return null;
	let r: Rule;
	try {
		r = parseRule(raw);
	} catch {
		return null;
	}
	const NAMES: Record<Day, string> = { MO: 'Montag', TU: 'Dienstag', WE: 'Mittwoch', TH: 'Donnerstag', FR: 'Freitag', SA: 'Samstag', SU: 'Sonntag' };
	const every = r.interval === 1 ? 'jeden' : `alle ${r.interval}`;
	let text: string;
	if (r.freq === 'DAILY') text = r.interval === 1 ? 'täglich' : `alle ${r.interval} Tage`;
	else if (r.freq === 'WEEKLY') text = r.byday.length ? `${every} ${r.interval > 1 ? 'Wochen am ' : ''}${r.byday.map((b) => NAMES[b.day]).join(', ')}` : r.interval === 1 ? 'wöchentlich' : `alle ${r.interval} Wochen`;
	else if (r.byday.length) text = `jeden ${r.byday.map((b) => `${b.nth === -1 ? 'letzten ' : b.nth ? `${b.nth}. ` : ''}${NAMES[b.day]}`).join(', ')} im Monat`;
	else text = r.interval === 1 ? 'monatlich' : `alle ${r.interval} Monate`;
	if (r.until) text += ` bis ${r.until.toLocaleDateString('de-DE', { timeZone: TZ })}`;
	if (r.count) text += ` (${r.count}×)`;
	return text;
}
