// Private Einladungen (M21), z. B. Kindergeburtstag: Zugang nur per Link, Zu-/Absage auch ohne Konto,
// Gästeliste nur für die Gastgeberin, Adresse auf Wunsch erst nach Zusage, Link widerrufbar.
// Gästedaten werden 30 Tage nach dem Termin gelöscht.
import type { Sql } from '../db';
import { audit } from '../audit';
import { PostError, notify } from '../community/posts';
import { checkText } from '../community/automod';
import { decrypt, deriveKey, encrypt, randomToken, sha256hex } from '../crypto';
import { appUrl } from '../config';
import { deleteRoom } from '../chat/synapse';

const key = () => deriveKey(process.env.APP_SECRET ?? '', 'einladung-link');
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export interface InvitationInput {
	title: string;
	message: string;
	startsAt: Date;
	endsAt: Date | null;
	placeText: string | null;
	addressAfterRsvp: boolean;
	placeId: string | null;
	rsvpUntil: Date | null;
	maxGuests: number | null;
	guestsSeeList: boolean;
}

function validate(i: InvitationInput) {
	if (i.title.trim().length < 3 || i.title.length > 120) throw new PostError('Titel: 3 bis 120 Zeichen.');
	if (i.message.length > 3000) throw new PostError('Text zu lang.');
	if (Number.isNaN(i.startsAt.getTime())) throw new PostError('Bitte Beginn angeben.');
	if (i.startsAt.getTime() < Date.now() - 3600_000) throw new PostError('Der Termin liegt in der Vergangenheit.');
	if (i.startsAt.getTime() > Date.now() + 366 * 86_400_000) throw new PostError('Der Termin liegt zu weit in der Zukunft.');
	if (i.endsAt && i.endsAt < i.startsAt) throw new PostError('Ende liegt vor dem Beginn.');
	if (i.rsvpUntil && i.rsvpUntil > i.startsAt) throw new PostError('Antwortfrist liegt nach dem Beginn.');
	if (i.maxGuests !== null && (i.maxGuests < 1 || i.maxGuests > 200)) throw new PostError('Gästezahl zwischen 1 und 200.');
}

const linkFor = (token: string) => `${appUrl()}/e/${token}`;

function newToken() {
	const t = randomToken(24);
	return { token: t, hash: sha256hex(t), enc: encrypt(t, key()) };
}

export async function createInvitation(sql: Sql, userId: string, i: InvitationInput) {
	validate(i);
	const [{ n }] = await sql`select count(*)::int as n from invitations where organizer_id = ${userId} and created_at > now() - interval '1 day'`;
	if (n >= 10) throw new PostError('Heute schon viele Einladungen angelegt.');
	const t = newToken();
	const [r] = await sql`insert into invitations (organizer_id, title, message, starts_at, ends_at, place_text, address_after_rsvp, place_id, rsvp_until, max_guests,
			guests_see_list, token_hash, token_enc, link_expires_at)
		values (${userId}, ${i.title.trim()}, ${i.message.trim()}, ${i.startsAt}, ${i.endsAt}, ${i.placeText?.trim() || null}, ${i.addressAfterRsvp}, ${i.placeId},
			${i.rsvpUntil}, ${i.maxGuests}, ${i.guestsSeeList}, ${t.hash}, ${t.enc}, ${new Date((i.endsAt ?? i.startsAt).getTime() + 86_400_000)}) returning id`;
	await audit(sql, { actorId: userId, action: 'invitation.created', targetType: 'invitation', targetId: r.id });
	return { id: r.id as string, link: linkFor(t.token) };
}

async function own(sql: Sql, userId: string, id: string) {
	const [r] = await sql`select * from invitations where id = ${id} and organizer_id = ${userId}`;
	if (!r) throw new PostError('Einladung nicht gefunden.');
	return r;
}

export async function updateInvitation(sql: Sql, userId: string, id: string, i: InvitationInput) {
	const cur = await own(sql, userId, id);
	validate(i);
	await sql`update invitations set title = ${i.title.trim()}, message = ${i.message.trim()}, starts_at = ${i.startsAt}, ends_at = ${i.endsAt}, place_text = ${i.placeText?.trim() || null},
		address_after_rsvp = ${i.addressAfterRsvp}, place_id = ${i.placeId}, rsvp_until = ${i.rsvpUntil}, max_guests = ${i.maxGuests}, guests_see_list = ${i.guestsSeeList},
		link_expires_at = ${cur.token_hash ? new Date((i.endsAt ?? i.startsAt).getTime() + 86_400_000) : null}, updated_at = now() where id = ${id}`;
	const changed = new Date(cur.starts_at).getTime() !== i.startsAt.getTime() || (cur.place_text ?? '') !== (i.placeText?.trim() ?? '');
	if (changed) await notifyGuests(sql, id, `Die Einladung „${i.title.trim()}“ wurde geändert (Zeit oder Ort).`);
}

/** Neuer Link – der alte funktioniert sofort nicht mehr. Bestehende Antworten bleiben. */
export async function renewLink(sql: Sql, userId: string, id: string) {
	const cur = await own(sql, userId, id);
	const t = newToken();
	await sql`update invitations set token_hash = ${t.hash}, token_enc = ${t.enc}, link_expires_at = ${new Date(new Date(cur.ends_at ?? cur.starts_at).getTime() + 86_400_000)}, updated_at = now() where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'invitation.link.renewed', targetType: 'invitation', targetId: id });
	return linkFor(t.token);
}

/** Link abschalten – niemand kann mehr neu zusagen oder die Einladung öffnen (auch bereits Eingeladene nicht). */
export async function revokeLink(sql: Sql, userId: string, id: string) {
	await own(sql, userId, id);
	await sql`update invitations set token_hash = null, token_enc = null, updated_at = now() where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'invitation.link.revoked', targetType: 'invitation', targetId: id });
}

export async function cancelInvitation(sql: Sql, userId: string, id: string, note: string) {
	const cur = await own(sql, userId, id);
	await sql`update invitations set status = 'abgesagt', cancel_note = ${note.trim().slice(0, 300) || null}, updated_at = now() where id = ${id}`;
	await notifyGuests(sql, id, `Abgesagt: „${cur.title}“${note.trim() ? ` – ${note.trim().slice(0, 200)}` : ''}`);
}

export async function deleteInvitation(sql: Sql, userId: string, id: string) {
	const cur = await own(sql, userId, id);
	if (cur.chat_room_id) await deleteChat(sql, cur.chat_room_id);
	await sql`delete from invitations where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'invitation.deleted', targetType: 'invitation', targetId: id });
}

async function deleteChat(sql: Sql, roomId: string) {
	await deleteRoom(sql, roomId).catch(() => {});
	await sql`update chat_rooms set status = 'geloescht', ended_at = now() where room_id = ${roomId}`;
}

async function notifyGuests(sql: Sql, id: string, text: string) {
	const rows = await sql`select user_id from invitation_rsvps where invitation_id = ${id} and user_id is not null and answer <> 'nein'`;
	for (const r of rows) await notify(sql, r.user_id, 'einladung', text, null, { pushKind: 'community', pushBody: 'Neuigkeit zu einer Einladung' });
}

export async function myInvitations(sql: Sql, userId: string) {
	const rows = await sql`select i.id, i.title, i.starts_at, i.status, i.token_hash is not null as link_active,
			count(r.*) filter (where r.answer = 'ja')::int as ja, count(r.*) filter (where r.answer = 'vielleicht')::int as vielleicht, count(r.*) filter (where r.answer = 'nein')::int as nein
		from invitations i left join invitation_rsvps r on r.invitation_id = i.id where i.organizer_id = ${userId}
		group by i.id order by i.starts_at desc limit 100`;
	const guestOf = await sql`select i.id, i.title, i.starts_at, i.status, r.answer from invitation_rsvps r join invitations i on i.id = r.invitation_id
		where r.user_id = ${userId} order by i.starts_at desc limit 50`;
	return {
		own: rows.map((r) => ({ id: r.id as string, title: r.title as string, startsAt: r.starts_at as Date, status: r.status as string, linkActive: r.link_active as boolean, ja: r.ja as number, vielleicht: r.vielleicht as number, nein: r.nein as number })),
		guest: guestOf.map((r) => ({ id: r.id as string, title: r.title as string, startsAt: r.starts_at as Date, status: r.status as string, answer: r.answer as string }))
	};
}

/** Ansicht der Gastgeberin: alle Antworten, aktueller Link. */
export async function organizerView(sql: Sql, userId: string, id: string) {
	const i = await own(sql, userId, id);
	const rsvps = await sql`select id, name, answer, kids, adults, note, user_id is not null as member, updated_at from invitation_rsvps where invitation_id = ${id} order by answer, updated_at`;
	let link: string | null = null;
	if (i.token_enc) {
		try {
			link = linkFor(decrypt(i.token_enc, key()));
		} catch {
			link = null;
		}
	}
	return { inv: shape(i), link, rsvps: rsvps.map((r) => ({ id: r.id as string, name: r.name as string, answer: r.answer as string, kids: r.kids as number, adults: r.adults as number, note: r.note as string | null, member: r.member as boolean, at: r.updated_at as Date })) };
}

const shape = (i: Record<string, unknown>) => ({
	id: i.id as string,
	title: i.title as string,
	message: i.message as string,
	startsAt: i.starts_at as Date,
	endsAt: i.ends_at as Date | null,
	placeText: i.place_text as string | null,
	addressAfterRsvp: i.address_after_rsvp as boolean,
	placeId: i.place_id as string | null,
	rsvpUntil: i.rsvp_until as Date | null,
	maxGuests: i.max_guests as number | null,
	guestsSeeList: i.guests_see_list as boolean,
	status: i.status as string,
	cancelNote: i.cancel_note as string | null,
	chatRoomId: i.chat_room_id as string | null,
	linkActive: !!i.token_hash
});

export interface Guest {
	userId: string | null;
	/** Gastschlüssel aus dem Cookie (nur ohne Konto), je Einladung */
	keyFor: (invitationId: string) => string | null;
}

async function byToken(sql: Sql, token: string) {
	if (!TOKEN.test(token)) return null;
	const [i] = await sql`select i.*, p.display_name as organizer_name, p.visibility as organizer_vis from invitations i join user_profiles p on p.user_id = i.organizer_id
		join users u on u.id = i.organizer_id and u.status = 'active'
		where i.token_hash = ${sha256hex(token)}`;
	if (!i) return null;
	if (i.link_expires_at && new Date(i.link_expires_at) < new Date()) return null;
	return i;
}

async function myRsvp(sql: Sql, invId: string, g: Guest) {
	if (g.userId) {
		const [r] = await sql`select * from invitation_rsvps where invitation_id = ${invId} and user_id = ${g.userId}`;
		if (r) return r;
	}
	const k = g.keyFor(invId);
	if (k) {
		const [r] = await sql`select * from invitation_rsvps where invitation_id = ${invId} and guest_key_hash = ${sha256hex(k)}`;
		if (r) return r;
	}
	return null;
}

/** Ansicht für Eingeladene (per Link). Adresse ggf. erst nach Zusage, Gästeliste nur, wenn freigegeben – und nur für Zusagende. */
export async function guestView(sql: Sql, token: string, g: Guest) {
	const i = await byToken(sql, token);
	if (!i) return null;
	const mine = await myRsvp(sql, i.id, g);
	const isOrganizer = g.userId === i.organizer_id;
	const showAddress = isOrganizer || !i.address_after_rsvp || mine?.answer === 'ja' || mine?.answer === 'vielleicht';
	const [counts] = await sql`select count(*) filter (where answer = 'ja')::int as ja, count(*) filter (where answer = 'vielleicht')::int as vielleicht,
		coalesce(sum(kids) filter (where answer = 'ja'), 0)::int as kids from invitation_rsvps where invitation_id = ${i.id}`;
	const list = i.guests_see_list && (mine?.answer === 'ja' || isOrganizer)
		? (await sql`select name from invitation_rsvps where invitation_id = ${i.id} and answer = 'ja' order by created_at`).map((r) => r.name as string)
		: null;
	const [place] = i.place_id && showAddress ? await sql`select id, name from places where id = ${i.place_id}` : [];
	const organizer = ['alle', 'mitglieder'].includes(i.organizer_vis?.display_name) && i.organizer_name ? (i.organizer_name as string) : null;
	const full = i.max_guests !== null && counts.ja >= i.max_guests && mine?.answer !== 'ja';
	const closed = i.status !== 'aktiv' || (i.rsvp_until && new Date(i.rsvp_until) < new Date()) || new Date(i.starts_at) < new Date();
	return {
		...shape(i),
		placeText: showAddress ? (i.place_text as string | null) : null,
		place: place ? { id: place.id as string, name: place.name as string } : null,
		addressHidden: !showAddress && !!(i.place_text || i.place_id),
		organizer,
		isOrganizer,
		counts: { ja: counts.ja as number, vielleicht: counts.vielleicht as number, kids: counts.kids as number },
		list,
		mine: mine ? { name: mine.name as string, answer: mine.answer as string, kids: mine.kids as number, adults: mine.adults as number, note: mine.note as string | null } : null,
		full,
		closed: !!closed,
		chatAvailable: !!i.chat_room_id && !!g.userId && (mine?.answer === 'ja' || mine?.answer === 'vielleicht' || isOrganizer)
	};
}

export async function rsvp(sql: Sql, token: string, g: Guest, a: { name: string; answer: string; kids: number; adults: number; note: string | null }) {
	const i = await byToken(sql, token);
	if (!i) throw new PostError('Diese Einladung gibt es nicht (mehr).');
	if (i.status !== 'aktiv') throw new PostError('Diese Einladung wurde abgesagt.');
	if ((i.rsvp_until && new Date(i.rsvp_until) < new Date()) || new Date(i.starts_at) < new Date()) throw new PostError('Antworten sind nicht mehr möglich.');
	if (!['ja', 'nein', 'vielleicht'].includes(a.answer)) throw new PostError('Bitte zu- oder absagen.');
	const name = a.name.trim().slice(0, 60);
	if (!name) throw new PostError('Bitte einen Namen angeben, damit die Gastgeber wissen, wer kommt (Vorname reicht).');
	if (!Number.isInteger(a.kids) || a.kids < 0 || a.kids > 10 || !Number.isInteger(a.adults) || a.adults < 0 || a.adults > 10) throw new PostError('Bitte die Anzahl prüfen (0–10).');
	const note = a.note?.trim().slice(0, 300) || null;
	if (note && checkText(note).some((f) => f.hold)) throw new PostError('Bitte keine Telefonnummern, E-Mail- oder Kontonummern in die Notiz.');
	const mine = await myRsvp(sql, i.id, g);
	if (a.answer === 'ja' && mine?.answer !== 'ja' && i.max_guests !== null) {
		const [{ n }] = await sql`select count(*)::int as n from invitation_rsvps where invitation_id = ${i.id} and answer = 'ja'`;
		if (n >= i.max_guests) throw new PostError('Leider sind schon alle Plätze vergeben.');
	}
	if (!mine) {
		const [{ n }] = await sql`select count(*)::int as n from invitation_rsvps where invitation_id = ${i.id}`;
		if (n >= 300) throw new PostError('Zu viele Antworten.');
	}
	let guestKey: string | null = null;
	if (mine) {
		await sql`update invitation_rsvps set name = ${name}, answer = ${a.answer}, kids = ${a.kids}, adults = ${a.adults}, note = ${note}, updated_at = now() where id = ${mine.id}`;
	} else if (g.userId) {
		await sql`insert into invitation_rsvps (invitation_id, user_id, name, answer, kids, adults, note) values (${i.id}, ${g.userId}, ${name}, ${a.answer}, ${a.kids}, ${a.adults}, ${note})`;
	} else {
		guestKey = randomToken(24);
		await sql`insert into invitation_rsvps (invitation_id, guest_key_hash, name, answer, kids, adults, note) values (${i.id}, ${sha256hex(guestKey)}, ${name}, ${a.answer}, ${a.kids}, ${a.adults}, ${note})`;
	}
	if (!mine || mine.answer !== a.answer)
		await notify(sql, i.organizer_id, 'einladung', `${name}: ${a.answer === 'ja' ? 'Zusage' : a.answer === 'nein' ? 'Absage' : 'Vielleicht'} für „${i.title}“`, `/einladungen/${i.id}`, { pushKind: 'community', pushBody: 'Neue Antwort auf deine Einladung' });
	return { guestKey, invitationId: i.id as string };
}

// ---------- Gäste-Chat ----------
export async function attachChat(sql: Sql, userId: string, id: string, roomId: string) {
	const i = await own(sql, userId, id);
	if (i.chat_room_id) throw new PostError('Es gibt schon einen Gäste-Chat.');
	const { registerTimedRoom } = await import('../chat/rooms');
	await registerTimedRoom(sql, userId, roomId, new Date(new Date(i.ends_at ?? i.starts_at).getTime() + 2 * 86_400_000));
	await sql`update invitations set chat_room_id = ${roomId}, updated_at = now() where id = ${id}`;
}

/** Ticket für den Gäste-Chat: nur angemeldet und mit Zusage/Vielleicht. */
export async function chatTicket(sql: Sql, token: string, userId: string) {
	const i = await byToken(sql, token);
	if (!i || !i.chat_room_id || i.status !== 'aktiv') throw new PostError('Den Gäste-Chat gibt es nicht.');
	const mine = await myRsvp(sql, i.id, { userId, keyFor: () => null });
	if (userId !== i.organizer_id && mine?.answer !== 'ja' && mine?.answer !== 'vielleicht') throw new PostError('Bitte zuerst zusagen.');
	const { grantTicket } = await import('../chat/rooms');
	await grantTicket(sql, userId, i.chat_room_id);
	return i.chat_room_id as string;
}

/** Zeitplan: 30 Tage nach dem Termin Einladung samt Antworten löschen. */
export async function purgeInvitations(sql: Sql): Promise<number> {
	const rows = await sql`select id, chat_room_id from invitations where coalesce(ends_at, starts_at) < now() - interval '30 days' limit 100`;
	for (const r of rows) {
		if (r.chat_room_id) await deleteChat(sql, r.chat_room_id);
		await sql`delete from invitations where id = ${r.id}`;
	}
	return rows.length;
}

/** Cookie für Gäste ohne Konto: je Einladung ein eigener Schlüssel (nur zum Ändern der eigenen Antwort). */
export const GUEST_COOKIE = (invitationId: string) => `kd_gast_${invitationId.replace(/-/g, '').slice(0, 16)}`;
