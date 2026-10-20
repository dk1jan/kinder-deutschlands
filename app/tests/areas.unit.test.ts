import { describe, expect, it } from 'vitest';
import { AREAS, GROUPS, areaHref, areasOf, groupOf, inArea } from '../src/lib/areas';

// F-016: Menü mit Gruppen Entdecken · Community · Wissen
describe('Bereiche und Menügruppen', () => {
	it('jeder Bereich gehört zu genau einer bekannten Gruppe, keiner fehlt', () => {
		const ids = GROUPS.map((g) => g.id);
		expect(ids).toEqual(['entdecken', 'community', 'wissen']);
		for (const a of AREAS) expect(ids).toContain(a.group);
		expect(GROUPS.flatMap((g) => areasOf(g.id)).length).toBe(AREAS.length);
		expect(new Set(AREAS.map((a) => a.href)).size).toBe(AREAS.length);
	});

	it('Entdecken = Startseite, kein eigener Punkt „Startseite“', () => {
		expect(GROUPS[0].href).toBe('/');
		expect(AREAS.some((a) => a.href === '/' || /startseite/i.test(a.label))).toBe(false);
	});

	it('ordnet Pfade der richtigen Gruppe zu', () => {
		expect(groupOf('/')).toBe('entdecken');
		expect(groupOf('/veranstaltungen/heute')).toBe('entdecken');
		expect(groupOf('/veranstaltungen/123')).toBe('entdecken');
		expect(groupOf('/community')).toBe('community');
		expect(groupOf('/community/gruppe/x')).toBe('community');
		expect(groupOf('/marktplatz/neu')).toBe('community');
		expect(groupOf('/nachrichten/treffen/neu')).toBe('community');
		expect(groupOf('/kompass/geburt')).toBe('wissen');
		expect(groupOf('/radar')).toBe('wissen');
		expect(groupOf('/karte')).toBeNull();
		expect(groupOf('/nachrichten')).toBeNull();
		expect(groupOf('/routenplaner')).toBeNull();
		expect(inArea('/mehr')).toBe(true);
		expect(inArea('/profil')).toBe(false);
	});

	it('Mitgliederbereiche führen Gäste zur Anmeldung', () => {
		const markt = AREAS.find((a) => a.href === '/marktplatz')!;
		expect(areaHref(markt, false)).toBe('/anmelden?weiter=%2Fmarktplatz');
		expect(areaHref(markt, true)).toBe('/marktplatz');
		const routen = AREAS.find((a) => a.href === '/routen')!;
		expect(areaHref(routen, false)).toBe('/routen');
	});
});
