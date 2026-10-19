// Gemeinsames für „Termin eintragen“ und „Termin bearbeiten“.
import type { Sql } from '../db';
import { userCan } from '../roles';
import { myOrgs } from './orgs';

/** Als wer darf diese Person Termine anlegen? Eigene Mitgliedstermine immer; verifizierte Einrichtungen; Redaktion mit Recht. */
export async function ownerChoices(sql: Sql, userId: string) {
	const orgs = (await myOrgs(sql, userId)).filter((o) => o.status === 'verifiziert');
	const out = orgs.map((o) => ({ value: `org:${o.id}`, label: o.name as string, slug: o.slug as string }));
	if (await userCan(sql, userId, 'events.edit')) out.push({ value: 'redaktion', label: 'Redaktion', slug: '' });
	out.push({ value: 'ich', label: 'Ich als Mitglied', slug: '' });
	return out;
}

export function parseOwner(raw: unknown): { orgId: string | null; asRedaktion: boolean } {
	const s = String(raw ?? 'ich');
	if (s.startsWith('org:')) return { orgId: s.slice(4), asRedaktion: false };
	return { orgId: null, asRedaktion: s === 'redaktion' };
}
