import { fail } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { hashPassword, passwordProblem, verifyPassword, PASSWORD_MIN } from '$lib/server/password';
import { audit } from '$lib/server/audit';
import { generateTotpSecret, otpauthUri, verifyTotp } from '$lib/server/totp';
import { decrypt, encrypt } from '$lib/server/crypto';
import { key, isHttps } from '$lib/server/config';
import { userCan } from '$lib/server/roles';
import { createEmailToken } from '$lib/server/tokens';
import { mailConfigured, mails, sendMail } from '$lib/server/mailer';
import { appUrl } from '$lib/server/config';
import { rateLimit } from '$lib/server/ratelimit';

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }) : '–');
const TOTP_COOKIE = 'kd_totp_setup';

function device(ua: string | null): string {
	if (!ua) return 'Unbekanntes Gerät';
	const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Gerät';
	const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
	return `${br} auf ${os}`;
}

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [u] = await sql`select (totp_enabled_at is not null) as totp from users where id = ${user.id}`;
	const passkeys = await sql`select id, name, created_at, last_used_at from webauthn_credentials where user_id = ${user.id} order by created_at`;
	const sessions = await sql`select id_hash, created_at, last_seen_at, user_agent from sessions where user_id = ${user.id} and expires_at > now() order by last_seen_at desc`;
	// Begonnene TOTP-Einrichtung
	let totpSetup: { qr: string; secret: string } | null = null;
	const raw = event.cookies.get(TOTP_COOKIE);
	if (raw && !u.totp) {
		try {
			const secret = decrypt(raw, key('totp-setup'));
			totpSetup = { qr: await QRCode.toString(otpauthUri(secret, user.email), { type: 'svg', margin: 1 }), secret: secret.replace(/(.{4})/g, '$1 ').trim() };
		} catch {
			/* abgelaufen */
		}
	}
	return {
		totp: !!u.totp,
		totpRequired: await userCan(sql, user.id, 'admin.access'),
		totpSetup,
		passwordMin: PASSWORD_MIN,
		// Die eigene Adresse sieht nur das Mitglied selbst (D-060)
		email: (await sql`select email from users where id = ${user.id}`)[0]?.email as string,
		mailOpen: mailConfigured(),
		passkeys: passkeys.map((p) => ({ id: p.id as string, name: p.name as string, created: fmt(p.created_at), lastUsed: fmt(p.last_used_at) })),
		sessions: sessions.map((s) => ({
			id: (s.id_hash as string).slice(0, 12),
			current: s.id_hash === event.locals.session!.idHash,
			device: device(s.user_agent as string | null),
			since: fmt(s.created_at),
			lastSeen: fmt(s.last_seen_at)
		}))
	};
};

export const actions: Actions = {
	passwort: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const sql = db();
		const [u] = await sql`select password_hash from users where id = ${user.id}`;
		if (!(await verifyPassword(String(f.get('current') ?? ''), u.password_hash))) return fail(400, { pwError: 'Das aktuelle Passwort stimmt nicht.' });
		const next = String(f.get('password') ?? '');
		const problem = passwordProblem(next) ?? (next !== String(f.get('password2') ?? '') ? 'Die beiden neuen Passwörter stimmen nicht überein.' : null);
		if (problem) return fail(400, { pwError: problem });
		await sql`update users set password_hash = ${await hashPassword(next)} where id = ${user.id}`;
		await sql`delete from sessions where user_id = ${user.id} and id_hash <> ${event.locals.session!.idHash}`;
		await audit(sql, { actorId: user.id, action: 'password.changed' });
		return { ok: 'Passwort geändert. Alle anderen Geräte wurden abgemeldet.' };
	},
	emailAendern: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const sql = db();
		const next = String(f.get('email') ?? '').trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next) || next.length > 254) return fail(400, { mailError: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
		const [u] = await sql`select email, password_hash from users where id = ${user.id}`;
		if (!(await verifyPassword(String(f.get('current') ?? ''), u.password_hash))) return fail(400, { mailError: 'Das Passwort stimmt nicht.' });
		if (next === u.email) return fail(400, { mailError: 'Das ist schon deine Adresse.' });
		if (!mailConfigured()) return fail(400, { mailError: 'E-Mail-Versand ist noch nicht eingerichtet. Bitte später erneut versuchen.' });
		if (!rateLimit(`mailchange:${user.id}`, 3, 3_600_000)) return fail(429, { mailError: 'Bitte in einer Stunde erneut versuchen.' });
		// Ob die neue Adresse schon vergeben ist, verraten wir hier nicht (D-016) – nur die neue Adresse erfährt es
		const [taken] = await sql`select 1 from users where email = ${next}`;
		if (taken) await sendMail(mails.changeTaken(next));
		else {
			const t = await createEmailToken(sql, user.id, 'change', next);
			await sendMail(mails.changeConfirm(next, `${appUrl()}/email-bestaetigen?t=${t}`));
		}
		await audit(sql, { actorId: user.id, action: 'email.change.requested' });
		return { mailOk: 'Wir haben einen Bestätigungslink an die neue Adresse geschickt. Bis zur Bestätigung gilt die bisherige.' };
	},
	passkeyLoeschen: async (event) => {
		const user = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		const sql = db();
		await sql`delete from webauthn_credentials where id = ${id} and user_id = ${user.id}`;
		await audit(sql, { actorId: user.id, action: 'passkey.removed' });
		return { ok: 'Passkey entfernt.' };
	},
	geraetAbmelden: async (event) => {
		const user = requireMember(event);
		const prefix = String((await event.request.formData()).get('id') ?? '');
		if (!/^[0-9a-f]{12}$/.test(prefix)) return fail(400, { error: 'Unbekanntes Gerät.' });
		const sql = db();
		await sql`delete from sessions where user_id = ${user.id} and left(id_hash, 12) = ${prefix} and id_hash <> ${event.locals.session!.idHash}`;
		await audit(sql, { actorId: user.id, action: 'session.revoked' });
		return { ok: 'Gerät abgemeldet.' };
	},
	alleAbmelden: async (event) => {
		const user = requireMember(event);
		const sql = db();
		await sql`delete from sessions where user_id = ${user.id} and id_hash <> ${event.locals.session!.idHash}`;
		await audit(sql, { actorId: user.id, action: 'session.revoked_all' });
		return { ok: 'Alle anderen Geräte wurden abgemeldet.' };
	},
	totpStart: async (event) => {
		requireMember(event);
		event.cookies.set(TOTP_COOKIE, encrypt(generateTotpSecret(), key('totp-setup')), {
			path: '/profil/sicherheit',
			httpOnly: true,
			secure: isHttps(),
			sameSite: 'strict',
			maxAge: 900
		});
		return {};
	},
	totpBestaetigen: async (event) => {
		const user = requireMember(event);
		const raw = event.cookies.get(TOTP_COOKIE);
		if (!raw) return fail(400, { totpError: 'Die Einrichtung ist abgelaufen. Bitte neu beginnen.' });
		let secret: string;
		try {
			secret = decrypt(raw, key('totp-setup'));
		} catch {
			return fail(400, { totpError: 'Die Einrichtung ist abgelaufen. Bitte neu beginnen.' });
		}
		const step = verifyTotp(secret, String((await event.request.formData()).get('code') ?? ''), null);
		if (step === null) return fail(400, { totpError: 'Der Code stimmt nicht. Bitte den aktuellen Code eingeben.' });
		const sql = db();
		await sql`update users set totp_secret_enc = ${encrypt(secret, key('totp'))}, totp_enabled_at = now(), totp_last_step = ${step} where id = ${user.id}`;
		event.cookies.delete(TOTP_COOKIE, { path: '/profil/sicherheit' });
		await audit(sql, { actorId: user.id, action: 'mfa.enabled' });
		return { ok: 'Zwei-Faktor-Anmeldung ist eingeschaltet.' };
	},
	totpAus: async (event) => {
		const user = requireMember(event);
		const sql = db();
		if (await userCan(sql, user.id, 'admin.access')) return fail(400, { totpError: 'Für Verwaltungsrollen ist die Zwei-Faktor-Anmeldung Pflicht.' });
		const [u] = await sql`select password_hash from users where id = ${user.id}`;
		if (!(await verifyPassword(String((await event.request.formData()).get('current') ?? ''), u.password_hash))) {
			return fail(400, { totpError: 'Das Passwort stimmt nicht.' });
		}
		await sql`update users set totp_secret_enc = null, totp_enabled_at = null, totp_last_step = null where id = ${user.id}`;
		await audit(sql, { actorId: user.id, action: 'mfa.disabled' });
		return { ok: 'Zwei-Faktor-Anmeldung ist ausgeschaltet.' };
	}
};
