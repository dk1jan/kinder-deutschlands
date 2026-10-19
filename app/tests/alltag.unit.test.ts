import { describe, expect, it } from 'vitest';
import { mentionsChildcare, mentionsCrisis } from '../src/lib/server/alltag/help';
import { parseEuro } from '../src/lib/server/alltag/forms';
import { euro, priceLabel } from '../src/lib/alltag';

describe('Familien helfen Familien', () => {
	it('erkennt Vermittlung von Kinderbetreuung durch Fremde', () => {
		for (const t of ['Babysitter gesucht', 'Kann auf eure Kinder aufpassen', 'Wer passt auf meine Tochter auf? Kinder hüten am Freitag', 'Suche Leihoma', 'Biete Kinderbetreuung privat', 'Nanny für Montag'])
			expect(mentionsChildcare(t), t).toBe(true);
		for (const t of ['Hilfe beim Elterngeldantrag', 'Wie finde ich einen Kita-Platz?', 'Babykleidung abzugeben', 'Antrag auf Kinderzuschlag'])
			expect(mentionsChildcare(t), t).toBe(false);
	});
	it('zeigt bei Krisenwörtern die offiziellen Nummern', () => {
		expect(mentionsCrisis('Ich habe keine Kraft mehr')).toBe(true);
		expect(mentionsCrisis('Suche Winterjacke')).toBe(false);
	});
});

describe('Marktplatz', () => {
	it('Preise', () => {
		expect(parseEuro('12,50 €')).toBe(1250);
		expect(parseEuro('1.200')).toBe(120000);
		expect(parseEuro('')).toBeNull();
		expect(() => parseEuro('zwölf')).toThrow();
		expect(priceLabel('verschenken', 500, false)).toBe('zu verschenken');
		expect(priceLabel('verkaufen', null, true)).toBe('Preis VB');
		expect(priceLabel('verkaufen', 1500, false)).toBe(euro(1500));
	});
});
