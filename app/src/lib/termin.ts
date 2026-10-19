// Anzeige von Terminen (Ortszeit Deutschland) – Server und Browser.
const TZ = 'Europe/Berlin';
const D = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const DL = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const T = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const KEY = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const dayKey = (d: Date | string) => KEY.format(new Date(d));
export const time = (d: Date | string) => T.format(new Date(d));
export const dateShort = (d: Date | string) => D.format(new Date(d));
export const dateLong = (d: Date | string) => DL.format(new Date(d));

/** „Sa., 24. Okt. · 14:00–17:00 Uhr“, ganztägig/mehrtägig passend. */
export function when(start: Date | string, end: Date | string | null, allDay: boolean, long = false): string {
	const s = new Date(start);
	const e = end ? new Date(end) : null;
	const d = long ? dateLong(s) : dateShort(s);
	if (allDay) return e && dayKey(e) !== dayKey(s) ? `${d} – ${long ? dateLong(e) : dateShort(e)}` : `${d} · ganztägig`;
	if (!e) return `${d} · ${time(s)} Uhr`;
	if (dayKey(e) === dayKey(s)) return `${d} · ${time(s)}–${time(e)} Uhr`;
	return `${d}, ${time(s)} Uhr – ${long ? dateLong(e) : dateShort(e)}, ${time(e)} Uhr`;
}

export function dayHeading(key: string, todayKey: string, tomorrowKey: string): string {
	if (key === todayKey) return 'Heute';
	if (key === tomorrowKey) return 'Morgen';
	return dateLong(new Date(`${key}T12:00:00Z`));
}

export const ORIGIN_LABEL: Record<string, string> = {
	anbieter: 'Einrichtung',
	mitglied: 'Von einem Mitglied',
	redaktion: 'Redaktion',
	import: 'Aus einer Quelle'
};
