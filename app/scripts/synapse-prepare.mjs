// Bereitet den Chat-Server (Synapse) vor – läuft vor jedem Start der Web-App (aus migrate.mjs).
// Schreibt homeserver.yaml, Log-Konfiguration, Signaturschlüssel und das Regelmodul in SYNAPSE_CONFIG_DIR
// und legt die Datenbank „synapse“ (C-Sortierung, wie von Synapse verlangt) an. Nichts davon muss
// von Hand gepflegt werden; alle Geheimnisse werden aus APP_SECRET abgeleitet (HKDF, je Zweck eigener Schlüssel).
// Synapse startet sich selbst neu, sobald sich diese Dateien ändern (siehe deploy/docker-compose.yml).
import { hkdfSync, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Feste Server-Kennung: unabhängig von der Domain, damit ein Domainwechsel (APP_URL) die Chats nicht zerstört. */
export const SERVER_NAME = 'kinder-deutschlands';

export function derive(secret, purpose, len = 32) {
	if (!secret || secret.length < 32) throw new Error('APP_SECRET fehlt oder ist kürzer als 32 Zeichen.');
	return Buffer.from(hkdfSync('sha256', secret, 'kinder-deutschlands', purpose, len));
}
export const chatSecret = (secret, purpose) => derive(secret, `chat:${purpose}`).toString('base64url');

function yamlStr(s) {
	return JSON.stringify(String(s));
}

export function buildConfig(o) {
	const db = new URL(o.databaseUrl);
	const s = (p) => chatSecret(o.appSecret, p);
	const internal = o.internalUrl.replace(/\/$/, '');
	return `# Automatisch erzeugt von scripts/synapse-prepare.mjs – Änderungen hier werden beim nächsten Start überschrieben.
server_name: ${yamlStr(SERVER_NAME)}
public_baseurl: ${yamlStr(o.appUrl.replace(/\/$/, '') + '/')}
pid_file: ${yamlStr(o.pidFile)}
report_stats: false
suppress_key_server_warning: true
trusted_key_servers: []

listeners:
  - port: ${o.port}
    bind_addresses: [${yamlStr(o.bind)}]
    type: http
    tls: false
    x_forwarded: true
    resources:
      - names: [client]
        compress: false

database:
  name: psycopg2
  args:
    user: ${yamlStr(decodeURIComponent(db.username))}
    password: ${yamlStr(decodeURIComponent(db.password))}
    dbname: ${yamlStr(o.dbName)}
    host: ${yamlStr(db.hostname)}
    port: ${Number(db.port || 5432)}
    cp_min: 2
    cp_max: 10

log_config: ${yamlStr(join(o.configDir, 'log.config'))}
signing_key_path: ${yamlStr(join(o.configDir, 'signing.key'))}
media_store_path: ${yamlStr(o.mediaStore)}
max_upload_size: 25M
max_image_pixels: 32M
dynamic_thumbnails: false
url_preview_enabled: false
enable_media_repo: true

# Kein offener Zugang: keine Registrierung, keine Passwörter. Anmeldung nur mit kurzlebigem Token der App.
enable_registration: false
password_config:
  enabled: false
jwt_config:
  enabled: true
  secret: ${yamlStr(s('jwt'))}
  algorithm: HS256
  issuer: ${yamlStr(SERVER_NAME)}
registration_shared_secret: ${yamlStr(s('registration'))}
macaroon_secret_key: ${yamlStr(s('macaroon'))}
form_secret: ${yamlStr(s('form'))}

# Keine Föderation, kein Raumverzeichnis, keine Nutzersuche, kein Online-Status.
federation_domain_whitelist: []
allow_public_rooms_without_auth: false
allow_public_rooms_over_federation: false
room_list_publication_rules:
  - action: deny
alias_creation_rules:
  - action: deny
enable_room_list_search: false
user_directory:
  enabled: false
presence:
  enabled: false
require_auth_for_profile_requests: true
limit_profile_requests_to_users_who_share_rooms: true
encryption_enabled_by_default_for_room_type: all
forget_rooms_on_leave: true
redaction_retention_period: 7d
user_ips_max_age: 14d
include_profile_data_on_invite: true

# Anmeldung kommt immer über die App (kurzlebiges Token), daher großzügigere Grenzen je Adresse
rc_login:
  address:
    per_second: 1
    burst_count: 30
  account:
    per_second: 0.5
    burst_count: 20

# Push nur ohne Inhalt; das Gateway ist die App selbst (internes Netz).
push:
  include_content: false
  group_unread_count_by_room: false
ip_range_whitelist: [${o.pushAllow.map(yamlStr).join(', ')}]

# Regeln der Plattform (Einladungen nur an Kontakte, Blockieren, Treffen-Räume, Einschränkungen)
modules:
  - module: kd_rules.KdRules
    config:
      url: ${yamlStr(internal + '/internal/chat/check')}
      secret: ${yamlStr(s('module'))}
      system_user: ${yamlStr('@kd-system:' + SERVER_NAME)}
      reauth_secret: ${yamlStr(s('reauth'))}
`;
}

const LOG_CONFIG = `version: 1
formatters:
  precise:
    format: '%(asctime)s - %(name)s - %(lineno)d - %(levelname)s - %(request)s - %(message)s'
handlers:
  console:
    class: logging.StreamHandler
    formatter: precise
loggers:
  synapse.storage.SQL:
    level: WARNING
  synapse.access.http:
    level: WARNING
root:
  level: WARNING
  handlers: [console]
disable_existing_loggers: false
`;

/** Ed25519-Signaturschlüssel im Synapse-Format, deterministisch aus APP_SECRET (ohne Föderation nur intern genutzt). */
export function signingKey(appSecret) {
	const seed = derive(appSecret, 'chat:signing');
	const id = 'a_' + createHash('sha256').update(seed).digest('hex').slice(0, 4);
	return `ed25519 ${id} ${seed.toString('base64').replace(/=+$/, '')}\n`;
}

async function writeIfChanged(file, content) {
	const old = existsSync(file) ? await readFile(file, 'utf8') : null;
	if (old === content) return false;
	await writeFile(file + '.tmp', content, { mode: 0o644 });
	await rename(file + '.tmp', file);
	return true;
}

export async function ensureSynapseDatabase(sql, name, owner) {
	const [exists] = await sql`select 1 as x from pg_database where datname = ${name}`;
	if (exists) return false;
	if (!/^[a-z_][a-z0-9_]*$/.test(name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(owner)) throw new Error('Ungültiger Datenbankname');
	await sql.unsafe(`create database ${name} with owner "${owner}" template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
	return true;
}

/** Wird aus migrate.mjs aufgerufen. Ohne SYNAPSE_CONFIG_DIR (z. B. Entwicklung) passiert nichts. */
export async function prepareSynapse(sql, env = process.env) {
	const configDir = env.SYNAPSE_CONFIG_DIR;
	if (!configDir) return null;
	const appSecret = env.APP_SECRET || '';
	const databaseUrl = env.DATABASE_URL;
	const dbName = env.SYNAPSE_DB || 'synapse';
	await mkdir(configDir, { recursive: true });
	const created = await ensureSynapseDatabase(sql, dbName, decodeURIComponent(new URL(databaseUrl).username));
	const cfg = buildConfig({
		appUrl: env.APP_URL || 'http://localhost:3000',
		appSecret,
		databaseUrl: env.SYNAPSE_DATABASE_URL || databaseUrl,
		dbName,
		configDir: env.SYNAPSE_CONFIG_PATH_IN_CONTAINER || configDir,
		mediaStore: env.SYNAPSE_MEDIA_STORE || '/data/media_store',
		port: Number(env.SYNAPSE_PORT || 8008),
		bind: env.SYNAPSE_BIND || '0.0.0.0',
		pidFile: env.SYNAPSE_PID_FILE || '/tmp/homeserver.pid',
		internalUrl: env.CHAT_INTERNAL_URL || 'http://web:3000',
		pushAllow: (env.SYNAPSE_PUSH_ALLOW || '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16').split(',').map((x) => x.trim()).filter(Boolean)
	});
	const module = await readFile(join(here, 'kd_rules.py'), 'utf8');
	const changed = [
		await writeIfChanged(join(configDir, 'homeserver.yaml'), cfg),
		await writeIfChanged(join(configDir, 'log.config'), LOG_CONFIG),
		await writeIfChanged(join(configDir, 'signing.key'), signingKey(appSecret)),
		await writeIfChanged(join(configDir, 'kd_rules.py'), module)
	].some(Boolean);
	console.log(`[chat] Synapse-Konfiguration ${changed ? 'aktualisiert' : 'unverändert'}${created ? ', Datenbank angelegt' : ''}.`);
	return { changed, created };
}
