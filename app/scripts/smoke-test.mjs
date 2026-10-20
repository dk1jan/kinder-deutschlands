// End-to-End-Rauchtest gegen den gebauten Server und eine echte Datenbank.
// Ablauf wie ein Mensch im Browser (ohne JavaScript): Setup mit Einmal-Token → Erst-Admin mit 2FA →
// Setup gesperrt → Abmelden → Anmelden mit Passwort + Code → Adminseiten → Rechte, Theme, Header.
// Nutzung: TEST_DATABASE_URL=postgres://… node scripts/smoke-test.mjs   (Datenbank wird geleert!)
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';
import { readdirSync, readFileSync, rmSync, writeFileSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';

for (const ev of ['uncaughtException', 'unhandledRejection']) {
	process.on(ev, (e) => {
		console.error(e);
		if (process.env.GITHUB_ACTIONS) console.log(`::error title=Rauchtest abgebrochen::${String(e?.stack ?? e).replace(/\n/g, '%0A')}`);
		process.exit(1);
	});
}

const DB = process.env.TEST_DATABASE_URL;
if (!DB) throw new Error('TEST_DATABASE_URL fehlt');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const env = {
	...process.env,
	DATABASE_URL: DB,
	APP_URL: BASE,
	ORIGIN: BASE,
	APP_SECRET: 'smoke-test-secret-'.padEnd(48, 'x'),
	PORT: String(PORT),
	BACKUP_DIR: '/tmp/kd-smoke-backups',
	// Abschnitt 2: Zeitplan aus, externe Dienste als lokaler Nachbau (keine Netzanfragen im Test)
	SCHEDULER: 'off',
	TILES_DIR: '/tmp/kd-smoke-tiles',
	OVERPASS_URL: 'http://127.0.0.1:3998/overpass',
	VG250_URL: 'http://127.0.0.1:3998/vg250',
	PROTOMAPS_BUILDS_URL: 'http://127.0.0.1:3998/builds.json',
	PROTOMAPS_BUILD_BASE: 'http://127.0.0.1:3998/build/',
	PMTILES_BIN: '/tmp/kd-smoke-pmtiles',
	LGLN_WMS_URL: 'http://127.0.0.1:3998/lgln',
	IMPORT_ALLOW_LOCAL: '1',
	RETRY_WAIT_MS: '50',
	OVERPASS_PAUSE_MS: '0'
};

// ---------- Nachbau externer Dienste mit echten Ausschnitten (tests/fixtures, © OpenStreetMap-Mitwirkende / © BKG) ----------
const FX = new URL('../tests/fixtures/', import.meta.url).pathname;
const fx = (f) => readFileSync(join(FX, f), 'utf8');
let mockMode = 'voll';
let icsFeed = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
const mock = createServer((rq, rs) => {
	let body = '';
	rq.on('data', (c) => (body += c));
	rq.on('end', () => {
		const u = new URL(rq.url, 'http://x');
		const send = (t, type = 'application/json') => { rs.writeHead(200, { 'content-type': type }); rs.end(t); };
		if (u.pathname === '/overpass') {
			const q = decodeURIComponent(new URLSearchParams(body).get('data') ?? '');
			if (q.includes('"leisure"="playground"')) {
				const d = JSON.parse(fx('osm-spielplatz.json'));
				// „halb“: Hälfte der Spielplätze fehlt → Abruf muss als Vorschau warten
				if (mockMode === 'halb') { let i = 0; d.elements = d.elements.filter((e) => e.tags?.leisure !== 'playground' || i++ % 2 === 0); }
				return send(JSON.stringify(d));
			}
			if (q.includes('"amenity"="toilets"')) return send(fx('osm-toilette.json'));
			if (q.includes('"admin_level"="10"')) return send(fx('osm-stadtteile.json'));
			return send(JSON.stringify({ elements: [] }));
		}
		if (u.pathname === '/vg250') return send(fx(`${u.searchParams.get('typeNames').replace('vg250:', '')}.json`));
		if (u.pathname === '/lgln') { rs.writeHead(200, { 'content-type': 'image/jpeg' }); return rs.end(Buffer.alloc(4000, 7)); }
		if (u.pathname === '/kalender.ics') return send(icsFeed, 'text/calendar');
		if (u.pathname === '/builds.json') return send(JSON.stringify([{ key: '20261017.pmtiles' }, { key: '20261018.pmtiles' }]));
		rs.writeHead(404); rs.end();
	});
});
await new Promise((r) => mock.listen(3998, '127.0.0.1', r));
// Kachelprogramm-Nachbau: schreibt eine Testdatei (oder einen echten Ausschnitt, falls lokal vorhanden)
writeFileSync('/tmp/kd-smoke-pmtiles', `#!/bin/sh
out="$3"
if [ -f /tmp/kd-bremen.pmtiles ]; then cp /tmp/kd-bremen.pmtiles "$out"; else head -c 300000 /dev/urandom > "$out"; fi
`);
chmodSync('/tmp/kd-smoke-pmtiles', 0o755);
rmSync('/tmp/kd-smoke-tiles', { recursive: true, force: true });
mkdirSync('/tmp/kd-smoke-tiles', { recursive: true });

let failures = 0;
function check(cond, label) {
	console.log(`${cond ? 'OK  ' : 'FEHL'}  ${label}`);
	if (!cond) {
		failures++;
		// In GitHub Actions als Anmerkung sichtbar
		if (process.env.GITHUB_ACTIONS) console.log(`::error title=Rauchtest::${label}`);
	}
}

function b32decode(s) {
	const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = 0, value = 0;
	const out = [];
	for (const ch of s.replace(/[^A-Z2-7]/g, '')) {
		value = (value << 5) | A.indexOf(ch);
		bits += 5;
		if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
	}
	return Buffer.from(out);
}
function totp(secret, offset = 0) {
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
	const h = createHmac('sha1', b32decode(secret)).update(msg).digest();
	const o = h[h.length - 1] & 15;
	const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
	return String(bin % 1e6).padStart(6, '0');
}

// Jede „Person“ hat ihren eigenen Cookie-Speicher (wie ein eigener Browser)
function client() {
	const jar = new Map();
	const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	async function req(path, { method, form, json, headers = {} } = {}) {
		const res = await fetch(BASE + path, {
			method: method ?? (form || json !== undefined ? 'POST' : 'GET'),
			redirect: 'manual',
			headers: {
				cookie: cookieHeader(),
				origin: BASE,
				accept: json !== undefined ? 'application/json' : 'text/html',
				...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
				...(json !== undefined ? { 'content-type': 'application/json' } : {}),
				...headers
			},
			body: form ? new URLSearchParams(form).toString() : json !== undefined ? JSON.stringify(json) : undefined
		});
		for (const c of res.headers.getSetCookie()) {
			const [pair] = c.split(';');
			const [k, ...v] = pair.split('=');
			const val = v.join('=');
			if (!val || /max-age=0|expires=thu, 01 jan 1970/i.test(c)) jar.delete(k);
			else jar.set(k, val);
		}
		return { status: res.status, location: res.headers.get('location') ?? '', headers: res.headers, body: await res.text() };
	}
	return { jar, req, cookieHeader };
}
const admin = client();
const jar = admin.jar;
const req = admin.req;
const cookieHeader = admin.cookieHeader;

// Ausgehende E-Mails landen im Test als Dateien
const OUTBOX = '/tmp/kd-smoke-mail';
env.MAIL_OUTBOX_DIR = OUTBOX;
rmSync(OUTBOX, { recursive: true, force: true });
function lastMailTo(to) {
	let files = [];
	try { files = readdirSync(OUTBOX).sort(); } catch {}
	for (const f of files.reverse()) {
		const m = JSON.parse(readFileSync(join(OUTBOX, f), 'utf8'));
		if (m.to === to) return m;
	}
	return null;
}

// Abschnitt 4: echter Chat-Server (Synapse), wenn SYNAPSE_PYTHON gesetzt ist (CI: immer, siehe Workflow)
const SYN_PY = process.env.SYNAPSE_PYTHON;
if (!SYN_PY && process.env.SYNAPSE_REQUIRED) throw new Error('SYNAPSE_PYTHON fehlt – Chat-Test ist Pflicht.');
const SYN_DIR = '/tmp/kd-smoke-synapse';
const SYN_PORT = 8019;
if (SYN_PY) {
	rmSync(SYN_DIR, { recursive: true, force: true });
	Object.assign(env, {
		SYNAPSE_URL: `http://127.0.0.1:${SYN_PORT}`,
		SYNAPSE_CONFIG_DIR: `${SYN_DIR}/config`,
		SYNAPSE_DB: 'synapse_smoke',
		SYNAPSE_MEDIA_STORE: `${SYN_DIR}/media`,
		SYNAPSE_PORT: String(SYN_PORT),
		SYNAPSE_BIND: '127.0.0.1',
		SYNAPSE_PID_FILE: `${SYN_DIR}/homeserver.pid`,
		SYNAPSE_PUSH_ALLOW: '127.0.0.0/8',
		CHAT_INTERNAL_URL: BASE,
		PUSH_OUTBOX_DIR: '/tmp/kd-smoke-push',
		CHAT_JOBS: 'on',
		CHAT_JOBS_MS: '1500'
	});
	rmSync('/tmp/kd-smoke-push', { recursive: true, force: true });
}

const sql = postgres(DB, { max: 1, onnotice: () => {} });
await sql.unsafe('drop schema public cascade; create schema public;');
if (SYN_PY) await sql.unsafe('drop database if exists synapse_smoke with (force)');
await sql.end();

const migrateOut = execFileSync('node', ['scripts/migrate.mjs'], { env, encoding: 'utf8' });
const token = /Einmal-Token:\s+(\S+)/.exec(migrateOut)?.[1];
check(!!token, 'Migration gibt Einmal-Token aus');

let synapse = null;
let synapseLog = '';
if (SYN_PY) {
	synapse = spawn(SYN_PY, ['-m', 'synapse.app.homeserver', '-c', `${SYN_DIR}/config/homeserver.yaml`], {
		env: { ...process.env, PYTHONPATH: `${SYN_DIR}/config`, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
		stdio: ['ignore', 'pipe', 'pipe']
	});
	synapse.stdout.on('data', (d) => (synapseLog += d));
	synapse.stderr.on('data', (d) => (synapseLog += d));
}
const server = spawn('node', ['build'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 150; i++) {
	try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {}
	await new Promise((r) => setTimeout(r, 200));
}

try {
	let r = await req('/healthz');
	check(r.status === 200, 'Healthcheck /healthz');
	r = await req('/readyz');
	check(r.status === 200, 'Bereitschaft /readyz (Datenbank)');

	r = await req('/');
	check(r.status === 303 && r.location === '/setup', 'Vor der Einrichtung: Weiterleitung auf /setup');

	r = await req('/setup?/token', { method: 'POST', form: { token: 'falsch' } });
	check(r.status === 400, 'Falsches Setup-Token wird abgelehnt');

	r = await req('/setup?/token', { method: 'POST', form: { token } });
	check(r.status === 303 && jar.has('kd_setup'), 'Richtiges Token öffnet die Einrichtung');

	r = await req('/setup');
	const secret = /class="secret[^"]*">([A-Z2-7 ]+)</.exec(r.body)?.[1]?.replace(/ /g, '');
	check(r.status === 200 && !!secret && r.body.includes('Vorabprüfung'), 'Einrichtungsseite mit Vorabprüfung und 2FA-Schlüssel');

	r = await req('/setup?/konto', { method: 'POST', form: { email: 'admin@example.org', password: 'kurz', password2: 'kurz', code: '000000' } });
	check(r.status === 400 && r.body.includes('mindestens'), 'Zu kurzes Passwort und falscher Code werden abgelehnt');

	const pw = 'ein sehr gutes Passwort 2026';
	const setupCode = totp(secret);
	r = await req('/setup?/konto', { method: 'POST', form: { email: 'Admin@Example.org', password: pw, password2: pw, code: setupCode } });
	check(r.status === 303 && r.location.startsWith('/admin') && jar.has('kd_session'), 'Erst-Admin angelegt und angemeldet');

	r = await req('/admin');
	check(r.status === 200 && r.body.includes('Systemzustand'), 'Adminübersicht erreichbar');

	jar.delete('kd_setup');
	r = await req('/setup');
	check(r.status === 404, 'Einrichtung danach gesperrt (GET)');
	r = await req('/setup?/token', { method: 'POST', form: { token } });
	check(r.status === 404, 'Einrichtung danach gesperrt (POST mit altem Token)');

	r = await req('/profil?/abmelden', { method: 'POST', form: {} });
	check(r.status === 303 && !jar.has('kd_session'), 'Abmelden');

	r = await req('/admin');
	check(r.status === 303 && r.location.startsWith('/anmelden'), 'Ohne Anmeldung kein Adminzugang');

	r = await req('/anmelden?/anmelden', { method: 'POST', form: { email: 'admin@example.org', password: 'falsches Passwort!' } });
	check(r.status === 400, 'Falsches Passwort abgelehnt');

	r = await req('/anmelden?/anmelden&weiter=%2Fadmin', { method: 'POST', form: { email: 'admin@example.org', password: pw } });
	check(r.status === 303 && r.location.startsWith('/anmelden/code'), 'Passwort richtig → zweiter Faktor verlangt');

	r = await req('/admin');
	check(r.status === 303 && r.location.startsWith('/anmelden/code'), 'Vor dem zweiten Faktor kein Adminzugang');
	// D-066: Chat-Kennung (Salz) schon im Zwischenschritt abrufbar, damit der Schlüssel aus dem Passwort entsteht
	r = await req('/api/chat/salz', { json: {} });
	check(SYN_PY ? r.status === 200 && /^@[a-z0-9]+:kinder-deutschlands$/.test(JSON.parse(r.body).mxid ?? '') : r.status === 503, 'Chat-Salz im Zwei-Faktor-Zwischenschritt verfügbar');
	r = await client().req('/api/chat/salz', { json: {} });
	check(r.status === 401, 'Chat-Salz nur mit Sitzung');

	r = await req('/anmelden/code?/verify&weiter=%2Fadmin', { method: 'POST', form: { code: setupCode } });
	check(r.status === 400, 'Bereits verwendeter Code wird abgelehnt (Replay-Schutz)');

	r = await req('/anmelden/code?/verify&weiter=%2Fadmin', { method: 'POST', form: { code: totp(secret, 1) } });
	check(r.status === 303 && r.location === '/admin', 'Neuer Code → angemeldet');

	for (const p of ['/admin/nutzer', '/admin/rechte', '/admin/protokoll']) {
		r = await req(p);
		check(r.status === 200, `Adminseite ${p}`);
	}
	r = await req('/admin/protokoll');
	check(r.body.includes('setup.completed') && r.body.includes('login.failed'), 'Protokoll enthält Einrichtung und Fehlversuch');

	r = await req('/');
	check(r.status === 200 && !/<html[^>]*data-theme/.test(r.body), 'Startseite: Theme folgt dem System');
	r = await req('/profil/darstellung', { method: 'POST', form: { theme: 'dark' } });
	r = await req('/');
	check(/<html[^>]*data-theme="dark"/.test(r.body), 'Dunkel gespeichert und serverseitig gesetzt (kein Aufblitzen)');
	check(r.headers.get('x-robots-tag')?.includes('noindex') && r.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"),
		'Sicherheitsheader und noindex gesetzt');

	r = await fetch(BASE + '/admin/rechte?/vergeben', { method: 'POST', redirect: 'manual',
		headers: { cookie: cookieHeader(), origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1' });
	check(r.status === 403, 'Formular von fremder Herkunft wird blockiert (CSRF)');

	// ---------- Abschnitt 1: Mitglieder ----------
	r = await req('/admin/einstellungen');
	check(r.status === 200 && r.body.includes('Mailserver (SMTP)'), 'Admin: Einstellungsseite E-Mail-Versand');
	r = await req('/admin/einstellungen?/speichern', { method: 'POST', form: { host: '127.0.0.1', port: '2', user: 'noreply@example.org', password: 'Smoke-Geheimnis-42', from: 'noreply@example.org' } });
	check(r.status === 200 && r.body.includes('Gespeichert') && r.body.includes('nicht'), 'Admin: Mailserver gespeichert, Verbindungsfehler wird verständlich gemeldet');
	r = await req('/admin/einstellungen');
	check(r.body.includes('hier gespeichert') && !r.body.includes('Smoke-Geheimnis-42'), 'Admin: gespeicherter Mailserver aktiv, Passwort nie im HTML');
	r = await req('/admin/einstellungen?/speichern', { method: 'POST', form: { host: 'kein host', port: '587', from: 'x' } });
	check(r.status === 400, 'Admin: ungültige Mail-Einstellungen abgelehnt');
	r = await req('/admin/einstellungen?/zuruecksetzen', { method: 'POST', form: {} });
	check(r.status === 200, 'Admin: gespeicherte Mail-Einstellungen entfernt');
	r = await req('/admin?/testmail', { method: 'POST', form: {} });
	check(r.status === 200 && lastMailTo('admin@example.org')?.subject.includes('Test'), 'Admin: Test-E-Mail wird verschickt');

	const A = client();
	const B = client();
	const pwA = 'Mama sucht Spielplatzfreunde 1';
	const pwB = 'Papa mag lange Spaziergaenge 2';

	r = await A.req('/registrieren', { method: 'POST', form: { email: 'anna@example.org', password: pwA, password2: pwA } });
	check(r.status === 400 && r.body.includes('Erwachsene'), 'Registrierung ohne Volljährigkeit abgelehnt');
	r = await A.req('/registrieren', { method: 'POST', form: { email: 'anna@example.org', password: pwA, password2: pwA, adult: 'on' } });
	check(r.status === 200 && r.body.includes('Fast geschafft'), 'Registrierung: Bestätigungs-E-Mail angekündigt');
	let mail = lastMailTo('anna@example.org');
	const verifyLink = /https?:\/\/\S+\/registrieren\/bestaetigen\?t=(\S+)/.exec(mail?.text ?? '');
	check(!!verifyLink, 'Bestätigungs-E-Mail mit Link verschickt');

	r = await A.req('/anmelden?/anmelden', { method: 'POST', form: { email: 'anna@example.org', password: pwA } });
	check(r.status === 403 && r.body.includes('bestätige'), 'Anmeldung vor E-Mail-Bestätigung abgelehnt');

	r = await A.req(`/registrieren/bestaetigen?t=${verifyLink?.[1]}`);
	check(r.status === 200 && r.body.includes('Konto freischalten'), 'Bestätigungsseite löst nicht schon beim Öffnen aus');
	r = await A.req('/registrieren/bestaetigen', { method: 'POST', form: { t: verifyLink?.[1] ?? '' } });
	check(r.status === 303 && r.location.startsWith('/profil') && A.jar.has('kd_session'), 'E-Mail bestätigt, angemeldet');
	r = await A.req('/registrieren/bestaetigen', { method: 'POST', form: { t: verifyLink?.[1] ?? '' } });
	check(r.status === 400, 'Bestätigungslink nur einmal gültig');

	r = await A.req('/registrieren', { method: 'POST', form: { email: 'anna@example.org', password: pwA, password2: pwA, adult: 'on' } });
	mail = lastMailTo('anna@example.org');
	check(r.status === 303 || (r.status === 200 && mail?.subject.includes('schon ein Konto')), 'Doppelte Registrierung verrät nichts, Mail „schon ein Konto“');

	r = await A.req('/profil');
	const annaId = /aria-label="Familien-ID ([^"]+)"/.exec(r.body)?.[1]?.replace(/ /g, '');
	check(r.status === 200 && !!annaId && annaId.length === 9 && r.body.includes('QR-Code zur Kontaktkarte'), 'Profil zeigt Familien-ID mit QR-Code');
	check(!r.body.includes('anna@example.org'), 'Profilseite enthält die E-Mail-Adresse nicht (auch nicht in Seitendaten)');

	r = await A.req('/profil/bearbeiten', { method: 'POST', form: {
		display_name: 'Anna', can_help: 'Tipps zum Kita-Antrag', looking_for: 'Spielplatzbekanntschaften', interests: 'Radfahren, Basteln',
		child_ages: '1-3', region_code: '04011', discoverable: 'on', preset: 'zurueckhaltend'
	} });
	check(r.status === 303 && r.location.startsWith('/profil/vorschau'), 'Profil gespeichert');
	r = await A.req('/profil/bearbeiten', { method: 'POST', form: { display_name: 'Anna 0421123456', preset: 'zurueckhaltend' } });
	check(r.status === 400, 'Telefonnummer im Anzeigenamen abgelehnt');

	r = await A.req('/profil/qr');
	const qrToken = /\/k\/([A-Za-z0-9_-]{10,40})/.exec(r.body)?.[1];
	check(r.status === 200 && !!qrToken, 'QR-Seite mit aktivem Code');

	// Externe Person scannt den QR-Code
	const X = client();
	r = await X.req(`/k/${qrToken}`);
	check(r.status === 200 && !r.body.includes('>Anna<') && !r.body.includes('Kita-Antrag') && r.body.includes('Anmelden und anfragen'),
		'QR ohne Anmeldung: nur ID, kein Name, keine Angaben (zurückhaltend)');
	check((r.headers.get('cache-control') ?? '').includes('no-store'), 'QR-Kontaktkarte wird nicht zwischengespeichert');

	// Zweites Mitglied
	r = await B.req('/registrieren', { method: 'POST', form: { email: 'ben@example.org', password: pwB, password2: pwB, adult: 'on' } });
	const vB = /bestaetigen\?t=(\S+)/.exec(lastMailTo('ben@example.org')?.text ?? '')?.[1];
	r = await B.req('/registrieren/bestaetigen', { method: 'POST', form: { t: vB ?? '' } });
	check(r.status === 303 && B.jar.has('kd_session'), 'Zweites Mitglied registriert und bestätigt');

	r = await B.req(`/k/${qrToken}`);
	check(r.status === 200 && r.body.includes('Anna') && !r.body.includes('Kita-Antrag') && r.body.includes('Kontakt anfragen'),
		'QR als Mitglied: Name sichtbar, Details nur für Kontakte');

	r = await B.req(`/nachrichten/familie?id=${annaId.toLowerCase()}`);
	check(r.status === 200 && r.body.includes('Anna'), 'ID-Suche findet Familie (Kleinschreibung toleriert)');
	r = await B.req('/nachrichten/familie?id=AAA-AAA-AAA');
	check(r.status === 200 && r.body.includes('keine gültige Familien-ID'), 'Ungültige ID wird erkannt');

	r = await B.req(`/k/${qrToken}?/anfragen`, { method: 'POST', form: { message: 'Hallo vom Spielplatz' } });
	check(r.status === 200 && r.body.includes('Anfrage gesendet'), 'Kontaktanfrage über QR gesendet');

	r = await A.req('/nachrichten?ansicht=kontakte');
	const reqId = /name="id" value="([0-9a-f-]{36})"/.exec(r.body)?.[1];
	check(r.body.includes('Hallo vom Spielplatz') && !!reqId, 'Anfrage kommt mit Nachricht an');
	r = await A.req('/nachrichten?/annehmen', { method: 'POST', form: { id: reqId ?? '' } });
	check(r.status === 200 && r.body.includes('verbunden'), 'Anfrage angenommen');

	r = await B.req(`/k/${qrToken}`);
	check(r.body.includes('Kita-Antrag') && r.body.includes('Ihr seid verbunden'), 'Als Kontakt sichtbar: freigegebene Details');

	// Widerruf
	r = await A.req('/profil/qr?/ersetzen', { method: 'POST', form: {} });
	r = await X.req(`/k/${qrToken}`);
	check(r.status === 404, 'Ersetzter QR-Code zeigt nichts mehr');

	// Blockieren
	r = await A.req('/nachrichten?ansicht=kontakte');
	const benCid = /name="cid" value="([0-9A-Z]{9})"/.exec(r.body)?.[1];
	r = await A.req('/nachrichten?/blockieren', { method: 'POST', form: { cid: benCid ?? '' } });
	check(r.status === 200 && r.body.includes('Blockiert'), 'Kontakt blockiert');
	r = await B.req(`/nachrichten/familie?id=${annaId}`);
	check(r.body.includes('Nicht gefunden'), 'Blockierte Familie findet die ID nicht mehr');

	// Rechte: normales Mitglied kommt nicht in die Verwaltung
	r = await B.req('/admin');
	check(r.status === 403, 'Mitglied ohne Rolle: Verwaltung gesperrt (403)');

	// Passwort vergessen
	r = await B.req('/profil?/abmelden', { method: 'POST', form: {} });
	r = await B.req('/passwort-vergessen', { method: 'POST', form: { email: 'ben@example.org' } });
	const resetT = /passwort-neu\?t=(\S+)/.exec(lastMailTo('ben@example.org')?.text ?? '')?.[1];
	check(r.status === 200 && !!resetT, 'Passwort-vergessen-Mail mit Link');
	r = await B.req('/passwort-vergessen', { method: 'POST', form: { email: 'niemand@example.org' } });
	check(r.status === 200 && r.body.includes('Wenn es zu dieser Adresse ein Konto gibt'), 'Unbekannte Adresse: gleiche Antwort');
	const newPw = 'Ganz neues Passwort 2026';
	r = await B.req('/passwort-neu', { method: 'POST', form: { t: resetT ?? '', password: newPw, password2: newPw } });
	check(r.status === 303 && r.location.startsWith('/anmelden'), 'Neues Passwort gesetzt');
	r = await B.req('/anmelden?/anmelden', { method: 'POST', form: { email: 'ben@example.org', password: newPw } });
	check(r.status === 303 && r.location === '/profil', 'Anmeldung mit neuem Passwort');

	// Export und Löschen
	r = await B.req('/profil/konto/export');
	check(r.status === 200 && (r.headers.get('content-disposition') ?? '').includes('attachment') && r.body.includes('ben@example.org') && !r.body.includes('anna@example.org'),
		'Datenexport enthält eigene, keine fremden E-Mail-Adressen');
	r = await B.req('/profil/konto?/loeschen', { method: 'POST', form: { current: newPw, confirm: 'löschen' } });
	check(r.status === 303 && !B.jar.has('kd_session'), 'Konto gelöscht und abgemeldet');
	r = await B.req('/anmelden?/anmelden', { method: 'POST', form: { email: 'ben@example.org', password: newPw } });
	check(r.status === 400, 'Gelöschtes Konto kann sich nicht anmelden');

	// ---------- Abschnitt 2: Karte, Orte, Datenzentrale ----------
	const sqlT = postgres(DB, { max: 1, onnotice: () => {} });
	async function runAndWait(key) {
		const before = (await sqlT`select coalesce(max(id), 0)::int as m from import_runs where source_key = ${key}`)[0].m;
		const rr = await req('/admin/daten?/starten', { method: 'POST', form: { key } });
		for (let i = 0; i < 120; i++) {
			const [x] = await sqlT`select id, status, counts, message from import_runs where source_key = ${key} and id > ${before} order by id desc limit 1`;
			if (x && x.status !== 'laeuft') return { http: rr.status, run: x };
			await new Promise((res) => setTimeout(res, 250));
		}
		return { http: rr.status, run: null };
	}
	r = await req('/admin/daten');
	check(r.status === 200 && r.body.includes('Verwaltungsgebiete (VG250)') && r.body.includes('Spielplätze'), 'Datenzentrale zeigt Quellenkatalog');
	// Testausschnitt enthält nur das Land Bremen
	await sqlT`update data_sources set config = jsonb_set(config, '{laender}', '["04"]') where key = 'bkg-vg250'`;
	let res = await runAndWait('bkg-vg250');
	check(res.run?.status === 'uebernommen' && res.run.counts.kreise === 2, `Regionen-Import VG250 (${res.run?.message ?? res.run?.status})`);
	res = await runAndWait('osm-stadtteile-hb');
	check(res.run?.status === 'uebernommen' && res.run.counts.stadtteile >= 20, `Stadtteile Bremen/Bremerhaven aus OSM (${res.run?.message ?? res.run?.status})`);
	res = await runAndWait('osm-spielplaetze');
	const nPlay = res.run?.counts?.neu ?? 0;
	check(res.run?.status === 'uebernommen' && nPlay >= 10, `Spielplätze importiert (${nPlay} neu)`);
	res = await runAndWait('osm-toiletten');
	check(res.run?.status === 'uebernommen' && (res.run.counts.neu ?? 0) >= 3, `Toiletten importiert (${res.run?.counts?.neu ?? 0})`);
	const [findorff] = await sqlT`select count(*)::int as n from places p join regions r on r.code = p.region_code where r.name = 'Findorff' and r.level = 'stadtteil'`;
	check(findorff.n > 0, `Orte sind Stadtteilen zugeordnet (Findorff: ${findorff.n})`);
	res = await runAndWait('osm-spielplaetze');
	check(res.run?.status === 'uebernommen' && res.run.counts.neu === 0 && res.run.counts.unveraendert === nPlay, 'Zweiter Abruf erkennt: nichts geändert');
	res = await runAndWait('protomaps-karte');
	check(res.run?.status === 'uebernommen', `Kartenkacheln geladen (${res.run?.message ?? res.run?.status})`);
	let t = await fetch(BASE + '/kacheln/basis.pmtiles', { headers: { range: 'bytes=0-99' } });
	check(t.status === 206 && (await t.arrayBuffer()).byteLength === 100 && t.headers.get('content-range')?.startsWith('bytes 0-99/'), 'Kacheln mit HTTP-Range ausgeliefert');
	t = await fetch(BASE + '/kacheln/anderes.pmtiles', { headers: { range: 'bytes=0-9' } });
	check(t.status === 404, 'Nur die eine Kacheldatei ist abrufbar');

	t = await fetch(BASE + '/luftbild/14/8592/5331.jpg');
	check(t.status === 200 && t.headers.get('content-type') === 'image/jpeg' && (await t.arrayBuffer()).byteLength === 4000, 'Luftbildkachel über eigenen Server');
	t = await fetch(BASE + '/luftbild/14/0/0.jpg');
	check(t.status === 200 && t.headers.get('content-type') === 'image/png', 'Außerhalb des Gebiets: durchsichtige Kachel');
	r = await req('/admin/einstellungen');
	check(r.body.includes('Luftbild auf der Karte') && r.body.includes('LGLN'), 'Einstellungen: Luftbild-Anbieter sichtbar');
	r = await req('/admin/einstellungen?/luftbild', { method: 'POST', form: { esri_key: 'kurz' } });
	check(r.status === 400, 'Ungültiger Esri-Schlüssel abgelehnt');

	t = await fetch(BASE + '/api/orte?bbox=8.77,53.08,8.85,53.11');
	const fc = await t.json();
	check(t.status === 200 && fc.features.length > 0 && fc.features.every((f) => f.properties.id && f.properties.k), `Kartenpunkte als GeoJSON (${fc.features.length})`);
	t = await fetch(BASE + '/api/orte?bbox=0,40,20,60');
	check(t.status === 400, 'Zu großer Kartenausschnitt abgelehnt');
	t = await fetch(BASE + '/api/orte?bbox=8.77,53.08,8.85,53.11&k=toilette');
	const onlyToilets = await t.json();
	check(onlyToilets.features.every((f) => f.properties.k === 'toilette'), 'Filter nach Art wirkt');
	t = await fetch(BASE + '/api/orte/suche?q=Findorff');
	const sr = await t.json();
	check(sr.regions.some((x) => x.name === 'Findorff'), 'Suche findet Stadtteil');
	t = await fetch(BASE + '/api/regionen?q=Find');
	check((await t.json()).some((x) => x.name === 'Findorff'), 'Regionssuche fürs Profil');

	const X2 = client();
	r = await X2.req('/karte');
	check(r.status === 200 && r.body.includes('Familienkarte') && r.body.includes('/orte/'), 'Karte öffentlich, mit Liste ohne JavaScript');
	const pid = fc.features.find((f) => f.properties.k === 'spielplatz').properties.id;
	r = await X2.req(`/orte/${pid}`);
	check(r.status === 200 && r.body.includes('OpenStreetMap') && r.body.includes('Quelle und Aktualität') && r.body.includes('Noch keine Erfahrungen'), 'Ortsseite mit Quelle, Aktualität, ehrlich ohne Bewertungen');
	r = await X2.req('/orte/00000000-0000-0000-0000-000000000000');
	check(r.status === 404, 'Unbekannter Ort: 404');
	r = await X2.req('/karte/quellen');
	check(r.status === 200 && r.body.includes('Open Database License'), 'Quellenseite mit Lizenzen');
	r = await X2.req(`/orte/${pid}?/merken`, { method: 'POST', form: {} });
	check(r.status === 303 && r.location.startsWith('/anmelden'), 'Merken nur angemeldet');

	r = await A.req(`/orte/${pid}?/merken`, { method: 'POST', form: {} });
	r = await A.req('/profil/orte');
	check(r.body.includes(`/orte/${pid}`), 'Ort gemerkt, in „Meine Orte“');
	r = await A.req(`/orte/${pid}?/melden`, { method: 'POST', form: { kind: 'defekt', message: 'Rutsche abgesperrt' } });
	check(r.status === 200, 'Meldung „defekt“ gesendet');
	r = await X2.req(`/orte/${pid}`);
	check(r.body.includes('unbestätigt') && !r.body.includes('Rutsche abgesperrt'), 'Defekt sofort als unbestätigter Hinweis sichtbar, Freitext nicht öffentlich');
	r = await req('/admin/daten/pruefung');
	check(r.body.includes('Rutsche abgesperrt'), 'Redaktion sieht die Meldung mit Text');
	const [rep] = await sqlT`select id from place_reports where place_id = ${pid}`;
	r = await req('/admin/daten/pruefung?/meldung', { method: 'POST', form: { id: rep.id, decision: 'erledigt', notice: 'amtlich', text: 'Gesperrt bis Reparatur', source_url: 'https://www.bremen.de/' } });
	r = await X2.req(`/orte/${pid}`);
	check(r.body.includes('Amtliche Meldung') && r.body.includes('Gesperrt bis Reparatur'), 'Redaktion bestätigt als amtliche Meldung');

	const [one] = await sqlT`select ST_X(location) as lon, ST_Y(location) as lat from places where id = ${pid}`;
	r = await A.req('/orte/neu', { method: 'POST', form: { kind: 'spielplatz', lon: String(one.lon + 0.0001), lat: String(one.lat), name: 'Smoke-Spielplatz' } });
	check(r.status === 409 && r.body.includes('Gibt es den Ort schon?'), 'Vorschlag: Dublette in der Nähe wird angezeigt');
	r = await A.req('/orte/neu', { method: 'POST', form: { kind: 'spielplatz', lon: String(one.lon + 0.0001), lat: String(one.lat), name: 'Smoke-Spielplatz', bestaetigt: 'ja', features: 'wasserspiel' } });
	const sugg = r.location.replace('/orte/', '');
	check(r.status === 303 && r.location.startsWith('/orte/'), 'Vorschlag gespeichert');
	r = await X2.req(`/orte/${sugg}`);
	check(r.status === 404, 'Vorschlag vor Freigabe nicht öffentlich');
	r = await req('/admin/daten/pruefung?/vorschlag', { method: 'POST', form: { id: sugg, decision: 'ja' } });
	r = await X2.req(`/orte/${sugg}`);
	check(r.status === 200 && r.body.includes('Smoke-Spielplatz') && r.body.includes('Von Mitgliedern'), 'Nach Freigabe öffentlich, als Mitglieder-Eintrag gekennzeichnet');

	r = await req(`/admin/daten/ort/${pid}?/speichern`, { method: 'POST', form: { kind: 'spielplatz', name: 'Redaktionsname', status: 'aktiv', confirmation: 'redaktion' } });
	check(r.status === 200 && r.body.includes('gesperrt'), 'Redaktion ändert Namen – Feld gesperrt');
	mockMode = 'halb';
	res = await runAndWait('osm-spielplaetze');
	check(res.run?.status === 'vorschau' && /entfernt/.test(res.run.message ?? ''), 'Viele verschwundene Einträge: Abruf wartet auf Freigabe');
	r = await req(`/admin/daten/lauf/${res.run?.id}`);
	check(r.status === 200 && r.body.includes('Nicht mehr in der Quelle'), 'Vorschau zeigt verschwundene Einträge');
	r = await req(`/admin/daten/lauf/${res.run?.id}?/verwerfen`, { method: 'POST', form: {} });
	const [{ arch }] = await sqlT`select count(*)::int as arch from places where status = 'archiviert'`;
	check(arch === 0, 'Verworfen: nichts archiviert');
	mockMode = 'voll';
	res = await runAndWait('osm-spielplaetze');
	const [named] = await sqlT`select name from places where id = ${pid}`;
	check(named.name === 'Redaktionsname', 'Gesperrter Name bleibt nach erneutem Import');
	r = await A.req('/admin/daten');
	check(r.status === 403, 'Mitglied ohne Rolle: Datenzentrale gesperrt');
	// ---------- Abschnitt 3: Community, Gruppen, Moderation, Bewertungen ----------
	r = await X2.req('/community');
	check(r.status === 200 && !r.body.includes('Spielgruppe in Findorff'), 'Community ohne Anmeldung: nur Hinweis, keine Inhalte');
	r = await A.req('/community/neu', { method: 'POST', form: { kind: 'frage', title: 'Welche Spielgruppe in Findorff?', body: 'Wir suchen etwas für **Einjährige**.', topic: 'betreuung', region_code: '04011', tags: 'spielgruppe' } });
	const postPath = r.location;
	check(r.status === 303 && /^\/community\/b\/[0-9a-f-]{36}$/.test(postPath), `Mitglied schreibt Frage (${r.status} ${r.location})`);
	const postId = postPath.split('/').pop();
	r = await X2.req(postPath);
	check(!r.body.includes('Einjährige'), 'Beitrag für Gäste nicht lesbar');
	r = await A.req(postPath);
	check(r.status === 200 && r.body.includes('<strong>Einjährige</strong>'), 'Beitrag mit Formatierung sichtbar');
	r = await A.req('/community/neu', { method: 'POST', form: { kind: 'beitrag', title: 'Ruft mich gerne an', body: 'Meine Nummer: 0151 23456789', topic: 'lokale-hilfe' } });
	check(r.status === 303 && r.location.includes('pruefung=1'), 'Telefonnummer im Beitrag → zurückgehalten zur Prüfung');

	const C = client();
	const pwC = 'Cem fragt viel nach Kitas 3';
	await C.req('/registrieren', { method: 'POST', form: { email: 'cem@example.org', password: pwC, password2: pwC, adult: 'on' } });
	const vC = /bestaetigen\?t=(\S+)/.exec(lastMailTo('cem@example.org')?.text ?? '')?.[1];
	await C.req('/registrieren/bestaetigen', { method: 'POST', form: { t: vC ?? '' } });
	r = await C.req(`${postPath}?/antworten`, { method: 'POST', form: { body: 'Die Krabbelgruppe im Bürgerhaus ist toll.' } });
	check(r.status === 200 && (await A.req(postPath)).body.includes('Krabbelgruppe im Bürgerhaus'), 'Antwort geschrieben und sichtbar');
	r = await C.req('/community?ansicht=neu&q=Spielgruppe');
	check(r.body.includes('Welche Spielgruppe in Findorff?'), 'Suche findet den Beitrag');
	r = await C.req(`${postPath}?/melden`, { method: 'POST', form: { type: 'post', id: postId, reason: 'falsch', message: 'Test-Meldung' } });
	check(r.status === 200, 'Beitrag gemeldet');
	r = await req('/admin/moderation');
	check(r.status === 200 && r.body.includes('Welche Spielgruppe') && r.body.includes('Ruft mich gerne an'), 'Moderation: Meldung und zurückgehaltener Beitrag in der Warteschlange');
	const [held] = await sqlT`select c.id from mod_cases c join posts p on p.id::text = c.target_id::text where p.title = 'Ruft mich gerne an' and c.status <> 'erledigt'`;
	r = await req(`/admin/moderation/${held?.id}?/entscheiden`, { method: 'POST', form: { action: 'entfernen', reason: '' } });
	check(r.status === 400, 'Entscheidung ohne Begründung abgelehnt');
	r = await req(`/admin/moderation/${held?.id}?/entscheiden`, { method: 'POST', form: { action: 'entfernen', reason: 'Keine Telefonnummern öffentlich – bitte Familien-ID nutzen' } });
	check(r.status === 200 || r.status === 303, `Moderation entscheidet mit Begründung (${r.status})`);
	r = await A.req('/profil/mitteilungen');
	check(r.body.includes('Familien-ID nutzen'), 'Autorin erhält Begründung als Mitteilung');

	r = await req('/admin/gruppen');
	check(r.status === 200, 'Admin: Gruppenverwaltung');
	r = await C.req('/community/gruppen');
	check(r.status === 200, 'Gruppenübersicht');
	const [{ id: gid }] = await sqlT`insert into community_groups (slug, name, description, kind, created_by) values ('smoke-geschuetzt', 'Smoke geschützt', 'Geschützte Testgruppe', 'geschuetzt', (select id from users where email = 'admin@example.org')) returning id`;
	r = await C.req('/community/g/smoke-geschuetzt?/beitreten', { method: 'POST', form: { pseudonym: 'Eule' } });
	check(r.status === 200, `Aufnahmeantrag mit Pseudonym (${r.status})`);
	const [gm] = await sqlT`select status, pseudonym from group_members where group_id = ${gid}`;
	check(gm?.status === 'angefragt' && gm.pseudonym === 'Eule', 'Mitgliedschaft wartet auf Freigabe');

	r = await C.req(`/orte/${pid}?/bewerten`, { method: 'POST', form: { stars: '4', body: 'Viel Schatten, sauberer Sand.' } });
	check(r.status === 200, `Ort bewertet (${r.status})`);
	r = await X2.req(`/orte/${pid}`);
	check(r.body.includes('Viel Schatten') && !r.body.includes('cem@example.org'), 'Bewertung öffentlich am Ort, ohne Kontaktdaten');
	r = await C.req('/community/wissen');
	check(r.status === 200, 'Wissensbereich erreichbar');
	r = await C.req('/admin/moderation');
	check(r.status === 403, 'Mitglied ohne Rolle: Moderation gesperrt');

	// ---------- Abschnitt 5: Veranstaltungen, Einrichtungen, freie Plätze, Hinweise, Merkliste, Radar ----------
	const [fdf] = await sqlT`select code from regions where name = 'Findorff' and level = 'stadtteil' limit 1`;
	const berlinDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
	let satT = new Date(Date.now() + 8 * 86_400_000);
	while (new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(satT) !== 'Sat') satT = new Date(satT.getTime() + 86_400_000);
	const satDay = berlinDay(satT);
	r = await X2.req('/veranstaltungen');
	check(r.status === 200 && r.body.includes('Keine Termine gefunden') && r.body.includes('nichts Erfundenes'), 'Veranstaltungen öffentlich, ehrlich leer');
	r = await A.req('/einrichtungen/antrag', { form: { name: 'Smoke-Familienzentrum', kind: 'familienzentrum', description: 'Offener Treff', region_code: fdf.code, role: 'Leitung', proof: 'Rückruf über die Nummer der Webseite', ok: 'on' } });
	check(r.status === 200 && r.body.includes('Antrag eingegangen'), 'Einrichtung beantragt');
	r = await X2.req('/einrichtungen');
	check(r.status === 200 && !r.body.includes('Smoke-Familienzentrum'), 'Vor der Prüfung nicht öffentlich');
	r = await req('/admin/einrichtungen');
	const [orgRow] = await sqlT`select id, slug from organizations where name = 'Smoke-Familienzentrum'`;
	check(r.status === 200 && r.body.includes('Rückruf über die Nummer der Webseite'), 'Verwaltung sieht Antrag mit Prüfweg');
	r = await req('/admin/einrichtungen?/entscheiden', { form: { id: orgRow.id, decision: 'ja', note: 'Rückruf bestätigt' } });
	check(r.status === 200 && r.body.includes('Verifiziert'), 'Einrichtung verifiziert');
	r = await X2.req('/einrichtungen');
	check(r.body.includes('Smoke-Familienzentrum'), 'Verifizierte Einrichtung öffentlich gelistet');
	r = await A.req('/veranstaltungen/neu');
	check(r.status === 200 && r.body.includes(`org:${orgRow.id}`), 'Termin eintragen: als Einrichtung möglich');
	r = await A.req('/veranstaltungen/neu', { form: [['owner', `org:${orgRow.id}`], ['title', 'Smoke-Flohmarkt'], ['kind', 'flohmarkt'], ['start', `${satDay}T10:00`], ['end', `${satDay}T13:00`], ['repeat', 'woechentlich'], ['region_code', fdf.code], ['address', 'Bürgerhaus'], ['cost', 'frei'], ['visibility', 'oeffentlich'], ['topics', 'freizeit'], ['age_min', '0'], ['age_max', '10']] });
	const evPath = r.location.split('?')[0];
	check(r.status === 303 && /^\/veranstaltungen\/[0-9a-f-]{36}$/.test(evPath), `Einrichtungstermin angelegt (${r.status})`);
	r = await X2.req('/veranstaltungen?zeitraum=30');
	check(r.body.includes('Smoke-Flohmarkt') && r.body.includes('Smoke-Familienzentrum') && r.body.includes('kostenlos'), 'Termin öffentlich in der Liste, mit Veranstalter');
	r = await X2.req(`/veranstaltungen?ansicht=kalender&monat=${satDay.slice(0, 7)}`);
	check(r.status === 200 && r.body.includes('Smoke-Flohmarkt'), 'Kalenderansicht');
	r = await X2.req('/veranstaltungen?ansicht=karte');
	check(r.status === 200, 'Kartenansicht');
	r = await X2.req(`${evPath}?am=${satDay}`);
	check(r.status === 200 && r.body.includes('verifizierte Einrichtung') && r.body.includes('jeden Samstag'), 'Terminseite mit Herkunft und Wiederholung');
	t = await fetch(`${BASE}${evPath}/ics`);
	const evIcs = await t.text();
	check(t.headers.get('content-type')?.startsWith('text/calendar') && evIcs.includes('RRULE:FREQ=WEEKLY') && evIcs.includes('TZID=Europe/Berlin'), 'Termin als Kalenderdatei (Reihe)');
	r = await X2.req('/veranstaltungen/heute');
	check(r.status === 200 && r.body.includes('Was machen wir heute?'), '„Was machen wir heute?“');
	r = await C.req('/veranstaltungen/neu', { form: { owner: 'ich', title: 'Spielplatztreff Smoke', kind: 'treffen', start: `${satDay}T15:00`, region_code: fdf.code, visibility: 'oeffentlich' } });
	const memberEv = r.location.split('?')[0];
	check(r.status === 303, 'Mitglied trägt Termin ein');
	r = await X2.req(memberEv);
	check(r.status === 303 && r.location.startsWith('/anmelden'), 'Mitgliedstermin nicht öffentlich (nur angemeldet)');
	r = await A.req(memberEv);
	check(r.status === 200 && r.body.includes('Von einem Mitglied eingetragen'), 'Mitgliedstermin gekennzeichnet');
	r = await C.req(`${evPath}?/merken`, { form: { am: satDay, serie: '1' } });
	r = await C.req(`${evPath}?/teilnahme`, { form: { am: satDay, status: 'komme_mit', show_me: 'on' } });
	r = await C.req('/profil/merkliste');
	check(r.body.includes('Smoke-Flohmarkt'), 'Termin gemerkt, in der Merkliste');
	r = await C.req('/profil/merkliste?/kalender', { form: {} });
	const feedPath = /https?:\/\/[^"<\s]+(\/kalender\/[A-Za-z0-9_-]+\.ics)/.exec(r.body)?.[1];
	t = await fetch(BASE + (feedPath ?? '/kalender/x.ics'));
	check(t.status === 200 && (await t.text()).includes('SUMMARY:Smoke-Flohmarkt'), 'Persönlicher Kalender-Link liefert gemerkte Termine');
	r = await A.req(`${evPath}?/absagen`, { form: { scope: 'tag', am: satDay, note: 'Regen' } });
	check(r.status === 200 && r.body.includes('Abgesagt.'), 'Einzeltermin abgesagt');
	r = await C.req('/profil/mitteilungen');
	check(r.body.includes('Abgesagt: „Smoke-Flohmarkt“'), 'Wer gemerkt/zugesagt hat, wird benachrichtigt');
	r = await X2.req('/hinweise');
	check(r.body.includes('Abgesagt: Smoke-Flohmarkt') && r.body.includes('Anbieterinformation'), 'Absage erscheint als Hinweis mit Herkunft');

	r = await A.req(`/einrichtungen/verwalten/${orgRow.slug}?/angebot`, { form: { title: 'Smoke-Babyschwimmen', kind: 'babyschwimmen', schedule_text: 'dienstags 10 Uhr', age_min: '0', age_max: '1' } });
	check(r.status === 200 && r.body.includes('Angebot angelegt'), 'Angebot angelegt');
	const [offer] = await sqlT`select id from offers where title = 'Smoke-Babyschwimmen'`;
	r = await X2.req(`/angebote/${offer.id}`);
	check(r.body.includes('Verfügbarkeit unbekannt'), 'Ohne Bestätigung: „Verfügbarkeit unbekannt“');
	r = await A.req(`/einrichtungen/verwalten/${orgRow.slug}?/verfuegbarkeit`, { form: { id: offer.id, availability: 'frei', places: '2', days: '7' } });
	r = await X2.req('/angebote?frei=1');
	check(r.body.includes('Smoke-Babyschwimmen') && r.body.includes('Plätze frei') && r.body.includes('gilt bis'), 'Freie Plätze mit Stand und Gültigkeit');
	r = await X2.req(`/angebote/${offer.id}?/verfuegbarkeit`, { form: { id: offer.id, availability: 'frei', days: '30' } });
	check(r.status === 303 && r.location.startsWith('/anmelden'), 'Verfügbarkeit nur angemeldet');
	r = await C.req(`/angebote/${offer.id}?/verfuegbarkeit`, { form: { availability: 'ausgebucht', days: '30' } });
	check(r.status === 400, 'Fremde können Verfügbarkeit nicht ändern');

	r = await req('/admin/hinweise?/neu', { form: { kind: 'frist', source_kind: 'redaktion', title: 'Smoke-Frist Kita-Anmeldung', body: 'Bis Monatsende.', region_code: '04011', deadline: berlinDay(new Date(Date.now() + 14 * 86_400_000)), topics: 'betreuung' } });
	check(r.status === 200 && r.body.includes('Veröffentlicht'), 'Redaktion veröffentlicht Hinweis');
	r = await X2.req(`/hinweise?region=${fdf.code}`);
	check(r.body.includes('Smoke-Frist Kita-Anmeldung') && r.body.includes('Redaktion'), 'Stadt-Hinweis gilt auch im Stadtteil');
	r = await C.req('/radar/neu?/speichern', { form: [['name', 'Findorff'], ['regions', fdf.code], ['include', 'veranstaltungen'], ['include', 'angebote'], ['include', 'hinweise'], ['frequency', 'woechentlich']] });
	check(r.status === 303 && r.location.startsWith('/radar/'), 'Familienradar angelegt');
	r = await C.req(r.location);
	check(r.body.includes('Smoke-Flohmarkt') && r.body.includes('Smoke-Babyschwimmen') && r.body.includes('Smoke-Frist Kita-Anmeldung'), 'Radar zeigt Termine, Plätze und Fristen der Region');

	icsFeed = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:smoke-1@fz', 'SUMMARY:Smoke-Elterncafé aus Kalender', `DTSTART;TZID=Europe/Berlin:${satDay.replace(/-/g, '')}T150000`, `DTEND;TZID=Europe/Berlin:${satDay.replace(/-/g, '')}T170000`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
	r = await A.req(`/einrichtungen/verwalten/${orgRow.slug}?/profil`, { form: { name: 'Smoke-Familienzentrum', kind: 'familienzentrum', description: 'Offener Treff', region_code: fdf.code, ics_url: 'https://fz.example.org/kalender.ics' } });
	check(r.status === 200 && r.body.includes('Profil gespeichert'), 'Kalender-Adresse der Einrichtung gespeichert');
	const icsKey = `org-ics-${orgRow.slug}`.slice(0, 60);
	await sqlT`update data_sources set config = jsonb_set(config, '{url}', '"http://127.0.0.1:3998/kalender.ics"') where key = ${icsKey}`;
	res = await runAndWait(icsKey);
	check(res.run?.status === 'uebernommen' && res.run.counts.neu === 1, `Kalender der Einrichtung übernommen (${res.run?.message ?? res.run?.status})`);
	r = await X2.req('/veranstaltungen?zeitraum=30');
	check(r.body.includes('Smoke-Elterncafé aus Kalender'), 'Importierter Termin erscheint als Einrichtungstermin');
	r = await req('/admin');
	check(r.body.includes('/admin/einrichtungen') && r.body.includes('/admin/hinweise'), 'Verwaltung: Einrichtungen und Hinweise im Menü');
	r = await X2.req('/');
	check(r.body.includes('/veranstaltungen/heute') && r.body.includes('/angebote'), 'Startseite: Entdecken-Einstiege');

	// ---------- Abschnitt 6: Marktplatz, Familien helfen Familien, Kompass, Einladungen ----------
	r = await X2.req('/marktplatz');
	check(r.status === 200 && r.body.includes('anmelden') && !r.body.includes('Smoke-Laufrad'), 'Marktplatz ohne Anmeldung: nur Hinweis');
	const D = client();
	// Registrierung ist je Adresse auf 5 pro Stunde begrenzt – Dora bekommt das Passwort-Hash von Cem (nur im Test)
	await sqlT`insert into users (email, password_hash, email_verified_at) select 'dora@example.org', password_hash, now() from users where email = 'cem@example.org'`;
	r = await D.req('/anmelden?/anmelden', { form: { email: 'dora@example.org', password: pwC } });
	r = await D.req('/profil');
	check(r.status === 200 && r.body.includes('Familien-ID'), 'Viertes Mitglied angemeldet');
	r = await A.req('/marktplatz/neu', { form: { kind: 'verkaufen', category: 'fahrraeder', title: 'Smoke-Laufrad', description: 'Blau, 12 Zoll', price: '25', condition: 'gut', region_code: fdf.code, private: 'on' } });
	const lPath = r.location.split('?')[0];
	check(r.status === 303 && /^\/marktplatz\/[0-9a-f-]{36}$/.test(lPath), `Anzeige aufgegeben (${r.status})`);
	r = await A.req('/marktplatz/neu', { form: { kind: 'verkaufen', category: 'kleidung', title: 'Gewerblich', price: '5', region_code: fdf.code } });
	check(r.status === 400 && r.body.includes('privat'), 'Nur private Anzeigen');
	r = await D.req('/marktplatz?q=Laufrad');
	check(r.body.includes('Smoke-Laufrad') && r.body.includes('25'), 'Suche findet Anzeige mit Preis');
	r = await D.req(lPath);
	check(r.status === 200 && r.body.includes('Findorff') && !r.body.includes('anna@example.org'), 'Anzeige: nur grobe Gegend, keine Kontaktdaten');
	r = await D.req(`${lPath}?/anfragen`, { form: { message: 'Ist das Laufrad noch zu haben?' } });
	check(r.status === 200, 'Anfrage zur Anzeige gesendet');
	r = await A.req('/nachrichten?ansicht=kontakte');
	check(r.body.includes('über den Marktplatz') && r.body.includes('Smoke-Laufrad') && r.body.includes('Ist das Laufrad noch zu haben?'), 'Anfrage erscheint als Kontaktanfrage mit Bezug zur Anzeige');
	const reqD = /name="id" value="([0-9a-f-]{36})"/.exec(r.body)?.[1];
	r = await A.req('/nachrichten?ansicht=kontakte&/annehmen', { form: { id: reqD ?? '' } });
	r = await D.req(lPath);
	check(r.body.includes('Nachricht schreiben'), 'Nach Annahme: Chat mit der Anbieterin möglich');
	r = await A.req(`${lPath}?/status`, { form: { status: 'reserviert' } });
	r = await D.req('/marktplatz?q=Laufrad');
	check(r.body.includes('Reserviert'), 'Status „reserviert“ sichtbar');
	r = await D.req('/marktplatz?/suchauftrag', { form: { q: 'Kinderwagen', region: fdf.code } });
	check(r.status === 200, 'Suchauftrag gespeichert');

	r = await D.req('/hilfe/neu', { form: { kind: 'brauche', category: 'alltag', title: 'Babysitter gesucht', body: 'Freitag', region_code: fdf.code } });
	check(r.status === 400 && r.body.includes('Kindertagespflege'), 'Fremdbetreuung wird nicht vermittelt, mit Hinweis auf geprüfte Wege');
	r = await D.req('/hilfe/neu', { form: { kind: 'brauche', category: 'antraege', title: 'Smoke-Hilfe Elterngeldantrag', body: 'Wer hat Erfahrung?', region_code: fdf.code } });
	const hPath = r.location.split('?')[0];
	check(r.status === 303 && hPath.startsWith('/hilfe/'), 'Hilfe-Eintrag angelegt');
	r = await A.req('/hilfe');
	check(r.body.includes('Smoke-Hilfe Elterngeldantrag') && r.body.includes('keine Fachberatung'), 'Hilfe-Liste mit Hinweis auf private Erfahrung');
	r = await A.req(`${hPath}?/antworten`, { form: { message: 'Habe ich letztes Jahr gemacht, helfe gern.' } });
	check(r.status === 200, 'Antwort auf Hilfe-Eintrag');

	r = await X2.req('/kompass');
	check(r.status === 200 && r.body.includes('Geburt und erste Wochen') && r.body.includes('Trennung'), 'Lebenslagen-Kompass öffentlich');
	r = await X2.req('/kompass/geburt');
	check(r.body.includes('Kindergeld beantragen') && r.body.includes('Familienportal'), 'Kompass: Schritte mit Quelle');
	r = await X2.req('/kompass/trennung');
	check(r.body.includes('0800 111 0 550') && r.body.includes('Unterhaltsvorschuss'), 'Kompass Trennung: offizielle Krisennummern und Leistungen');
	r = await req('/admin/kompass');
	check(r.status === 200, 'Redaktion: Kompass pflegen');

	const startInv = berlinDay(new Date(Date.now() + 12 * 86_400_000));
	r = await A.req('/einladungen/neu', { form: { title: 'Smoke-Geburtstag', start: `${startInv}T15:00`, end: `${startInv}T18:00`, message: 'Schatzsuche!', place_text: 'Smokeweg 7', address_after_rsvp: 'on', max_guests: '5' } });
	const invPath = r.location.split('?')[0];
	check(r.status === 303 && invPath.startsWith('/einladungen/'), 'Einladung angelegt');
	r = await A.req(invPath);
	const invLink = /(\/e\/[A-Za-z0-9_-]{20,})/.exec(r.body)?.[1];
	check(!!invLink, 'Einladungslink für die Gastgeberin');
	const G = client();
	r = await G.req(invLink ?? '/e/x');
	check(r.status === 200 && r.body.includes('Smoke-Geburtstag') && !r.body.includes('Smokeweg 7') && r.body.includes('nach deiner Zusage') && r.headers.get('referrer-policy') === 'no-referrer', 'Gast ohne Konto: Einladung ohne Adresse, kein Referrer');
	r = await G.req(`${invLink}?/antworten`, { form: { name: 'Lena mit Mama', answer: 'ja', kids: '1', adults: '1' } });
	check(r.status === 200 && r.body.includes('Danke'), 'Zusage ohne Konto');
	r = await G.req(invLink ?? '/e/x');
	check(r.body.includes('Smokeweg 7') && r.body.includes('Du hast zugesagt'), 'Nach Zusage: Adresse sichtbar, eigene Antwort erkannt');
	r = await A.req(invPath);
	check(r.body.includes('Lena mit Mama') && r.body.includes('1</strong> Zusage'), 'Gastgeberin sieht die Antwort');
	r = await D.req(invPath);
	check(r.status === 404, 'Gästeliste nur für die Gastgeberin');
	r = await A.req(`${invPath}?/erneuern`, { form: {} });
	r = await G.req(invLink ?? '/e/x');
	check(r.body.includes('Einladung nicht gefunden'), 'Alter Link nach Erneuern ungültig');
	r = await X2.req('/');
	check(r.body.includes('%2Fmarktplatz') && r.body.includes('href="/kompass"') && r.body.includes('%2Feinladungen') && r.body.includes('href="/mehr"'), 'Startseite: Kacheln für alle Bereiche (Mitgliederbereiche über Anmeldung), Navigation mit „Mehr“');
	r = await X2.req('/mehr');
	check(r.status === 200 && r.body.includes('/routen') && r.body.includes('/hinweise') && r.body.includes('/impressum'), 'Seite „Mehr“ mit allen Bereichen');
	r = await A.req('/');
	check(r.body.includes('href="/marktplatz"') && !r.body.includes('href="/profil" aria-current'), 'Mitglied: Kacheln direkt verlinkt');

	// ---------- Abschnitt 7: Kinderwagenrouten, Statistik, zweite Freigabe, Partnerlinks ----------
	const coords = JSON.stringify([[8.7905, 53.0935], [8.7930, 53.0950], [8.7960, 53.0965], [8.7985, 53.0975]]);
	const routeForm = { title: 'Smoke-Runde Torfkanal', description: 'Breite Wege', coords, surface: 'asphalt', incline: 'eben', stairs: 'nein', duration: '20' };
	r = await D.req('/routen/neu', { form: routeForm });
	check(r.status === 400 && r.body.includes('öffentlich'), 'Route ohne Bestätigung „öffentliche Orte“ abgelehnt');
	r = await D.req('/routen/neu', { form: { ...routeForm, public_ends: 'on' } });
	const rPath = (r.location ?? '').split('?')[0];
	check(r.status === 303 && /^\/routen\/[0-9a-f-]{36}$/.test(rPath), `Route eingereicht (${r.status})`);
	r = await X2.req(rPath);
	check(r.status === 404, 'Route vor Prüfung nicht öffentlich');
	r = await req(`${rPath}?/pruefen`, { form: { decision: 'ja' } });
	r = await X2.req(rPath);
	check(r.status === 200 && r.body.includes('Smoke-Runde Torfkanal') && r.body.includes('km'), 'Nach Prüfung öffentlich mit Länge');
	r = await X2.req(`${rPath}/gpx`);
	check(r.status === 200 && r.body.includes('<trkpt lat="53.0935" lon="8.7905">'), 'GPX-Download');
	r = await X2.req('/routen');
	check(r.status === 200 && r.body.includes('Smoke-Runde Torfkanal'), 'Routenliste öffentlich');
	r = await A.req(`${rPath}?/erfahrung`, { form: { kind: 'hindernis', text: 'Baustelle an der Brücke' } });
	r = await X2.req(rPath);
	check(r.body.includes('Baustelle an der Brücke'), 'Aktueller Hinweis an der Route');
	r = await req('/admin/statistik?zeitraum=30');
	check(r.status === 200 && r.body.includes('Mitglieder') && r.body.includes('nicht erfasst'), 'Statistik: Zählungen, Unerfasstes als solches markiert');
	r = await req('/admin/freigaben');
	check(r.status === 200, 'Freigaben-Seite');
	r = await D.req('/admin/statistik');
	check(r.status === 403 || r.status === 404 || r.status === 303, `Statistik nur mit Recht (${r.status})`);
	r = await req('/admin/affiliate?/speichern', { form: { enabled: 'on', tag: 'smoke-21' } });
	check(r.status === 400, 'Partnerlinks nur nach bestätigter Prüfung der Bedingungen');
	r = await req('/admin/affiliate?/testen', { form: { url: 'https://www.amazon.de/dp/B000000000' } });
	check(r.status === 200, 'Partnerlink-Test');
	r = await X2.req('/partnerlinks');
	check(r.status === 200 && r.body.includes('Partnerlink'), 'Erklärseite Partnerlinks öffentlich');

	// ---------- Abschnitt 8.1: Kartenebenen, Orte abonnieren, Treffen am Ort ----------
	const bb = '8.70,53.03,8.90,53.15';
	r = await X2.req(`/api/karte/ebenen?bbox=${bb}&e=routen,marktplatz,hilfe`);
	let lj = JSON.parse(r.body);
	check(r.status === 200 && lj.lines.some((l) => l.title === 'Smoke-Runde Torfkanal') && lj.points.length === 0 && lj.hidden.includes('marktplatz'), 'Kartenebenen ohne Anmeldung: Routen ja, Marktplatz/Hilfe nein');
	r = await D.req(`/api/karte/ebenen?bbox=${bb}&e=marktplatz,hilfe`);
	lj = JSON.parse(r.body);
	check(r.status === 200 && lj.points.some((p) => p.layer === 'marktplatz' && p.href.startsWith('/marktplatz?region=')) && lj.points.some((p) => p.layer === 'hilfe'), 'Kartenebenen für Mitglieder: Marktplatz und Hilfe je Gegend');
	r = await X2.req('/api/karte/ebenen?bbox=0,0,50,50&e=termine');
	check(r.status === 400, 'Kartenebenen: zu großer Ausschnitt abgelehnt');
	const [pl] = await sqlT`select id from places where status = 'aktiv' and kind = 'spielplatz' limit 1`;
	r = await D.req(`/orte/${pl.id}?/abo`, { form: { on: '1' } });
	check(r.status === 200, 'Ort abonniert');
	r = await D.req(`/orte/${pl.id}`);
	check(r.body.includes('Abonniert') && r.body.includes(`/nachrichten/treffen/neu?ort=${pl.id}`), 'Ortsseite: Abo aktiv, „Treffen hier“');
	r = await D.req('/radar');
	check(r.body.includes('Abonnierte Orte') && r.body.includes(`/orte/${pl.id}`), 'Radar zeigt abonnierte Orte');
	r = await D.req(`/nachrichten/treffen/neu?ort=${pl.id}`);
	check(r.status === 200, 'Treffen am Ort: Formular vorausgefüllt');
	r = await X2.req('/karte');
	check(r.status === 200, 'Karte lädt');

	// ---------- Abschnitt 8.2: Freigabestufe Gruppen, Hinweise von Mitgliedern, Partnerorganisation ----------
	r = await D.req('/profil/bearbeiten', { method: 'POST', form: { display_name: 'Dora', can_help: 'Laufrad-Tipps', preset: 'individuell', vis_display_name: 'mitglieder', vis_can_help: 'gruppen', vis_looking_for: 'kontakte', vis_interests: 'kontakte', vis_child_ages: 'kontakte', vis_region: 'kontakte' } });
	check(r.status === 303, 'Profil mit Stufe „Mitglieder meiner Gruppen“ gespeichert');
	r = await D.req('/profil/vorschau');
	check(r.body.includes('Aus deinen Gruppen'), 'Vorschau zeigt die Gruppen-Sicht');
	const [dv] = await sqlT`select visibility from user_profiles p join users u on u.id = p.user_id where u.email = 'dora@example.org'`;
	check(dv.visibility.can_help === 'gruppen', 'Stufe „gruppen“ gespeichert');
	r = await D.req('/hinweise/neu?/vorschlagen', { form: { kind: 'sperrung', title: 'Smoke-Hinweis Gehweg gesperrt', body: 'Bis Freitag', region_code: fdf.code, days: '7' } });
	check(r.status === 200, 'Mitglied schlägt Hinweis vor');
	r = await X2.req(`/hinweise?region=${encodeURIComponent(fdf.code)}`);
	check(!r.body.includes('Smoke-Hinweis Gehweg gesperrt'), 'Vorschlag vor Prüfung nicht sichtbar');
	r = await req('/admin/hinweise');
	const propId = /name="id" value="([0-9a-f-]{36})"[^]*?Freigeben/.exec(r.body)?.[1];
	check(r.body.includes('Vorschläge von Mitgliedern') && !!propId, 'Redaktion sieht den Vorschlag');
	r = await req('/admin/hinweise?/pruefen', { form: { id: propId ?? '', decision: 'ja' } });
	r = await X2.req(`/hinweise?region=${encodeURIComponent(fdf.code)}`);
	check(r.body.includes('Smoke-Hinweis Gehweg gesperrt') && r.body.includes('Mitglied'), 'Nach Freigabe sichtbar, Herkunft „Mitglied“');
	r = await req('/admin/gruppen');
	check(r.status === 200 && r.body.includes('Partnerorganisation'), 'Gruppenverwaltung: Partnerorganisation wählbar');
	r = await D.req('/einrichtungen/verwalten');
	check(r.status === 200, 'Meine Einrichtungen lädt');

	// ---------- Abschnitt 8.3: Rechtstexte, Fußzeile, Geräteliste ----------
	r = await X2.req('/datenschutz');
	check(r.status === 200 && r.body.includes('Entwurf') && r.body.includes('Ende-zu-Ende-verschlüsselt') && r.body.includes('fehlt, bitte in der Verwaltung eintragen'), 'Datenschutz: Entwurf aus Systemfunktionen, fehlende Angaben sichtbar markiert');
	r = await X2.req('/impressum');
	check(r.status === 200 && r.body.includes('werden gerade eingetragen'), 'Impressum ohne Angaben: ehrlicher Hinweis');
	r = await X2.req('/hinweise');
	check(r.body.includes('href="/impressum"') && r.body.includes('href="/datenschutz"'), 'Fußzeile mit Impressum und Datenschutz');
	r = await req('/admin/rechtstexte?/speichern', { form: { i_provider: 'Smoke Betreiber', i_street: 'Teststraße 1', i_city: '28195 Bremen', i_country: 'Deutschland', i_email: 'kontakt@example.org', hosting: 'Testserver', authority: 'Testbehörde', checked: 'on' } });
	check(r.status === 200, 'Rechtstexte gespeichert und als geprüft bestätigt');
	r = await X2.req('/impressum');
	check(r.body.includes('Smoke Betreiber') && r.body.includes('28195 Bremen') && !r.body.includes('Entwurf'), 'Impressum zeigt Angaben, geprüft');
	r = await X2.req('/datenschutz');
	check(r.body.includes('Testbehörde') && !r.body.includes('Entwurf –'), 'Datenschutz übernimmt Betreiberangaben, geprüft');
	r = await req('/admin/rechtstexte?/speichern', { form: { i_provider: 'Smoke Betreiber GmbH', i_street: 'Teststraße 1', i_city: '28195 Bremen', i_email: 'kontakt@example.org', hosting: 'Testserver', authority: 'Testbehörde' } });
	r = await X2.req('/impressum');
	check(r.body.includes('Entwurf'), 'Änderung hebt „geprüft“ wieder auf');
	// ---------- Sammel-Update ----------
	// F-006 / D-060: keine Mitglieder-E-Mail in der Verwaltung
	const memberMails = ['anna@example.org', 'ben@example.org', 'cem@example.org', 'dora@example.org'];
	for (const path of ['/admin', '/admin/nutzer', '/admin/rechte', '/admin/protokoll', '/admin/freigaben', '/admin/einrichtungen', '/admin/moderation', '/admin/statistik', '/admin/affiliate']) {
		r = await req(path);
		const hit = memberMails.find((m) => r.body.includes(m)) ?? ([...r.body.matchAll(/[a-z0-9._-]+@example\.org/g)].map((m) => m[0]).find((m) => m !== 'noreply@example.org') ?? null);
		check(r.status === 200 && !hit, `Keine E-Mail-Adresse in ${path}${hit ? ` (${hit})` : ''}`);
	}
	r = await req('/admin/nutzer');
	check(r.body.includes('Familien-ID'), 'Nutzerliste mit Familien-ID');
	const [dcid] = await sqlT`select p.contact_id from user_profiles p join users u on u.id = p.user_id where u.email = 'dora@example.org'`;
	r = await req('/admin/nutzer?/nachricht', { form: { cid: dcid.contact_id, text: 'Hallo aus der Verwaltung (Smoke)' } });
	check(r.status === 200, 'F-007: Nachricht an Familien-ID gesendet');
	r = await D.req('/profil/mitteilungen');
	check(r.body.includes('Nachricht der Verwaltung: Hallo aus der Verwaltung (Smoke)'), 'F-007: Mitglied sieht die Nachricht in den Mitteilungen');
	// F-006: eigene Adresse sieht das Mitglied, Änderung mit Bestätigung
	r = await D.req('/profil/sicherheit');
	check(r.body.includes('dora@example.org'), 'Mitglied sieht die eigene Adresse');
	r = await D.req('/profil/sicherheit?/emailAendern', { form: { email: 'dora.neu@example.org', current: pwC } });
	check(r.status === 200, 'Adresswechsel angefordert');
	const changeMail = lastMailTo('dora.neu@example.org');
	const changeLink = /\/email-bestaetigen\?t=([A-Za-z0-9_-]+)/.exec(changeMail?.text ?? '')?.[1];
	check(!!changeLink, 'Bestätigungslink an die neue Adresse');
	r = await X2.req(`/email-bestaetigen?t=${changeLink}`);
	check(r.status === 200 && r.body.includes('Adresse bestätigen'), 'Bestätigung per Knopf');
	r = await X2.req('/email-bestaetigen', { form: { t: changeLink ?? '' } });
	const [dm] = await sqlT`select email from users where email like 'dora%'`;
	check(r.status === 200 && dm.email === 'dora.neu@example.org', 'Neue Adresse aktiv');
	check(!!lastMailTo('dora@example.org')?.subject.includes('geändert'), 'Alte Adresse wird benachrichtigt');
	await sqlT`update users set email = 'dora@example.org' where email = 'dora.neu@example.org'`;
	// F-005: Ortsseite – Mitmachen oben, Quelle unten
	r = await D.req(`/orte/${pl.id}`);
	const iJoin = r.body.indexOf('id="mitmachen"'), iSrc = r.body.indexOf('id="quelle"'), iExp = r.body.indexOf('id="erf-h"');
	check(iJoin > 0 && iJoin < iExp && iExp < iSrc, 'Ortsseite: „Mitmachen“ oben, „Quelle und Aktualität“ ganz unten');
	r = await D.req(`/orte/${pl.id}?/melden`, { form: { kind: 'ergaenzung', message: 'Es gibt jetzt eine Nestschaukel.' } });
	check(r.status === 200, 'Infos ergänzen am Ort');
	// F-008: Familie verbinden
	const [acid] = await sqlT`select p.contact_id from user_profiles p join users u on u.id = p.user_id where u.email = 'anna@example.org'`;
	r = await D.req('/profil/familie?/anfragen', { form: { cid: acid.contact_id, kind: 'familie' } });
	check(r.status === 200, 'Familie: Anfrage gesendet');
	r = await A.req('/profil/familie');
	const linkId = /name="id" value="([0-9a-f-]{36})"/.exec(r.body)?.[1];
	check(!!linkId && r.body.includes('möchte sich mit dir verbinden'), 'Familie: Anfrage bei Anna');
	r = await A.req('/profil/familie?/antworten', { form: { id: linkId ?? '', accept: '1' } });
	r = await A.req('/profil/familie');
	check(r.body.includes('verbunden'), 'Familie: verbunden');
	// D-066: Chat-Salz nur mit Sitzung (Rest im Browsertest chatkey-check.py)

	// Geräteliste: zweites und drittes Gerät abmelden
	const D2 = client();
	await D2.req('/anmelden?/anmelden', { form: { email: 'dora@example.org', password: pwC }, headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' } });
	r = await D2.req('/profil');
	check(r.status === 200, 'Zweites Gerät angemeldet');
	r = await D.req('/profil/sicherheit');
	const others = [...r.body.matchAll(/action="\?\/geraetAbmelden"><input type="hidden" name="id" value="([0-9a-f]{12})"/g)].map((m) => m[1]);
	check(others.length >= 1 && r.body.includes('iPhone'), `Geräteliste zeigt weitere Geräte (${others.length})`);
	for (const id of others) await D.req('/profil/sicherheit?/geraetAbmelden', { form: { id } });
	r = await D2.req('/radar');
	check(r.status === 303 && r.location.startsWith('/anmelden'), 'Abgemeldetes Gerät muss sich neu anmelden');
	r = await D.req('/radar');
	check(r.status === 200, 'Eigenes Gerät bleibt angemeldet');
	const D3 = client();
	await D3.req('/anmelden?/anmelden', { form: { email: 'dora@example.org', password: pwC } });
	r = await D.req('/profil/sicherheit?/alleAbmelden', { form: {} });
	r = await D3.req('/radar');
	check(r.status === 303 && (await D.req('/radar')).status === 200, '„Alle anderen abmelden“ wirkt, eigenes Gerät bleibt');
	await sqlT.end();
	const sqlT2 = postgres(DB, { max: 1, onnotice: () => {} });

	// ---------- Abschnitt 4: Chat (Ende-zu-Ende-verschlüsselt), Push, Treffen ----------
	if (!SYN_PY) {
		console.log('HINWEIS  Chat-Test übersprungen (SYNAPSE_PYTHON nicht gesetzt)');
	} else {
		for (let i = 0; i < 150; i++) {
			try { if ((await fetch(`http://127.0.0.1:${SYN_PORT}/health`)).ok) break; } catch {}
			await new Promise((res) => setTimeout(res, 300));
		}
		const wait = (ms) => new Promise((res) => setTimeout(res, ms));
		async function until(fn, ms = 15000, step = 200) {
			const t0 = Date.now();
			while (Date.now() - t0 < ms) {
				try { const v = await fn(); if (v) return v; } catch {}
				await wait(step);
			}
			return null;
		}
		t = await fetch(BASE + '/_matrix/client/versions');
		check(t.status === 200 && (await t.json()).versions?.length > 0, 'Chat-Server über die App erreichbar (/_matrix/client)');
		t = await fetch(BASE + '/_synapse/admin/v1/server_version');
		check(t.status === 404, 'Admin-Schnittstelle des Chat-Servers von außen nicht erreichbar');
		t = await fetch(BASE + '/internal/chat/check', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: '{"action":"send"}' });
		check(t.status === 404, 'Interne Prüfschnittstelle über Proxy (X-Forwarded-For) gesperrt');
		t = await fetch(BASE + '/internal/chat/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"action":"send"}' });
		check(t.status === 403, 'Interne Prüfschnittstelle ohne Geheimnis abgelehnt');
		t = await fetch(BASE + '/_matrix/push/v1/notify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: '{}' });
		check(t.status === 404, 'Push-Gateway von außen nicht erreichbar');
		r = await X2.req('/api/chat/sitzung', { json: {} });
		check(r.status === 401, 'Chat-Sitzung nur angemeldet');
		r = await req('/admin');
		check(/Chat-Server<\/td><td class="st ok[^"]*">/.test(r.body) && r.body.includes('Synapse 1.') && r.body.includes('Chat-Konten'), 'Systemzustand zeigt Chat-Server (ohne Inhalte)');

		// Cem und Anna werden Kontakte
		r = await C.req('/nachrichten/familie?/anfragen', { form: { cid: annaId, message: 'Hallo Anna' } });
		r = await A.req('/nachrichten?ansicht=kontakte');
		const reqC = /name="id" value="([0-9a-f-]{36})"/.exec(r.body)?.[1];
		r = await A.req('/nachrichten?ansicht=kontakte&/annehmen', { form: { id: reqC ?? '' } });
		check(r.status === 200 && r.body.includes('verbunden'), 'Kontakt Anna ↔ Cem für den Chat');
		r = await C.req('/profil');
		const cemId = /aria-label="Familien-ID ([^"]+)"/.exec(r.body)?.[1]?.replace(/[ -]/g, '');

		const sdk = await import('matrix-js-sdk');
		try { (await import('matrix-js-sdk/lib/logger.js')).logger.setLevel?.('silent'); } catch {}
		const origDebug = console.debug, origInfo = console.info, origWarn = console.warn;
		console.debug = console.info = console.warn = () => {};
		const ENC = { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } };
		const clients = [];
		async function mx(person, holder = { key: null }) {
			const s = JSON.parse((await person.req('/api/chat/sitzung', { json: {} })).body);
			const lr = await fetch(BASE + '/_matrix/client/v3/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'org.matrix.login.jwt', token: s.token, initial_device_display_name: 'Rauchtest' }) });
			const j = await lr.json();
			const c = sdk.createClient({
				baseUrl: BASE, accessToken: j.access_token, userId: j.user_id, deviceId: j.device_id,
				cryptoCallbacks: { getSecretStorageKey: async ({ keys }) => (holder.key ? [Object.keys(keys)[0], holder.key] : null) }
			});
			await c.initRustCrypto({ useIndexedDB: false });
			await c.startClient({ initialSyncLimit: 10 });
			await until(() => c.isInitialSyncComplete(), 20000);
			clients.push(c);
			return { c, s };
		}
		try {
			const holderA = { key: null };
			const { c: ma, s: sa } = await mx(A, holderA);
			const { c: mc, s: sc } = await mx(C);
			check(/^@k[a-z2-7]{15}:kinder-deutschlands$/.test(sa.userId) && !sa.userId.includes(annaId.toLowerCase()), 'Chat-Kennung zufällig, nicht aus Familien-ID ableitbar');
			check(sa.displayName === 'Anna', 'Anzeigename im Chat aus dem Profil (für Mitglieder sichtbar)');
			const kc = JSON.parse((await C.req('/api/chat/kontakte')).body);
			check(kc.contacts?.some((x) => x.mxid === sa.userId && x.name === 'Anna'), 'Kontaktliste für den Chat');

			// Direktchat Cem → Anna, Ende-zu-Ende-verschlüsselt
			const { room_id: dm } = await mc.createRoom({ is_direct: true, invite: [sa.userId], preset: 'trusted_private_chat', initial_state: [ENC] });
			r = await C.req('/api/chat/raeume', { json: { action: 'direkt', peer: annaId, roomId: dm } });
			check(r.status === 200 && JSON.parse(r.body).roomId === dm, 'Direktchat angemeldet und geprüft');
			r = await A.req('/api/chat/raeume', { json: { action: 'direkt-suchen', peer: cemId } });
			check(JSON.parse(r.body).roomId === dm, 'Bestehender Direktchat wird gefunden (kein zweiter)');
			await until(() => ma.getRoom(dm)?.getMyMembership() === 'invite');
			await ma.joinRoom(dm);

			// Push für Anna (Testbetrieb: Ablage statt Versand)
			r = await A.req('/api/push/abo', { json: { subscription: { endpoint: 'https://push.example.org/anna-1', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } }, label: 'Rauchtest' } });
			const pushkey = JSON.parse(r.body).pushkey;
			check(r.status === 200 && typeof pushkey === 'string' && pushkey.length > 20, 'Push-Abo angelegt (zufälliger Schlüssel)');
			await ma.setPusher({ pushkey, kind: 'http', app_id: sa.push.appId, app_display_name: 'KD', device_display_name: 'Rauchtest', lang: 'de', data: { url: sa.push.url, format: 'event_id_only' }, append: false });

			const got = new Promise((res) => {
				ma.on(sdk.RoomEvent.Timeline, async (ev) => {
					if (ev.getRoomId() !== dm) return;
					await ma.decryptEventIfNeeded(ev);
					if (ev.getType() === 'm.room.message' && ev.getSender() === sc.userId) res(ev);
				});
			});
			await mc.sendTextMessage(dm, 'Hallo Anna, wir sind heute am Spielplatz Torfkanal!');
			const ev = await Promise.race([got, wait(20000).then(() => null)]);
			check(ev?.getContent().body === 'Hallo Anna, wir sind heute am Spielplatz Torfkanal!' && ev.isEncrypted(), 'Nachricht verschlüsselt gesendet und bei Anna entschlüsselt');
			const synSql = postgres(DB.replace(/\/[^/?]+(\?|$)/, '/synapse_smoke$1'), { max: 1, onnotice: () => {} });
			const [{ plain }] = await synSql`select count(*)::int as plain from event_json where json like '%Torfkanal%'`;
			const [{ enc }] = await synSql`select count(*)::int as enc from event_json where json like '%m.room.encrypted%'`;
			check(plain === 0 && enc > 0, 'Server speichert die Nachricht nur verschlüsselt (Klartext nicht in der Datenbank)');

			const pushFile = await until(() => {
				try { return readdirSync('/tmp/kd-smoke-push').map((f) => JSON.parse(readFileSync(join('/tmp/kd-smoke-push', f), 'utf8'))).find((x) => x.endpoint.endsWith('anna-1')); } catch { return null; }
			}, 15000);
			check(pushFile?.payload?.body === 'Neue Nachricht' && !JSON.stringify(pushFile).includes('Torfkanal') && pushFile.payload.url.startsWith('/nachrichten/chat/'), 'Push „Neue Nachricht“ ohne Inhalt, mit Link zur Unterhaltung');

			// Gerätewechsel: Wiederherstellungsschlüssel einrichten, neues Gerät freischalten, alte Nachricht lesen
			const cryptoA = ma.getCrypto();
			const rk = await cryptoA.createRecoveryKeyFromPassphrase();
			holderA.key = rk.privateKey;
			await cryptoA.bootstrapCrossSigning({ authUploadDeviceSigningKeys: async (make) => { await make(null); } });
			await cryptoA.bootstrapSecretStorage({ createSecretStorageKey: async () => rk, setupNewSecretStorage: true, setupNewKeyBackup: true });
			check(await cryptoA.isSecretStorageReady(), 'Wiederherstellungsschlüssel eingerichtet (ohne Passwortabfrage)');
			const backedUp = await until(async () => (await synSql`select count(*)::int as n from e2e_room_keys where user_id = ${sa.userId}`)[0].n > 0, 20000, 500);
			check(!!backedUp, 'Schlüssel der Unterhaltung verschlüsselt gesichert');
			const holderA2 = { key: null };
			const { c: ma2 } = await mx(A, holderA2);
			const { decodeRecoveryKey } = await import('matrix-js-sdk/lib/crypto-api/recovery-key.js');
			holderA2.key = decodeRecoveryKey(rk.encodedPrivateKey);
			const crypto2 = ma2.getCrypto();
			await crypto2.bootstrapCrossSigning({});
			await crypto2.loadSessionBackupPrivateKeyFromSecretStorage();
			await crypto2.checkKeyBackupAndEnable();
			await crypto2.restoreKeyBackup();
			const room2 = ma2.getRoom(dm);
			if (room2) await ma2.scrollback(room2, 20).catch(() => {});
			const oldEv = await until(async () => {
				const e = ma2.getRoom(dm)?.findEventById(ev.getId());
				if (!e) return null;
				await ma2.decryptEventIfNeeded(e).catch(() => {});
				return e.getContent().body?.includes('Torfkanal') ? e : null;
			}, 20000, 500);
			check(!!oldEv, 'Neues Gerät liest frühere Nachricht nach Eingabe des Wiederherstellungsschlüssels');
			const st2 = await crypto2.getCrossSigningStatus();
			check(st2.privateKeysCachedLocally.masterKey && st2.privateKeysCachedLocally.selfSigningKey, 'Neues Gerät ist freigeschaltet (Kreuzsignierung)');
			// Schlüssel verloren: Neu einrichten mit Bestätigung der App (statt Passwort)
			let resetDenied = false;
			try { await crypto2.resetEncryption(async (make) => { await make({ type: 'de.kinder.reauth', token: 'falsch.falsch', identifier: { type: 'm.id.user', user: sa.userId } }); }); } catch { resetDenied = true; }
			check(resetDenied, 'Zurücksetzen ohne gültige Bestätigung abgelehnt');
			const conf = JSON.parse((await A.req('/api/chat/bestaetigung', { json: {} })).body);
			let resetOk = true;
			try { await crypto2.resetEncryption(async (make) => { await make({ type: 'de.kinder.reauth', token: conf.token, identifier: { type: 'm.id.user', user: sa.userId } }); }); } catch (e) { resetOk = false; console.log('Reset-Fehler', e.message); }
			check(resetOk, 'Verschlüsselung mit App-Bestätigung neu eingerichtet');

			// Ruhezeit: ganztägig → kein Push
			r = await A.req('/profil/benachrichtigungen', { form: { push_chat: 'on', quiet: 'on', quiet_from: '00:00', quiet_to: '23:59' } });
			check(r.status === 200, 'Ruhezeit gespeichert');
			const before = readdirSync('/tmp/kd-smoke-push').length;
			await mc.sendTextMessage(dm, 'Zweite Nachricht in der Ruhezeit');
			await wait(3000);
			check(readdirSync('/tmp/kd-smoke-push').length === before, 'In der Ruhezeit kein Push');
			r = await A.req('/profil/benachrichtigungen', { form: { push_chat: 'on' } });

			// Einladung an Nicht-Kontakt wird vom Chat-Server abgelehnt
			const sAdmin = JSON.parse((await req('/api/chat/sitzung', { json: {} })).body);
			let denied = '';
			try { await mc.createRoom({ name: 'Fremd', invite: [sAdmin.userId], initial_state: [ENC] }); } catch (e) { denied = e.errcode; }
			check(denied === 'M_FORBIDDEN', 'Einladung an Nicht-Kontakt abgelehnt');
			const up = await mc.uploadContent(Buffer.from('verschluesselte-testdaten'), { type: 'application/octet-stream' });
			check(/^mxc:\/\/kinder-deutschlands\//.test(up.content_uri), 'Anhang-Upload über die App');

			// Chatnachricht melden (Inhalt nur mit Freigabe)
			r = await A.req('/api/chat/melden', { json: { roomId: dm, eventId: ev.getId(), reason: 'beleidigung', message: 'Test', messages: [{ eventId: ev.getId(), senderName: 'Cem', ts: ev.getTs(), body: ev.getContent().body }], consent: false } });
			check(r.status === 400, 'Chat-Meldung ohne Freigabe abgelehnt');
			r = await A.req('/api/chat/melden', { json: { roomId: dm, eventId: ev.getId(), reason: 'beleidigung', message: 'Test', messages: [{ eventId: ev.getId(), senderName: 'Cem', ts: ev.getTs(), body: ev.getContent().body }], consent: true } });
			check(r.status === 200, 'Chatnachricht gemeldet');
			r = await req('/admin/moderation');
			check(r.body.includes('Torfkanal') && r.body.includes('Chat'), 'Moderation sieht die freigegebene Chatnachricht');
			const [cc] = await sqlT2`select id from mod_cases where target_type = 'chat' and status = 'offen'`;
			r = await req(`/admin/moderation/${cc.id}?/entscheiden`, { form: { action: 'entfernen', reason: 'Test' } });
			check(r.status === 400, 'Verschlüsselte Nachricht kann nicht „entfernt“ werden (ehrlich)');
			r = await req(`/admin/moderation/${cc.id}?/entscheiden`, { form: { action: 'verwarnen', reason: 'Bitte freundlich bleiben' } });
			check(r.status === 200 || r.status === 303, 'Chat-Meldung: Verwarnung ausgesprochen');

			// Treffen per QR
			const { room_id: tr } = await mc.createRoom({ name: 'Spielplatz-Treffen Smoke', preset: 'public_chat', visibility: 'private', initial_state: [ENC, { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } }] });
			r = await C.req('/api/chat/raeume', { json: { action: 'treffen', roomId: tr, hours: 2 } });
			const turl = JSON.parse(r.body).url ?? '';
			const ttok = turl.split('/t/')[1];
			check(r.status === 200 && !!ttok, 'Treffen angelegt, QR-Link erzeugt');
			const { c: madm } = await mx(admin);
			let adminJoin = '';
			try { await madm.joinRoom(tr); } catch (e) { adminJoin = e.errcode; }
			check(adminJoin === 'M_FORBIDDEN', 'Ohne QR-Ticket kein Beitritt zum Treffen');
			r = await A.req(`/t/${ttok}`);
			check(r.status === 200 && r.body.includes('Spielplatz-Treffen Smoke'), 'QR-Seite zeigt das Treffen');
			r = await A.req(`/t/${ttok}`, { form: {}, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
			check(r.body.includes(tr), 'Beitrittsticket ausgestellt');
			let joined = true;
			try { await ma.joinRoom(tr); } catch { joined = false; }
			check(joined, 'Mit Ticket dem Treffen beigetreten');
			r = await A.req(`/api/qr?d=${encodeURIComponent(turl)}`);
			check(r.status === 200 && r.body.includes('<svg'), 'QR-Code für das Treffen');
			r = await A.req(`/api/qr?d=${encodeURIComponent('https://evil.example/x')}`);
			check(r.status === 400, 'QR-Dienst nur für eigene Treffen-Links');
			await sqlT2`update chat_rooms set expires_at = now() - interval '1 second' where room_id = ${tr}`;
			const expired = await until(async () => (await sqlT2`select status from chat_rooms where room_id = ${tr}`)[0]?.status === 'abgelaufen', 15000);
			// Synapse löscht im Hintergrund – kurz warten
			const purged = await until(async () => (await synSql`select count(*)::int as n from rooms where room_id = ${tr}`)[0].n === 0, 20000);
			check(expired && purged, 'Abgelaufenes Treffen samt Nachrichten vom Server gelöscht');
			r = await A.req(`/t/${ttok}`);
			check(r.body.includes('Treffen nicht gefunden'), 'Abgelaufener QR-Code zeigt nichts mehr');

			// Abschnitt 6: Gäste-Chat einer Einladung (Beitritt nur mit Zusage) und Event-Chat (nur mit Teilnahme)
			const HIST = { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } };
			r = await A.req(invPath);
			const invLink2 = /(\/e\/[A-Za-z0-9_-]{20,})/.exec(r.body)?.[1] ?? '/e/x';
			const { room_id: ir } = await ma.createRoom({ name: 'Gäste Smoke', preset: 'public_chat', visibility: 'private', initial_state: [ENC, HIST] });
			r = await A.req('/api/einladungen/chat', { json: { invitationId: invPath.split('/').pop(), roomId: ir } });
			check(r.status === 200, `Gäste-Chat zur Einladung angelegt (${r.body.slice(0, 80)})`);
			r = await C.req(`${invLink2}?/chat`, { form: {}, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
			check(!r.body.includes(ir), 'Ohne Zusage kein Ticket für den Gäste-Chat');
			r = await C.req(`${invLink2}?/antworten`, { form: { name: 'Cem', answer: 'ja', kids: '1', adults: '1' } });
			r = await C.req(`${invLink2}?/chat`, { form: {}, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
			let invJoined = r.body.includes(ir);
			try { await mc.joinRoom(ir); } catch { invJoined = false; }
			check(invJoined, 'Nach Zusage dem Gäste-Chat beigetreten');
			let admInv = '';
			try { await madm.joinRoom(ir); } catch (e) { admInv = e.errcode; }
			check(admInv === 'M_FORBIDDEN', 'Gäste-Chat ohne Ticket gesperrt');
			const nextSat = berlinDay(new Date(satT.getTime() + 7 * 86_400_000));
			r = await C.req(`${evPath}?/teilnahme`, { form: { am: nextSat, status: 'komme_mit' } });
			const { room_id: er } = await mc.createRoom({ name: 'Flohmarkt Smoke', preset: 'public_chat', visibility: 'private', initial_state: [ENC, HIST] });
			r = await C.req('/api/veranstaltungen/chat', { json: { eventId: evPath.split('/').pop(), occurrence: nextSat, roomId: er } });
			check(r.status === 200, `Event-Chat angelegt (${r.body.slice(0, 80)})`);
			r = await req(`${evPath}?/chat`, { form: { am: nextSat }, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
			check(!r.body.includes(er), 'Ohne Teilnahme kein Event-Chat');
			r = await A.req(`${evPath}?/chat`, { form: { am: nextSat }, headers: { accept: 'application/json', 'x-sveltekit-action': 'true' } });
			let evJoined = r.body.includes(er);
			try { await ma.joinRoom(er); } catch { evJoined = false; }
			check(evJoined, 'Veranstalterin tritt dem Event-Chat bei');

			// Geräte
			r = await A.req('/api/chat/geraete');
			check(JSON.parse(r.body).devices?.some((d) => d.name === 'Rauchtest'), 'Chat-Geräte sichtbar');

			// Blockieren stoppt den Direktchat (Regelprüfung wird bis zu 20 s zwischengespeichert)
			r = await A.req('/nachrichten?ansicht=kontakte');
			const cemCid = [...r.body.matchAll(/name="cid" value="([0-9A-Z]{9})"/g)].map((m) => m[1]).find((x) => x === cemId);
			r = await A.req('/nachrichten?ansicht=kontakte&/blockieren', { form: { cid: cemCid ?? '' } });
			await wait(21000);
			let blockedSend = '';
			try { await mc.sendTextMessage(dm, 'Nach dem Blockieren'); } catch (e) { blockedSend = e.errcode ?? e.name; }
			check(blockedSend === 'M_FORBIDDEN', `Nach dem Blockieren kann Cem Anna nicht mehr schreiben (${blockedSend || 'gesendet'})`);

			// Kontolöschung legt das Chat-Konto still
			r = await C.req('/profil/konto?/loeschen', { form: { current: pwC, confirm: 'löschen' } });
			const [deact] = await synSql`select deactivated from users where name = ${sc.userId}`;
			check(r.status === 303 && deact?.deactivated === 1, 'Kontolöschung legt das Chat-Konto still');
			await synSql.end();
		} finally {
			for (const c of clients) c.stopClient();
			console.debug = origDebug;
			console.info = origInfo;
			console.warn = origWarn;
		}
	}
	await sqlT2.end();

	// Passkey-Endpunkte: nur gleiche Herkunft, nur angemeldet
	r = await X.req('/api/passkey/login/options', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' } });
	check(r.status === 403, 'Passkey-API lehnt fremde Herkunft ab');
	r = await X.req('/api/passkey/register/options', { method: 'POST', headers: { 'content-type': 'application/json' } });
	check(r.status === 401, 'Passkey-Registrierung nur angemeldet');
	r = await X.req('/api/passkey/login/options', { method: 'POST', headers: { 'content-type': 'application/json' } });
	check(r.status === 200 && r.body.includes('challenge'), 'Passkey-Anmeldung liefert Herausforderung');
} finally {
	server.kill();
	synapse?.kill();
	mock.close();
}

if (failures) {
	console.log(`\n${failures} Prüfung(en) fehlgeschlagen.\n--- Serverlog ---\n${serverLog}${synapseLog ? `\n--- Chat-Server ---\n${synapseLog.slice(-4000)}` : ''}`);
	if (process.env.GITHUB_ACTIONS) console.log(`::error title=Serverlog::${serverLog.slice(-1500).replace(/\n/g, '%0A')}`);
	process.exit(1);
}
console.log('\nAlle Rauchtests bestanden.');
// Chat-Clients halten Zeitgeber offen – Testlauf hier ausdrücklich beenden
process.exit(0);
