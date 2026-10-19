import { describe, expect, it } from 'vitest';
import { berlinParts, berlinToUtc, describeRule, expand, parseRule, seriesUntil, RuleError } from '../src/lib/server/angebote/recurrence';
import { buildIcs, parseIcs } from '../src/lib/server/angebote/ics';
import { ageMatches, ageLabel } from '../src/lib/angebote';

const B = (y: number, m: number, d: number, h = 10, mi = 0) => berlinToUtc({ y, m, d, h, mi });

describe('Ortszeit Berlin', () => {
	it('Sommer- und Winterzeit', () => {
		expect(B(2026, 7, 1, 10).toISOString()).toBe('2026-07-01T08:00:00.000Z');
		expect(B(2026, 12, 1, 10).toISOString()).toBe('2026-12-01T09:00:00.000Z');
		expect(berlinParts(new Date('2026-10-25T09:00:00Z'))).toMatchObject({ d: 25, h: 10 });
	});
});

describe('Wiederholungen', () => {
	it('jeden Samstag 10 Uhr bleibt 10 Uhr über die Zeitumstellung (25.10.2026)', () => {
		const occ = expand({ startsAt: B(2026, 10, 17), endsAt: B(2026, 10, 17, 12), rrule: 'FREQ=WEEKLY', exdates: [] }, B(2026, 10, 1), B(2026, 11, 8));
		expect(occ.map((o) => o.date)).toEqual(['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07']);
		expect(occ.map((o) => berlinParts(o.start).h)).toEqual([10, 10, 10, 10]);
		expect(occ[2].end!.getTime() - occ[2].start.getTime()).toBe(2 * 3600_000);
	});
	it('Einzelabsage bleibt als „abgesagt“ sichtbar', () => {
		const occ = expand({ startsAt: B(2026, 10, 17), endsAt: null, rrule: 'FREQ=WEEKLY;COUNT=3', exdates: ['2026-10-24'] }, B(2026, 10, 1), B(2027, 1, 1));
		expect(occ.map((o) => [o.date, o.cancelled])).toEqual([['2026-10-17', false], ['2026-10-24', true], ['2026-10-31', false]]);
	});
	it('mehrere Wochentage, Abstand 2 Wochen, bis Datum', () => {
		const occ = expand({ startsAt: B(2026, 10, 19, 9), endsAt: null, rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261115', exdates: [] }, B(2026, 10, 1), B(2027, 1, 1));
		expect(occ.map((o) => o.date)).toEqual(['2026-10-19', '2026-10-22', '2026-11-02', '2026-11-05']);
	});
	it('jeden 1. Samstag und letzten Sonntag im Monat', () => {
		const a = expand({ startsAt: B(2026, 11, 7), endsAt: null, rrule: 'FREQ=MONTHLY;BYDAY=1SA;COUNT=3', exdates: [] }, B(2026, 1, 1), B(2028, 1, 1));
		expect(a.map((o) => o.date)).toEqual(['2026-11-07', '2026-12-05', '2027-01-02']);
		const b = expand({ startsAt: B(2026, 10, 25), endsAt: null, rrule: 'FREQ=MONTHLY;BYDAY=-1SU;COUNT=2', exdates: [] }, B(2026, 1, 1), B(2028, 1, 1));
		expect(b.map((o) => o.date)).toEqual(['2026-10-25', '2026-11-29']);
	});
	it('monatlich am 31. überspringt kurze Monate', () => {
		const a = expand({ startsAt: B(2026, 1, 31), endsAt: null, rrule: 'FREQ=MONTHLY;COUNT=3', exdates: [] }, B(2026, 1, 1), B(2027, 1, 1));
		expect(a.map((o) => o.date)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
	});
	it('Zeitfenster und Serienende', () => {
		const s = { startsAt: B(2026, 10, 1), endsAt: null, rrule: 'FREQ=DAILY;COUNT=10', exdates: [] };
		expect(expand(s, B(2026, 10, 5, 0), B(2026, 10, 7, 0)).map((o) => o.date)).toEqual(['2026-10-05', '2026-10-06']);
		expect(seriesUntil(s)!.toISOString()).toBe(B(2026, 10, 10).toISOString());
		expect(seriesUntil({ ...s, rrule: 'FREQ=WEEKLY' })).toBeNull();
	});
	it('ungültige Regeln werden abgelehnt', () => {
		expect(() => parseRule('FREQ=YEARLY')).toThrow(RuleError);
		expect(() => parseRule('FREQ=WEEKLY;BYSETPOS=1')).toThrow(RuleError);
		expect(() => parseRule('FREQ=WEEKLY;BYDAY=1SA')).toThrow(RuleError);
		expect(() => parseRule('FREQ=DAILY;COUNT=9999')).toThrow(RuleError);
	});
	it('verständliche Beschreibung', () => {
		expect(describeRule('FREQ=WEEKLY;BYDAY=SA')).toBe('jeden Samstag');
		expect(describeRule('FREQ=MONTHLY;BYDAY=1SA')).toBe('jeden 1. Samstag im Monat');
		expect(describeRule('FREQ=MONTHLY;BYDAY=-1SU')).toBe('jeden letzten Sonntag im Monat');
		expect(describeRule('FREQ=DAILY;COUNT=5')).toBe('täglich (5×)');
	});
});

describe('Kalenderdateien', () => {
	const ev = { uid: 'e1@kinder-deutschlands', title: 'Kinderflohmarkt; Findorff, Halle', description: 'Zeile 1\nZeile 2', location: 'Bürgerhaus', start: B(2026, 10, 24, 10), end: B(2026, 10, 24, 14), allDay: false, rrule: 'FREQ=WEEKLY;COUNT=4', exdates: ['2026-10-31'], url: 'https://kinder.example.org/veranstaltungen/e1' };
	it('Export mit Zeitzone, Maskierung, Zeilenfaltung', () => {
		const ics = buildIcs([ev, { ...ev, uid: 'e2', title: 'Ä'.repeat(60), rrule: null, exdates: [] }]);
		expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin');
		expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261024T100000');
		expect(ics).toContain('SUMMARY:Kinderflohmarkt\\; Findorff\\, Halle');
		expect(ics).toContain('DESCRIPTION:Zeile 1\\nZeile 2');
		expect(ics).toContain('EXDATE;TZID=Europe/Berlin:20261031T100000');
		for (const l of ics.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
	});
	it('Hin und zurück', () => {
		const back = parseIcs(buildIcs([ev]));
		expect(back).toHaveLength(1);
		expect(back[0]).toMatchObject({ uid: ev.uid, title: ev.title, description: ev.description, location: 'Bürgerhaus', rrule: 'FREQ=WEEKLY;COUNT=4', exdates: ['2026-10-31'], allDay: false });
		expect(back[0].start.toISOString()).toBe(ev.start.toISOString());
		expect(back[0].end!.toISOString()).toBe(ev.end.toISOString());
	});
	it('Import: ganztägig, UTC, Absage, nicht unterstützte Wiederholung, VALARM ignoriert', () => {
		const raw = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Ferienprogramm', 'DTSTART;VALUE=DATE:20261026', 'DTEND;VALUE=DATE:20261031', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'SUMMARY:nicht dies', 'END:VALARM', 'END:VEVENT',
			'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Kurs', 'DTSTART:20261020T150000Z', 'DURATION:PT1H30M', 'STATUS:CANCELLED', 'RRULE:FREQ=YEARLY', 'END:VEVENT',
			'BEGIN:VEVENT', 'UID:c', 'DTSTART:20261020T150000Z', 'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');
		const p = parseIcs(raw);
		expect(p.map((x) => x.uid)).toEqual(['a', 'b']);
		expect(p[0]).toMatchObject({ allDay: true, title: 'Ferienprogramm' });
		expect(berlinParts(p[0].end!)).toMatchObject({ d: 30 });
		expect(p[1]).toMatchObject({ cancelled: true, rrule: null });
		expect(p[1].rruleNote).toBeTruthy();
		expect(p[1].end!.getTime() - p[1].start.getTime()).toBe(90 * 60_000);
	});
});

describe('Alter', () => {
	it('Bezeichnung und Filter', () => {
		expect(ageLabel(3, 6)).toBe('3–6 Jahre');
		expect(ageLabel(null, null)).toBeNull();
		expect(ageMatches(0, 3, ['3-6'])).toBe(true);
		expect(ageMatches(7, 10, ['0-1', '1-3'])).toBe(false);
		expect(ageMatches(null, null, ['1-3'])).toBe(true);
	});
});
