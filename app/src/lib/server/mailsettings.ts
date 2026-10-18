import type { Sql } from './db';
import { decrypt, deriveKey, encrypt } from './crypto';
import { EMAIL_RE } from './validate';

// E-Mail-Zugang: in der Verwaltung gespeichert (Tabelle settings, Schlüssel 'mail', Passwort verschlüsselt).
// Ist dort nichts gespeichert, gelten die Portainer-Variablen SMTP_* als Rückfall.

export interface MailConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	from: string;
	insecureTls: boolean;
	source: 'verwaltung' | 'umgebung';
}

interface Stored {
	host: string;
	port: number;
	user: string;
	password_enc: string | null;
	from: string;
	insecure_tls: boolean;
	updated_at: string;
	updated_by: string | null;
}

// process.env direkt (adapter-node): Änderungen sind so auch in Tests sichtbar.
const env = process.env;
let settingsKey: Buffer | null = null;
let settingsKeySecret = '';
function key(_purpose: 'settings'): Buffer {
	const secret = env.APP_SECRET || '';
	if (!settingsKey || settingsKeySecret !== secret) {
		settingsKey = deriveKey(secret, 'settings');
		settingsKeySecret = secret;
	}
	return settingsKey;
}

let stored: Stored | null = null;
let loaded = false;
let version = 0;

export function mailSettingsLoaded(): boolean {
	return loaded;
}

/** Zähler, der sich bei jeder Änderung erhöht – der Mailer baut damit seine Verbindung neu auf. */
export function mailSettingsVersion(): number {
	return version;
}

export async function loadMailSettings(sql: Sql): Promise<void> {
	const [row] = await sql`select value from settings where key = 'mail'`;
	stored = row?.value?.host ? (row.value as Stored) : null;
	loaded = true;
	version++;
}

function fromEnv(): MailConfig | null {
	if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
	return {
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT || 587),
		user: env.SMTP_USER || '',
		password: env.SMTP_PASSWORD || '',
		from: env.SMTP_FROM,
		insecureTls: env.SMTP_INSECURE_TLS === 'true',
		source: 'umgebung'
	};
}

/** Gültige Konfiguration: Verwaltung vor Umgebungsvariablen. */
export function mailConfig(): MailConfig | null {
	if (stored) {
		let password = '';
		if (stored.password_enc) {
			try {
				password = decrypt(stored.password_enc, key('settings'));
			} catch {
				password = ''; // APP_SECRET geändert → Passwort muss neu eingegeben werden
			}
		}
		return { host: stored.host, port: stored.port, user: stored.user, password, from: stored.from, insecureTls: stored.insecure_tls, source: 'verwaltung' };
	}
	return fromEnv();
}

/** Für die Anzeige: nie das Passwort, nur ob eins gesetzt ist. */
export function mailSettingsView() {
	const c = mailConfig();
	const envC = fromEnv();
	return {
		host: c?.host ?? '',
		port: c?.port ?? 587,
		user: c?.user ?? '',
		from: c?.from ?? '',
		insecureTls: c?.insecureTls ?? false,
		hasPassword: !!c?.password,
		source: c?.source ?? null,
		envAvailable: !!envC,
		updatedAt: stored?.updated_at ?? null,
		passwordUnreadable: !!stored?.password_enc && !c?.password
	};
}

export class MailSettingsError extends Error {}

export interface MailSettingsInput {
	host: string;
	port: string;
	user: string;
	password: string; // leer = bisheriges Passwort behalten
	from: string;
	insecureTls: boolean;
}

const HOST_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?)*$/;

export function validateMailInput(i: MailSettingsInput): { host: string; port: number; user: string; from: string } {
	const host = i.host.trim().toLowerCase();
	const port = Number(i.port);
	const user = i.user.trim();
	const from = i.from.trim();
	if (!host || host.length > 253 || !HOST_RE.test(host)) throw new MailSettingsError('Bitte einen gültigen Servernamen eintragen, z. B. jan-krueger.org.');
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new MailSettingsError('Bitte einen gültigen Port eintragen (meist 587 oder 465).');
	if (user.length > 254) throw new MailSettingsError('Benutzername ist zu lang.');
	if (!EMAIL_RE.test(from)) throw new MailSettingsError('Bitte eine gültige Absenderadresse eintragen.');
	if (i.password.length > 500) throw new MailSettingsError('Passwort ist zu lang.');
	return { host, port, user, from };
}

export async function saveMailSettings(sql: Sql, i: MailSettingsInput, actorId: string): Promise<void> {
	const v = validateMailInput(i);
	const [row] = await sql`select value from settings where key = 'mail'`;
	const prev = row?.value as Stored | undefined;
	let password_enc: string | null = prev?.password_enc ?? null;
	if (i.password) password_enc = encrypt(i.password, key('settings'));
	if (!i.password && !prev?.host) {
		// Erstmaliges Speichern ohne Passwort: vorhandenes Portainer-Passwort übernehmen, falls derselbe Zugang
		const e = fromEnv();
		if (e?.password && e.host === v.host && e.user === v.user) password_enc = encrypt(e.password, key('settings'));
	}
	if (!v.user) password_enc = null;
	const value: Stored = { ...v, password_enc, insecure_tls: i.insecureTls, updated_at: new Date().toISOString(), updated_by: actorId };
	await sql`insert into settings (key, value) values ('mail', ${sql.json(value as never)})
		on conflict (key) do update set value = excluded.value, updated_at = now()`;
	await loadMailSettings(sql);
}

export async function clearMailSettings(sql: Sql): Promise<void> {
	await sql`delete from settings where key = 'mail'`;
	await loadMailSettings(sql);
}
