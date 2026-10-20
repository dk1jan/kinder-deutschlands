// Bereitet den Chat-Server (Synapse) vor – läuft vor jedem Start der Web-App (aus migrate.mjs).
// Schreibt homeserver.yaml, Log-Konfiguration, Signaturschlüssel und das Regelmodul in SYNAPSE_CONFIG_DIR
// und legt die Datenbank „synapse“ (C-Sortierung, wie von Synapse verlangt) an. Nichts davon muss
// von Hand gepflegt werden; alle Geheimnisse werden aus APP_SECRET abgeleitet (HKDF, je Zweck eigener Schlüssel).
// Synapse startet sich selbst neu, sobald sich diese Dateien ändern (siehe deploy/docker-compose.yml).
import { hkdfSync, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

${o.turn ? `# Anrufe (Abschnitt 7): eigener TURN-Server (coturn), kurzlebige Zugangsdaten nur für angemeldete Konten
turn_uris: [${o.turn.uris.map(yamlStr).join(', ')}]
turn_shared_secret: ${yamlStr(s('turn'))}
turn_user_lifetime: 1h
turn_allow_guests: false

` : ''}# Regeln der Plattform (Einladungen nur an Kontakte, Blockieren, Treffen-Räume, Einschränkungen)
modules:
  - module: kd_rules.KdRules
    config:
      url: ${yamlStr(internal + '/internal/chat/check')}
      secret: ${yamlStr(s('module'))}
      system_user: ${yamlStr('@kd-system:' + SERVER_NAME)}
      reauth_secret: ${yamlStr(s('reauth'))}
`;
}

/** TURN-Einstellungen aus der Umgebung. Standard: Host aus APP_URL, Port 3479, Relais 49160–49200 (D-056). */
export function turnSettings(env = process.env) {
	if ((env.TURN_ENABLED ?? 'true') === 'false') return null;
	let host = env.TURN_HOST;
	if (!host) {
		try {
			host = new URL(env.APP_URL || '').hostname;
		} catch {
			host = '';
		}
	}
	if (!host || host === 'localhost') return null;
	const port = Number(env.TURN_PORT || 3479);
	const min = Number(env.TURN_MIN_PORT || 49160), max = Number(env.TURN_MAX_PORT || 49200);
	if (!(port > 0 && port < 65536 && min > 1024 && max >= min && max < 65536)) throw new Error('TURN-Ports ungültig.');
	return { host, port, min, max, externalIp: env.TURN_EXTERNAL_IP || '', uris: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`] };
}

/** coturn-Konfiguration: nur Relais für Anrufe, keine Weiterleitung in interne Netze, gemeinsames Geheimnis mit Synapse. */
export function buildTurnConfig(appSecret, t) {
	const denied = ['0.0.0.0-0.255.255.255', '10.0.0.0-10.255.255.255', '100.64.0.0-100.127.255.255', '127.0.0.0-127.255.255.255', '169.254.0.0-169.254.255.255', '172.16.0.0-172.31.255.255', '192.0.0.0-192.0.0.255', '192.0.2.0-192.0.2.255', '192.88.99.0-192.88.99.255', '192.168.0.0-192.168.255.255', '198.18.0.0-198.19.255.255', '198.51.100.0-198.51.100.255', '203.0.113.0-203.0.113.255', '240.0.0.0-255.255.255.255', '::1', '64:ff9b::-64:ff9b::ffff:ffff', '::ffff:0.0.0.0-::ffff:255.255.255.255', 'fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'];
	return `# Automatisch erzeugt von scripts/synapse-prepare.mjs – Änderungen hier werden beim nächsten Start überschrieben.
listening-port=${t.port}
min-port=${t.min}
max-port=${t.max}
${t.externalIp ? `external-ip=${t.externalIp}
` : ''}realm=${SERVER_NAME}
use-auth-secret
static-auth-secret=${chatSecret(appSecret, 'turn')}
fingerprint
no-tls
no-dtls
no-cli
no-multicast-peers
no-tcp-relay
user-quota=12
total-quota=400
stale-nonce=600
max-bps=2000000
pidfile=/tmp/turnserver.pid
log-file=stdout
simple-log
${denied.map((d) => `denied-peer-ip=${d}`).join('\n')}
`;
}

/** Gruppenanrufe (D-072): Medienserver LiveKit. Standard an; Ports 49210 UDP/TCP (neben TURN 49160–49200). */
export function livekitSettings(env = process.env) {
	if ((env.LIVEKIT_ENABLED ?? 'true') === 'false') return null;
	let host = '';
	try {
		host = new URL(env.APP_URL || '').hostname;
	} catch {
		host = '';
	}
	const udp = Number(env.LIVEKIT_UDP_PORT || 49210), tcp = Number(env.LIVEKIT_TCP_PORT || 49210);
	const max = Number(env.LIVEKIT_MAX_PARTICIPANTS || 25);
	if (![udp, tcp].every((p) => p > 1024 && p < 65536) || !(max >= 2 && max <= 200)) throw new Error('LiveKit-Einstellungen ungültig.');
	return { host, udp, tcp, max, nodeIp: env.LIVEKIT_NODE_IP || env.TURN_EXTERNAL_IP || '', apiKey: 'kd-app' };
}

/** Öffentliche Adresse für die Medienverbindungen: fest eingestellt, sonst DNS des APP_URL-Hosts (IPv4). Leer = per STUN ermitteln. */
export async function livekitNodeIp(l) {
	if (l.nodeIp) return l.nodeIp;
	if (!l.host) return '';
	if (l.host === 'localhost') return '127.0.0.1';
	if (isIP(l.host)) return l.host;
	try {
		return (await lookup(l.host, { family: 4 })).address;
	} catch {
		return '';
	}
}

/** LiveKit-Konfiguration: Räume legt nur die App an, Schlüssel aus APP_SECRET, eigener TURN-Server statt fremder STUN-Server. */
export function buildLivekitConfig(appSecret, l, nodeIp, turn) {
	const sec = chatSecret(appSecret, 'turn');
	const turnLines = turn
		? `  stun_servers: [${yamlStr(`${turn.host}:${turn.port}`)}]
  turn_servers:
    - { host: ${yamlStr(turn.host)}, port: ${turn.port}, protocol: udp, secret: ${yamlStr(sec)}, ttl: 3600 }
    - { host: ${yamlStr(turn.host)}, port: ${turn.port}, protocol: tcp, secret: ${yamlStr(sec)}, ttl: 3600 }
`
		: '';
	return `# Automatisch erzeugt von scripts/synapse-prepare.mjs – Änderungen hier werden beim nächsten Start überschrieben.
port: 7880
bind_addresses: ["0.0.0.0"]
rtc:
  udp_port: ${l.udp}
  tcp_port: ${l.tcp}
  use_external_ip: ${nodeIp ? 'false' : 'true'}
${nodeIp ? `  node_ip: ${yamlStr(nodeIp)}
` : ''}${turnLines}room:
  auto_create: false
  empty_timeout: 120
  departure_timeout: 20
  max_participants: ${l.max}
keys:
  ${yamlStr(l.apiKey)}: ${yamlStr(chatSecret(appSecret, 'livekit'))}
logging:
  level: warn
  pion_level: error
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
		pushAllow: (env.SYNAPSE_PUSH_ALLOW || '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16').split(',').map((x) => x.trim()).filter(Boolean),
		turn: turnSettings(env)
	});
	const turn = turnSettings(env);
	const module = await readFile(join(here, 'kd_rules.py'), 'utf8');
	const changed = [
		await writeIfChanged(join(configDir, 'homeserver.yaml'), cfg),
		await writeIfChanged(join(configDir, 'log.config'), LOG_CONFIG),
		await writeIfChanged(join(configDir, 'signing.key'), signingKey(appSecret)),
		await writeIfChanged(join(configDir, 'kd_rules.py'), module),
		turn ? await writeIfChanged(join(configDir, 'turnserver.conf'), buildTurnConfig(appSecret, turn)) : false
	].some(Boolean);
	const lk = livekitSettings(env);
	const lkIp = lk ? await livekitNodeIp(lk) : '';
	if (lk) await writeIfChanged(join(configDir, 'livekit.yaml'), buildLivekitConfig(appSecret, lk, lkIp, turn));
	console.log(`[chat] Synapse-Konfiguration ${changed ? 'aktualisiert' : 'unverändert'}${created ? ', Datenbank angelegt' : ''}${turn ? `, Anrufe über TURN ${turn.host}:${turn.port}` : ', ohne TURN'}${lk ? `, Gruppenanrufe über ${lkIp || 'STUN-Adresse'}:${lk.udp}` : ''}.`);
	return { changed, created };
}
