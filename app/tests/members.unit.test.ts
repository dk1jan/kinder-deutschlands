import { describe, expect, it } from 'vitest';
import { formatContactId, generateContactId, normalizeContactId, ALPHABET } from '../src/lib/server/contactid';
import { canSee, cardFor, PRESETS, sanitizeVisibility, type ProfileRow } from '../src/lib/visibility';

describe('Familien-ID', () => {
	it('hat 9 Zeichen aus dem Alphabet und ist selbst gültig', () => {
		for (let i = 0; i < 500; i++) {
			const id = generateContactId();
			expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{9}$/);
			expect(normalizeContactId(id)).toBe(id);
		}
	});
	it('ist nicht fortlaufend (keine Wiederholung in 5000 Ziehungen)', () => {
		const set = new Set(Array.from({ length: 5000 }, generateContactId));
		expect(set.size).toBe(5000);
	});
	it('toleriert Schreibweise, Bindestriche, O/0 und I/L/1', () => {
		const id = generateContactId();
		const pretty = formatContactId(id).toLowerCase();
		expect(normalizeContactId(pretty)).toBe(id);
		expect(normalizeContactId(` ${pretty.replace(/-/g, ' ')} `)).toBe(id);
		const withO = id.replace(/0/g, 'O').replace(/1/g, 'l');
		expect(normalizeContactId(withO)).toBe(id);
	});
	it('erkennt Tippfehler über das Prüfzeichen', () => {
		let caught = 0;
		for (let i = 0; i < 300; i++) {
			const id = generateContactId();
			const pos = i % 8;
			const wrong = ALPHABET[(ALPHABET.indexOf(id[pos]) + 1 + (i % 31)) % 32];
			const typo = id.slice(0, pos) + wrong + id.slice(pos + 1);
			if (normalizeContactId(typo) === null) caught++;
		}
		// Ein einzelnes falsches Zeichen wird fast immer erkannt
		expect(caught).toBeGreaterThan(280);
	});
	it('lehnt Unsinn ab', () => {
		expect(normalizeContactId('')).toBeNull();
		expect(normalizeContactId('12345')).toBeNull();
		expect(normalizeContactId('UUUUUUUUU')).toBeNull();
		expect(normalizeContactId("'; drop table--")).toBeNull();
	});
});

describe('Sichtbarkeit', () => {
	const profile: ProfileRow = {
		contact_id: 'ABCDEFGH0',
		display_name: 'Mia',
		can_help: 'Kita-Anträge',
		looking_for: 'Spielplatzbekanntschaften',
		interests: ['Radfahren'],
		child_ages: ['1-3'],
		region_name: 'Bremen (Stadt)',
		visibility: PRESETS.zurueckhaltend
	};
	it('Rangfolge extern < mitglied < kontakt < selbst', () => {
		expect(canSee('extern', 'alle')).toBe(true);
		expect(canSee('extern', 'mitglieder')).toBe(false);
		expect(canSee('mitglied', 'mitglieder')).toBe(true);
		expect(canSee('mitglied', 'kontakte')).toBe(false);
		expect(canSee('kontakt', 'kontakte')).toBe(true);
		expect(canSee('kontakt', 'niemand')).toBe(false);
		expect(canSee('selbst', 'niemand')).toBe(true);
		// Stufe „Mitglieder meiner Gruppen“ liegt zwischen Mitgliedern und Kontakten
		expect(canSee('mitglied', 'gruppen')).toBe(false);
		expect(canSee('gruppe', 'gruppen')).toBe(true);
		expect(canSee('gruppe', 'kontakte')).toBe(false);
		expect(canSee('kontakt', 'gruppen')).toBe(true);
		expect(canSee('extern', 'gruppen')).toBe(false);
		expect(canSee('selbst', undefined)).toBe(true);
		expect(canSee('kontakt', undefined)).toBe(false);
	});
	it('Zurückhaltend: Externe sehen nur die ID', () => {
		const c = cardFor(profile, 'extern');
		expect(c).toEqual({ contactId: 'ABCDEFGH0', displayName: null, canHelp: null, lookingFor: null, interests: [], childAges: [], regionName: null });
	});
	it('Zurückhaltend: Mitglieder sehen den Namen, Kontakte alles', () => {
		expect(cardFor(profile, 'mitglied').displayName).toBe('Mia');
		expect(cardFor(profile, 'mitglied').canHelp).toBeNull();
		expect(cardFor(profile, 'kontakt')).toMatchObject({ canHelp: 'Kita-Anträge', childAges: ['1-3'], regionName: 'Bremen (Stadt)' });
	});
	it('Offen: Altersgruppen bleiben bei Kontakten', () => {
		const p = { ...profile, visibility: PRESETS.offen };
		expect(cardFor(p, 'extern').displayName).toBe('Mia');
		expect(cardFor(p, 'mitglied').childAges).toEqual([]);
	});
	it('Ungültige Formularwerte fallen auf sichere Vorgabe zurück', () => {
		const v = sanitizeVisibility({ display_name: 'alle', can_help: 'jeder', __proto__: 'x' } as never, PRESETS.zurueckhaltend);
		expect(v.display_name).toBe('alle');
		expect(v.can_help).toBe('kontakte');
	});
});
