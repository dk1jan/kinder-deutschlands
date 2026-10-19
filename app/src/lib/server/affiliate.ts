// Einstellungen für Partnerlinks (M08). Standard: aus. Einschalten erst nach Prüfung der aktuellen Teilnahmebedingungen
// durch den Betreiber (wird mit Datum und Person gespeichert).
import type { Sql } from './db';
import { audit } from './audit';
import { validTag } from '$lib/affiliate';

export interface AffiliateSettings {
	enabled: boolean;
	amazon_tag: string | null;
	terms_checked_at: string | null;
	terms_checked_by: string | null;
	terms_note: string | null;
}
const DEFAULT: AffiliateSettings = { enabled: false, amazon_tag: null, terms_checked_at: null, terms_checked_by: null, terms_note: null };
let cache: { at: number; v: AffiliateSettings } | null = null;

export async function getAffiliate(sql: Sql): Promise<AffiliateSettings> {
	if (cache && Date.now() - cache.at < 60_000) return cache.v;
	const [r] = await sql`select value from settings where key = 'affiliate'`;
	const v = { ...DEFAULT, ...((r?.value as Partial<AffiliateSettings>) ?? {}) };
	cache = { at: Date.now(), v };
	return v;
}

/** Aktive Kennung für einen Bereich – nie in geschützten Gruppen (D-058). */
export async function tagFor(sql: Sql, ctx: { protectedGroup: boolean }): Promise<string | null> {
	if (ctx.protectedGroup) return null;
	const a = await getAffiliate(sql);
	return a.enabled && a.amazon_tag ? a.amazon_tag : null;
}

export class AffiliateError extends Error {}

export async function saveAffiliate(sql: Sql, actorId: string, i: { enabled: boolean; tag: string | null; termsChecked: boolean; note: string | null }) {
	const cur = await getAffiliate(sql);
	const tag = i.tag?.trim() || null;
	if (tag && !validTag(tag)) throw new AffiliateError('Die Partnerkennung hat ein ungültiges Format.');
	if (i.enabled && !tag) throw new AffiliateError('Zum Einschalten bitte die Partnerkennung eintragen.');
	if (i.enabled && !i.termsChecked && !cur.terms_checked_at) throw new AffiliateError('Bitte zuerst bestätigen, dass die aktuellen Teilnahmebedingungen geprüft sind.');
	const [u] = await sql`select email from users where id = ${actorId}`;
	const v: AffiliateSettings = {
		enabled: i.enabled,
		amazon_tag: tag,
		terms_checked_at: i.termsChecked ? new Date().toISOString() : cur.terms_checked_at,
		terms_checked_by: i.termsChecked ? ((u?.email as string) ?? null) : cur.terms_checked_by,
		terms_note: i.termsChecked ? (i.note?.trim().slice(0, 500) ?? null) : cur.terms_note
	};
	await sql`insert into settings (key, value) values ('affiliate', ${sql.json(v as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
	cache = null;
	await audit(sql, { actorId, action: 'affiliate.saved', targetType: 'settings', targetId: 'affiliate', meta: { enabled: v.enabled, tag: v.amazon_tag, terms_checked: i.termsChecked } });
	return v;
}
