import type { Sql } from './db';
import { audit } from './audit';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UUID_LINE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Löschliste außerhalb der Datenbank (Sicherungs-Volume): überlebt eine Wiederherstellung aus einer älteren Sicherung. */
function deletionFile(): string | null {
	const dir = process.env.BACKUP_DIR;
	return dir ? join(dir, 'deletions.log') : null;
}

/** Alle gespeicherten Daten zur eigenen Person (DSGVO-Auskunft/Export). Keine Daten anderer Personen außer deren öffentlicher Kontakt-ID. */
export async function exportAccount(sql: Sql, userId: string) {
	const [user] = await sql`select id, email, email_verified_at, display_name, status, created_at, last_login_at,
		(totp_enabled_at is not null) as zwei_faktor from users where id = ${userId}`;
	const [profile] = await sql`select contact_id, display_name, can_help, looking_for, interests, child_ages, region_code,
		discoverable, privacy_preset, visibility, updated_at from user_profiles where user_id = ${userId}`;
	const qr = await sql`select kind, label, created_at, expires_at, revoked_at, last_scanned_at from qr_tokens where user_id = ${userId}`;
	const contacts = await sql`select p.contact_id, c.created_at from contacts c
		join user_profiles p on p.user_id = case when c.user_a = ${userId} then c.user_b else c.user_a end
		where c.user_a = ${userId} or c.user_b = ${userId}`;
	const requests = await sql`select r.status, r.via, r.message, r.created_at, r.decided_at,
		case when r.from_user = ${userId} then 'gesendet' else 'erhalten' end as richtung, p.contact_id as andere_id
		from contact_requests r join user_profiles p on p.user_id = case when r.from_user = ${userId} then r.to_user else r.from_user end
		where r.from_user = ${userId} or r.to_user = ${userId}`;
	const blocked = await sql`select p.contact_id, b.created_at from blocks b join user_profiles p on p.user_id = b.blocked where b.blocker = ${userId}`;
	const passkeys = await sql`select name, created_at, last_used_at from webauthn_credentials where user_id = ${userId}`;
	const sessions = await sql`select created_at, last_seen_at, expires_at, user_agent from sessions where user_id = ${userId}`;
	const roles = await sql`select role_key, scope_type, scope_id, granted_at, expires_at, revoked_at from role_assignments where user_id = ${userId}`;
	const log = await sql`select at, action from audit_log where actor_id = ${userId} order by at desc limit 500`;
	const merkliste = await sql`select p.id, p.kind, p.name, f.notify as abonniert, f.created_at from place_favorites f join places p on p.id = f.place_id where f.user_id = ${userId}`;
	const vorschlaege = await sql`select id, kind, name, status, created_at from places where created_by = ${userId}`;
	const meldungen = await sql`select place_id, kind, message, status, created_at from place_reports where user_id = ${userId}`;
	const beitraege = await sql`select id, kind, title, body, topic_key, region_code, status, created_at from posts where author_id = ${userId}`;
	const antworten = await sql`select post_id, body, status, created_at from comments where author_id = ${userId}`;
	const gruppen = await sql`select g.name, m.status, m.pseudonym, m.created_at from group_members m join community_groups g on g.id = m.group_id where m.user_id = ${userId}`;
	const abos = await sql`select kind, key, created_at from subscriptions where user_id = ${userId}`;
	const bewertungen = await sql`select place_id, stars, body, status, updated_at from place_reviews where user_id = ${userId}`;
	const einschraenkungen = await sql`select kind, reason, until, created_at, lifted_at from user_restrictions where user_id = ${userId}`;
	const mitteilungen = await sql`select kind, text, created_at, read_at from notifications where user_id = ${userId} order by created_at desc limit 500`;
	return {
		erstellt: new Date().toISOString(),
		hinweis: 'Export aller zu deinem Konto gespeicherten Daten bei Kinder Deutschlands.',
		konto: user,
		profil: profile ?? null,
		qr_codes: qr,
		kontakte: contacts,
		anfragen: requests,
		blockiert: blocked,
		passkeys,
		sitzungen: sessions,
		rollen: roles,
		protokoll_eigene_vorgaenge: log,
		orte_merkliste: merkliste,
		orte_vorschlaege: vorschlaege,
		orte_meldungen: meldungen,
		community_beitraege: beitraege,
		community_antworten: antworten,
		community_gruppen: gruppen,
		familienradar: await sql`select name, regions, topics, include, age_groups, frequency, via_email, via_push, paused, created_at from radar_profiles where user_id = ${userId}`,
		merkliste: await sql`select kind, item_id, occurrence, remind_at, created_at from saved_items where user_id = ${userId}`,
		termine_teilnahme: await sql`select a.occurrence, a.status, a.show_me, e.title from event_attendance a join events e on e.id = a.event_id where a.user_id = ${userId}`,
		eigene_termine: await sql`select title, description, starts_at, ends_at, rrule, visibility, status, created_at from events where created_by = ${userId} and origin = 'mitglied'`,
		einrichtungen_folgen: await sql`select o.name, f.created_at from org_followers f join organizations o on o.id = f.org_id where f.user_id = ${userId}`,
		einrichtungen_team: await sql`select o.name, m.role, m.created_at from org_members m join organizations o on o.id = m.org_id where m.user_id = ${userId}`,
		marktplatz_anzeigen: await sql`select kind, category, title, description, price_cents, condition, region_code, status, created_at, expires_at from market_listings where user_id = ${userId} and status <> 'entfernt'`,
		marktplatz_suchauftraege: await sql`select q, category, kinds, region_code, max_price_cents, created_at from market_searches where user_id = ${userId}`,
		hilfe_eintraege: await sql`select kind, category, title, body, region_code, status, created_at from help_posts where user_id = ${userId} and status <> 'entfernt'`,
		einladungen_eigene: await sql`select i.title, i.message, i.starts_at, i.place_text, i.status, i.created_at,
			(select json_agg(json_build_object('name', r.name, 'antwort', r.answer, 'kinder', r.kids, 'erwachsene', r.adults, 'notiz', r.note)) from invitation_rsvps r where r.invitation_id = i.id) as antworten
			from invitations i where i.organizer_id = ${userId}`,
		familie: await sql`select kind, status, created_at, confirmed_at from family_links where ${userId} in (user_a, user_b)`,
		hinweise_vorgeschlagen: await sql`select kind, title, body, region_code, status, created_at from notices where created_by = ${userId} and source_kind = 'mitglied' and status <> 'entfernt'`,
		warnungen_abos: await sql`select s.kreis_code, r.name as kreis, s.label, s.min_level, s.push, s.created_at from warning_subscriptions s left join regions r on r.code = s.kreis_code where s.user_id = ${userId}`,
		rundnachrichten_erhalten: await sql`select b.title, b.created_at, r.read_at from broadcast_recipients r join broadcasts b on b.id = r.broadcast_id where r.user_id = ${userId}`,
		kinderwagenrouten: await sql`select title, description, distance_m, status, created_at from stroller_routes where created_by = ${userId} and status <> 'entfernt'`,
		routen_erfahrungen: await sql`select r.title, x.kind, x.text, x.created_at from route_reports x join stroller_routes r on r.id = x.route_id where x.user_id = ${userId}`,
		einladungen_antworten: await sql`select i.title, i.starts_at, r.name, r.answer, r.kids, r.adults, r.note, r.updated_at from invitation_rsvps r join invitations i on i.id = r.invitation_id where r.user_id = ${userId}`,
		chat: {
			hinweis: 'Chatnachrichten sind Ende-zu-Ende-verschlüsselt. Der Server kann sie nicht lesen und deshalb nicht exportieren. Sie liegen nur auf deinen Geräten.',
			chat_konto: (await sql`select created_at from chat_accounts where user_id = ${userId}`)[0] ?? null,
			benachrichtigungen: (await sql`select push_chat, push_community, quiet_from, quiet_to, read_receipts, typing from notification_settings where user_id = ${userId}`)[0] ?? null,
			push_geraete: await sql`select device_label, created_at, last_used_at from push_subscriptions where user_id = ${userId}`,
			treffen_angelegt: await sql`select kind, status, created_at, expires_at from chat_rooms where created_by = ${userId}`
		},
		community_abos: abos,
		orte_bewertungen: bewertungen,
		moderation_einschraenkungen: einschraenkungen,
		mitteilungen
	};
}

/**
 * Konto löschen: Profil, QR-Codes, Kontakte, Anfragen, Blockierungen, Passkeys, Sitzungen und Token werden entfernt.
 * Der Konto-Datensatz bleibt anonymisiert stehen (Protokoll-Verweise), E-Mail und Passwort werden unbrauchbar gemacht.
 * Die Löschung wird im Löschprotokoll vermerkt, damit sie nach einer Wiederherstellung erneut angewendet werden kann.
 */
export async function deleteAccount(sql: Sql, userId: string, opts: { fromLog?: boolean } = {}) {
	let mediaIds: string[] = [];
	let invitationRooms: string[] = [];
	await sql.begin(async (tx) => {
		const [{ n }] = await tx`select count(*)::int as n from role_assignments
			where user_id = ${userId} and role_key = 'superadmin' and revoked_at is null`;
		if (n > 0) {
			const [{ total }] = await tx`select count(*)::int as total from role_assignments where role_key = 'superadmin' and revoked_at is null`;
			if (total <= 1) throw new Error('Das letzte Betreiberkonto kann nicht gelöscht werden.');
		}
		await tx`delete from user_profiles where user_id = ${userId}`;
		await tx`delete from live_shares where user_id = ${userId}`;
		await tx`delete from qr_tokens where user_id = ${userId}`;
		await tx`delete from contacts where user_a = ${userId} or user_b = ${userId}`;
		await tx`delete from contact_requests where from_user = ${userId} or to_user = ${userId}`;
		await tx`delete from blocks where blocker = ${userId} or blocked = ${userId}`;
		await tx`delete from webauthn_credentials where user_id = ${userId}`;
		await tx`delete from sessions where user_id = ${userId}`;
		await tx`delete from email_tokens where user_id = ${userId}`;
		await tx`delete from place_favorites where user_id = ${userId}`;
		await tx`delete from family_links where ${userId} in (user_a, user_b)`;
		// Noch nicht freigegebene Vorschläge verschwinden, freigegebene Orte bleiben ohne Personenbezug
		await tx`delete from places where created_by = ${userId} and status = 'pruefung'`;
		await tx`update places set created_by = null where created_by = ${userId}`;
		await tx`update place_reports set user_id = null, message = null where user_id = ${userId}`;
		await tx`update place_notices set created_by = null where created_by = ${userId}`;
		// Eigene Hinweis-Vorschläge (M20) verschwinden mit dem Konto
		await tx`delete from notices where created_by = ${userId} and source_kind = 'mitglied'`;
		// Community: eigene Texte verschwinden, Antworten anderer bleiben stehen; Bilder werden gelöscht
		await tx`update posts set title = '[gelöscht]', body = '', link_card = null, link_url = null, status = 'entfernt', mod_note = 'Konto gelöscht' where author_id = ${userId}`;
		await tx`update comments set body = '[gelöscht]', status = 'entfernt', mod_note = 'Konto gelöscht' where author_id = ${userId}`;
		await tx`delete from place_reviews where user_id = ${userId}`;
		await tx`delete from group_members where user_id = ${userId}`;
		await tx`delete from subscriptions where user_id = ${userId}`;
		await tx`delete from bookmarks where user_id = ${userId}`;
		await tx`delete from poll_votes where user_id = ${userId}`;
		await tx`delete from helpful_marks where user_id = ${userId}`;
		await tx`delete from notifications where user_id = ${userId}`;
		await tx`update mod_cases set reporter_id = null, message = null where reporter_id = ${userId} and status = 'erledigt'`;
		mediaIds.push(...(await tx`update media set status = 'entfernt' where owner_id = ${userId} returning id`).map((r) => r.id as string));
		// Chat: Push-Abos, Einstellungen, Beitrittstickets weg; Direktchats enden
		await tx`delete from push_subscriptions where user_id = ${userId}`;
		await tx`delete from notification_settings where user_id = ${userId}`;
		await tx`delete from chat_join_tickets where user_id = ${userId}`;
		await tx`update chat_rooms set status = 'abgelaufen', ended_at = now() where kind = 'direkt' and status = 'aktiv' and (dm_a = ${userId} or dm_b = ${userId})`;
		// Abschnitt 5: Merkliste, Kalender-Link, Radar, Teilnahmen, Folgen, Team-Mitgliedschaften; eigene private Termine entfernen
		await tx`delete from saved_items where user_id = ${userId}`;
		await tx`delete from calendar_feeds where user_id = ${userId}`;
		await tx`delete from radar_profiles where user_id = ${userId}`;
		await tx`delete from event_attendance where user_id = ${userId}`;
		await tx`delete from org_followers where user_id = ${userId}`;
		await tx`delete from org_members where user_id = ${userId}`;
		await tx`update events set status = 'entfernt', description = '', address = null, location = null, updated_at = now() where created_by = ${userId} and origin = 'mitglied'`;
		// Abschnitt 6: Anzeigen, Suchaufträge, Hilfe-Einträge, Einladungen (samt Antworten) und eigene Antworten
		mediaIds.push(...(await tx`delete from media where listing_id in (select id from market_listings where user_id = ${userId}) returning id`).map((r) => r.id as string));
		await tx`update market_listings set status = 'entfernt', title = '[gelöscht]', description = '', size_text = null where user_id = ${userId}`;
		await tx`delete from market_searches where user_id = ${userId}`;
		await tx`update help_posts set status = 'entfernt', title = '[gelöscht]', body = '' where user_id = ${userId}`;
		invitationRooms = (await tx`delete from invitations where organizer_id = ${userId} returning chat_room_id`).map((r) => r.chat_room_id as string | null).filter((x): x is string => !!x);
		await tx`delete from invitation_rsvps where user_id = ${userId}`;
		// Abschnitt 7: eigene Routen (Mitglieder-Routen) und Erfahrungsmeldungen; offene Freigabe-Anträge
		await tx`update stroller_routes set status = 'entfernt', description = '', created_by = null where created_by = ${userId} and origin = 'mitglied'`;
		await tx`update stroller_routes set created_by = null where created_by = ${userId}`;
		await tx`delete from route_reports where user_id = ${userId}`;
		// Warn-Abos, zugestellte Warnungen und Rundnachrichten (Jan 24.10.)
		await tx`delete from warning_subscriptions where user_id = ${userId}`;
		await tx`delete from warning_deliveries where user_id = ${userId}`;
		await tx`delete from broadcast_recipients where user_id = ${userId}`;
		await tx`update broadcasts set created_by = null where created_by = ${userId}`;
		await tx`update approvals set status = 'zurueckgezogen' where requested_by = ${userId} and status = 'offen'`;
		await tx`update role_assignments set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
		await tx`update users set status = 'deleted', email = ${'geloescht+' + userId + '@invalid'}, password_hash = '!',
			totp_secret_enc = null, totp_enabled_at = null, display_name = null where id = ${userId}`;
		await tx`insert into deletion_log (user_id) values (${userId})`;
		await audit(tx as unknown as Sql, { actorId: userId, action: opts.fromLog ? 'account.deletion_reapplied' : 'account.deleted', targetType: 'user', targetId: userId });
	});
	const { deleteImageFile } = await import('./community/media');
	for (const id of mediaIds) await deleteImageFile(id).catch(() => {});
	for (const room of invitationRooms) {
		await deleteChatRoom(sql, room).catch(() => {});
	}
	// Chat-Konto auf dem Chat-Server stilllegen und Profil/Nachrichten-Metadaten löschen (erase)
	const chat = await import('./chat/synapse');
	try {
		await chat.deactivate(sql, userId);
		await sql`delete from chat_accounts where user_id = ${userId}`;
	} catch (e) {
		console.error('Chat-Konto konnte nicht stillgelegt werden:', (e as Error).message);
	}
	const f = deletionFile();
	if (f && !opts.fromLog) {
		try {
			appendFileSync(f, userId + '\n', { mode: 0o600 });
		} catch (e) {
			console.error('Löschliste konnte nicht geschrieben werden:', (e as Error).message);
		}
	}
}

/** Nach einer Wiederherstellung aus einer Sicherung: alle protokollierten Löschungen erneut anwenden. */
export async function reapplyDeletions(sql: Sql): Promise<number> {
	const ids = new Set<string>();
	const f = deletionFile();
	if (f) {
		try {
			for (const line of readFileSync(f, 'utf8').split('\n')) if (UUID_LINE.test(line.trim())) ids.add(line.trim());
		} catch {
			/* Datei existiert noch nicht */
		}
	}
	const logged = await sql`select distinct user_id from deletion_log`;
	for (const r of logged) ids.add(r.user_id as string);
	if (!ids.size) return 0;
	const open = await sql`select id from users where id = any(${[...ids]}::uuid[]) and status <> 'deleted'`;
	for (const r of open) await deleteAccount(sql, r.id as string, { fromLog: true });
	if (open.length) console.log(`Löschliste: ${open.length} Konto/Konten nach Wiederherstellung erneut gelöscht.`);
	return open.length;
}

async function deleteChatRoom(sql: Sql, roomId: string) {
	const { deleteRoom } = await import('./chat/synapse');
	await deleteRoom(sql, roomId);
	await sql`update chat_rooms set status = 'geloescht', ended_at = now() where room_id = ${roomId}`;
}
