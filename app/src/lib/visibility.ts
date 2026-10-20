// Sichtbarkeit von Profilangaben. Reine Logik – wird auf dem Server angewendet, die Oberfläche zeigt nur an.
// Wer sieht etwas? extern (QR-Scan ohne Anmeldung) < mitglied < gruppe (gemeinsame Gruppe, D-063) < kontakt < selbst.

export type Relation = 'extern' | 'mitglied' | 'gruppe' | 'kontakt' | 'selbst';
export type Level = 'alle' | 'mitglieder' | 'gruppen' | 'kontakte' | 'niemand';
export type Field = 'display_name' | 'can_help' | 'looking_for' | 'interests' | 'child_ages' | 'region';
export type Visibility = Record<Field, Level>;
export type Preset = 'zurueckhaltend' | 'offen' | 'individuell';

export const FIELDS: { key: Field; label: string }[] = [
	{ key: 'display_name', label: 'Anzeigename' },
	{ key: 'can_help', label: 'Ich kann helfen' },
	{ key: 'looking_for', label: 'Ich suche' },
	{ key: 'interests', label: 'Interessen' },
	{ key: 'child_ages', label: 'Altersgruppen der Kinder' },
	{ key: 'region', label: 'Region' }
];

export const LEVELS: { key: Level; label: string }[] = [
	{ key: 'alle', label: 'Alle, auch ohne Konto' },
	{ key: 'mitglieder', label: 'Angemeldete Mitglieder' },
	{ key: 'gruppen', label: 'Mitglieder meiner Gruppen' },
	{ key: 'kontakte', label: 'Nur bestätigte Kontakte' },
	{ key: 'niemand', label: 'Nur ich' }
];

export const PRESETS: Record<Exclude<Preset, 'individuell'>, Visibility> = {
	zurueckhaltend: {
		display_name: 'mitglieder',
		can_help: 'kontakte',
		looking_for: 'kontakte',
		interests: 'kontakte',
		child_ages: 'kontakte',
		region: 'kontakte'
	},
	offen: {
		display_name: 'alle',
		can_help: 'mitglieder',
		looking_for: 'mitglieder',
		interests: 'mitglieder',
		child_ages: 'kontakte',
		region: 'mitglieder'
	}
};

const REL_RANK: Record<Relation, number> = { extern: 0, mitglied: 1, gruppe: 2, kontakt: 3, selbst: 4 };
const LEVEL_RANK: Record<Level, number> = { alle: 0, mitglieder: 1, gruppen: 2, kontakte: 3, niemand: 4 };

export function canSee(relation: Relation, level: Level | undefined): boolean {
	return REL_RANK[relation] >= LEVEL_RANK[level ?? 'niemand'];
}

export function sanitizeVisibility(input: Partial<Record<string, string>>, fallback: Visibility): Visibility {
	const out = { ...fallback };
	for (const { key } of FIELDS) {
		const v = input[key];
		if (v && v in LEVEL_RANK) out[key] = v as Level;
	}
	return out;
}

export const CHILD_AGES: { key: string; label: string }[] = [
	{ key: 'schwanger', label: 'Schwangerschaft' },
	{ key: '0-1', label: 'unter 1 Jahr' },
	{ key: '1-3', label: '1 bis 3 Jahre' },
	{ key: '3-6', label: '3 bis 6 Jahre' },
	{ key: '6-10', label: '6 bis 10 Jahre' },
	{ key: '10-14', label: '10 bis 14 Jahre' },
	{ key: '14+', label: '14 Jahre und älter' }
];

export interface PublicCard {
	contactId: string;
	displayName: string | null;
	canHelp: string | null;
	lookingFor: string | null;
	interests: string[];
	childAges: string[];
	regionName: string | null;
}

export interface ProfileRow {
	contact_id: string;
	display_name: string | null;
	can_help: string | null;
	looking_for: string | null;
	interests: string[];
	child_ages: string[];
	region_name: string | null;
	visibility: Visibility;
}

/** Baut die Kontaktkarte genau so, wie die jeweilige Person sie sehen darf. */
export function cardFor(p: ProfileRow, relation: Relation): PublicCard {
	const v = p.visibility;
	return {
		contactId: p.contact_id,
		displayName: canSee(relation, v.display_name) ? p.display_name : null,
		canHelp: canSee(relation, v.can_help) ? p.can_help : null,
		lookingFor: canSee(relation, v.looking_for) ? p.looking_for : null,
		interests: canSee(relation, v.interests) ? p.interests : [],
		childAges: canSee(relation, v.child_ages) ? p.child_ages : [],
		regionName: canSee(relation, v.region) ? p.region_name : null
	};
}
