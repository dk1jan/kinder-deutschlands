// Kalenderdateien (iCalendar, RFC 5545): Export einzelner Termine/Serien und persönlicher Merklisten-Feed,
// Import aus ICS-Quellen von Anbietern (nur mit bestätigtem Nutzungsrecht).
import { berlinParts, berlinToUtc, parseRule, ruleToString, RuleError } from './recurrence';

const VTIMEZONE = [
	'BEGIN:VTIMEZONE',
	'TZID:Europe/Berlin',
	'BEGIN:DAYLIGHT',
	'TZOFFSETFROM:+0100',
	'TZOFFSETTO:+0200',
	'TZNAME:CEST',
	'DTSTART:19700329T020000',
	'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
	'END:DAYLIGHT',
	'BEGIN:STANDARD',
	'TZOFFSETFROM:+0200',
	'TZOFFSETTO:+0100',
	'TZNAME:CET',
	'DTSTART:19701025T030000',
	'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
	'END:STANDARD',
	'END:VTIMEZONE'
];

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const local = (d: Date) => {
	const c = berlinParts(d);
	return `${c.y}${pad(c.m)}${pad(c.d)}T${pad(c.h)}${pad(c.mi)}00`;
};
const dateOnly = (d: Date) => {
	const c = berlinParts(d);
	return `${c.y}${pad(c.m)}${pad(c.d)}`;
};

/** Zeilen auf 75 Oktette falten (RFC 5545 3.1), UTF-8-sicher. */
function fold(line: string): string {
	const enc = new TextEncoder();
	if (enc.encode(line).length <= 75) return line;
	const out: string[] = [];
	let cur = '';
	for (const ch of line) {
		if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
			out.push(cur);
			cur = '';
		}
		cur += ch;
	}
	out.push(cur);
	return out.join('\r\n ');
}

export interface IcsEvent {
	uid: string;
	title: string;
	description?: string;
	location?: string;
	url?: string;
	start: Date;
	end: Date | null;
	allDay: boolean;
	rrule?: string | null;
	exdates?: string[];
	cancelled?: boolean;
	updated?: Date;
	lat?: number | null;
	lon?: number | null;
}

export function buildIcs(events: IcsEvent[], calName = 'Kinder Deutschlands'): string {
	const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kinder Deutschlands//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(calName)}`, 'X-WR-TIMEZONE:Europe/Berlin', ...VTIMEZONE];
	const now = utc(new Date());
	for (const e of events) {
		lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${now}`);
		if (e.allDay) {
			lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.start)}`);
			const endDay = new Date((e.end ?? e.start).getTime() + 86_400_000);
			lines.push(`DTEND;VALUE=DATE:${dateOnly(endDay)}`);
		} else {
			lines.push(`DTSTART;TZID=Europe/Berlin:${local(e.start)}`);
			lines.push(`DTEND;TZID=Europe/Berlin:${local(e.end ?? new Date(e.start.getTime() + 3600_000))}`);
		}
		if (e.rrule) lines.push(`RRULE:${e.rrule}`);
		for (const x of e.exdates ?? []) {
			const [y, m, d] = x.split('-').map(Number);
			const sp = berlinParts(e.start);
			lines.push(e.allDay ? `EXDATE;VALUE=DATE:${x.replace(/-/g, '')}` : `EXDATE;TZID=Europe/Berlin:${local(berlinToUtc({ y, m, d, h: sp.h, mi: sp.mi }))}`);
		}
		lines.push(`SUMMARY:${esc(e.title)}`);
		if (e.description) lines.push(`DESCRIPTION:${esc(e.description.slice(0, 3000))}`);
		if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
		if (e.lat != null && e.lon != null) lines.push(`GEO:${e.lat.toFixed(6)};${e.lon.toFixed(6)}`);
		if (e.url) lines.push(`URL:${e.url}`);
		if (e.cancelled) lines.push('STATUS:CANCELLED');
		if (e.updated) lines.push(`LAST-MODIFIED:${utc(e.updated)}`);
		lines.push('END:VEVENT');
	}
	lines.push('END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------- Import ----------
export interface ParsedEvent {
	uid: string;
	title: string;
	description: string;
	location: string;
	url: string | null;
	start: Date;
	end: Date | null;
	allDay: boolean;
	rrule: string | null;
	rruleNote: string | null;
	exdates: string[];
	cancelled: boolean;
	lat: number | null;
	lon: number | null;
}

const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

interface Prop {
	name: string;
	params: Record<string, string>;
	value: string;
}

function parseLine(line: string): Prop | null {
	// Name;PARAM=…;PARAM="…":Wert
	let i = 0, inQ = false;
	for (; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') inQ = !inQ;
		else if (ch === ':' && !inQ) break;
	}
	if (i >= line.length) return null;
	const head = line.slice(0, i), value = line.slice(i + 1);
	const [name, ...ps] = head.split(';');
	const params: Record<string, string> = {};
	for (const p of ps) {
		const [k, v] = p.split('=');
		if (k) params[k.toUpperCase()] = (v ?? '').replace(/^"|"$/g, '');
	}
	return { name: name.toUpperCase(), params, value };
}

const TZ_ALIASES = new Set(['Europe/Berlin', 'W. Europe Standard Time', 'Europe/Amsterdam', 'Europe/Paris', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Brussels', 'Europe/Copenhagen', 'CET', 'Mitteleuropäische Zeit']);

function parseDate(p: Prop): { date: Date; allDay: boolean } | null {
	const v = p.value.trim();
	const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
	if (!m) return null;
	const [, y, mo, d, h, mi, , z] = m;
	if (!h || p.params.VALUE === 'DATE') return { date: berlinToUtc({ y: +y, m: +mo, d: +d, h: 0, mi: 0 }), allDay: true };
	if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, Number(m[6] ?? 0))), allDay: false };
	const tz = p.params.TZID;
	// Ortszeit ohne Zone oder mitteleuropäische Zonen → Berliner Zeit; andere Zonen über Intl umrechnen
	if (!tz || TZ_ALIASES.has(tz)) return { date: berlinToUtc({ y: +y, m: +mo, d: +d, h: +h, mi: +mi }), allDay: false };
	try {
		const naive = Date.UTC(+y, +mo - 1, +d, +h, +mi);
		const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
		let t = naive;
		for (let k = 0; k < 3; k++) {
			const q = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
			const diff = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute) - naive;
			if (!diff) break;
			t -= diff;
		}
		return { date: new Date(t), allDay: false };
	} catch {
		return { date: berlinToUtc({ y: +y, m: +mo, d: +d, h: +h, mi: +mi }), allDay: false };
	}
}

/** Liest VEVENTs. Nicht unterstützte Wiederholungen werden nicht erfunden: dann nur der erste Termin (mit Hinweis). */
export function parseIcs(text: string, maxEvents = 3000): ParsedEvent[] {
	const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
	const out: ParsedEvent[] = [];
	let cur: Prop[] | null = null;
	let depth = 0;
	for (const line of lines) {
		if (line === 'BEGIN:VEVENT') {
			cur = [];
			depth = 0;
			continue;
		}
		if (!cur) continue;
		if (/^BEGIN:/.test(line)) {
			depth++;
			continue;
		}
		if (/^END:/.test(line) && line !== 'END:VEVENT') {
			depth--;
			continue;
		}
		if (line === 'END:VEVENT') {
			const ev = toEvent(cur);
			if (ev) out.push(ev);
			cur = null;
			if (out.length >= maxEvents) break;
			continue;
		}
		if (depth > 0) continue; // z. B. VALARM
		const p = parseLine(line);
		if (p) cur.push(p);
	}
	return out;
}

function toEvent(props: Prop[]): ParsedEvent | null {
	const get = (n: string) => props.find((p) => p.name === n);
	const uid = get('UID')?.value.trim();
	const ds = get('DTSTART');
	const title = unesc(get('SUMMARY')?.value ?? '').trim();
	if (!uid || !ds || !title) return null;
	const s = parseDate(ds);
	if (!s) return null;
	let end: Date | null = null;
	const de = get('DTEND');
	if (de) {
		const e = parseDate(de);
		if (e) end = s.allDay ? new Date(e.date.getTime() - 86_400_000) : e.date;
	} else if (get('DURATION')) {
		const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(get('DURATION')!.value.trim());
		if (m) end = new Date(s.date.getTime() + ((+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 60_000);
	}
	if (end && end.getTime() < s.date.getTime()) end = null;
	let rrule: string | null = null, rruleNote: string | null = null;
	const rr = get('RRULE')?.value;
	if (rr) {
		try {
			rrule = ruleToString(parseRule(rr));
		} catch (e) {
			rruleNote = e instanceof RuleError ? e.message : 'Wiederholung nicht lesbar';
		}
	}
	const exdates: string[] = [];
	for (const p of props.filter((x) => x.name === 'EXDATE')) {
		for (const v of p.value.split(',')) {
			const d = parseDate({ ...p, value: v });
			if (d) {
				const c = berlinParts(d.date);
				exdates.push(`${c.y}-${pad(c.m)}-${pad(c.d)}`);
			}
		}
	}
	const geo = get('GEO')?.value.split(/[;,]/).map(Number);
	const url = get('URL')?.value.trim() ?? null;
	return {
		uid: uid.slice(0, 250),
		title: title.slice(0, 160),
		description: unesc(get('DESCRIPTION')?.value ?? '').trim().slice(0, 8000),
		location: unesc(get('LOCATION')?.value ?? '').trim().slice(0, 300),
		url: url && /^https?:\/\//.test(url) ? url.slice(0, 500) : null,
		start: s.date,
		end,
		allDay: s.allDay,
		rrule,
		rruleNote,
		exdates,
		cancelled: (get('STATUS')?.value ?? '').toUpperCase() === 'CANCELLED',
		lat: geo && geo.length === 2 && geo.every(Number.isFinite) ? geo[0] : null,
		lon: geo && geo.length === 2 && geo.every(Number.isFinite) ? geo[1] : null
	};
}
