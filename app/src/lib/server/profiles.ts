import type { Sql } from './db';
import { generateContactId } from './contactid';
import { PRESETS, type ProfileRow, type Relation, type Visibility, type Preset } from '$lib/visibility';

/** Legt das Profil mit eindeutiger Kontakt-ID an, falls es fehlt. Gibt die Kontakt-ID zurück. */
export async function ensureProfile(sql: Sql, userId: string): Promise<string> {
	const [existing] = await sql`select contact_id from user_profiles where user_id = ${userId}`;
	if (existing) return existing.contact_id as string;
	for (let attempt = 0; attempt < 10; attempt++) {
		const id = generateContactId();
		const [row] = await sql`insert into user_profiles (user_id, contact_id) values (${userId}, ${id})
			on conflict do nothing returning contact_id`;
		if (row) return row.contact_id as string;
		const [again] = await sql`select contact_id from user_profiles where user_id = ${userId}`;
		if (again) return again.contact_id as string;
	}
	throw new Error('Konnte keine eindeutige Kontakt-ID erzeugen.');
}

export interface FullProfile extends ProfileRow {
	user_id: string;
	region_code: string | null;
	discoverable: boolean;
	privacy_preset: Preset;
}

export async function getProfile(sql: Sql, userId: string): Promise<FullProfile | null> {
	const [p] = await sql`
		select p.user_id, p.contact_id, p.display_name, p.can_help, p.looking_for, p.interests, p.child_ages,
		       p.region_code, r.name as region_name, p.discoverable, p.privacy_preset, p.visibility
		from user_profiles p left join regions r on r.code = p.region_code
		where p.user_id = ${userId}`;
	return (p as unknown as FullProfile) ?? null;
}

export async function getProfileByContactId(sql: Sql, contactId: string): Promise<FullProfile | null> {
	const [p] = await sql`
		select p.user_id, p.contact_id, p.display_name, p.can_help, p.looking_for, p.interests, p.child_ages,
		       p.region_code, r.name as region_name, p.discoverable, p.privacy_preset, p.visibility
		from user_profiles p
		join users u on u.id = p.user_id and u.status = 'active' and u.email_verified_at is not null
		left join regions r on r.code = p.region_code
		where p.contact_id = ${contactId}`;
	return (p as unknown as FullProfile) ?? null;
}

export interface ProfileInput {
	displayName: string | null;
	canHelp: string | null;
	lookingFor: string | null;
	interests: string[];
	childAges: string[];
	regionCode: string | null;
	discoverable: boolean;
	preset: Preset;
	visibility: Visibility;
}

export async function updateProfile(sql: Sql, userId: string, i: ProfileInput) {
	const visibility = i.preset === 'individuell' ? i.visibility : PRESETS[i.preset];
	await sql`update user_profiles set
		display_name = ${i.displayName}, can_help = ${i.canHelp}, looking_for = ${i.lookingFor},
		interests = ${i.interests}, child_ages = ${i.childAges}, region_code = ${i.regionCode},
		discoverable = ${i.discoverable}, privacy_preset = ${i.preset}, visibility = ${sql.json(visibility)},
		updated_at = now()
		where user_id = ${userId}`;
	// Anzeigename im Chat angleichen (nur wenn schon ein Chat-Konto besteht; Fehler stören das Speichern nicht)
	const [acc] = await sql`select 1 as x from chat_accounts where user_id = ${userId}`;
	if (acc) {
		const chat = await import('./chat/synapse');
		if (chat.chatEnabled()) await chat.ensureAccount(sql, userId).catch(() => {});
	}
}

export async function isBlockedEither(sql: Sql, a: string, b: string): Promise<boolean> {
	const [row] = await sql`select 1 from blocks where (blocker = ${a} and blocked = ${b}) or (blocker = ${b} and blocked = ${a})`;
	return !!row;
}

export async function areContacts(sql: Sql, a: string, b: string): Promise<boolean> {
	const [x, y] = a < b ? [a, b] : [b, a];
	const [row] = await sql`select 1 from contacts where user_a = ${x} and user_b = ${y}`;
	return !!row;
}

/** Beziehung des Betrachters zum Profilinhaber – Grundlage jeder Sichtbarkeitsentscheidung. */
export async function relationOf(sql: Sql, viewerId: string | null, ownerId: string): Promise<Relation> {
	if (!viewerId) return 'extern';
	if (viewerId === ownerId) return 'selbst';
	if (await areContacts(sql, viewerId, ownerId)) return 'kontakt';
	return (await shareGroup(sql, viewerId, ownerId)) ? 'gruppe' : 'mitglied';
}

/**
 * Freigabestufe „Mitglieder meiner Gruppen“ (D-063): beide aktiv in derselben offenen oder Beitritts-Gruppe,
 * beide dort ohne Pseudonym. Geschützte Gruppen zählen nie – sonst ließe sich aus einer sichtbaren Angabe
 * ableiten, dass jemand Mitglied einer geschützten Gruppe ist.
 */
export async function shareGroup(sql: Sql, a: string, b: string): Promise<boolean> {
	const [r] = await sql`select 1 from group_members x join group_members y on y.group_id = x.group_id and y.user_id = ${b}
		join community_groups g on g.id = x.group_id
		where x.user_id = ${a} and x.status = 'aktiv' and y.status = 'aktiv' and x.pseudonym is null and y.pseudonym is null
			and g.kind in ('offen', 'beitritt') and g.status = 'aktiv' limit 1`;
	return !!r;
}
