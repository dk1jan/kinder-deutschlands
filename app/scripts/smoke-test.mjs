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
	RETRY_WAIT_MS: '50'
};

// ---------- Nachbau externer Dienste mit echten Ausschnitten (tests/fixtures, © OpenStreetMap-Mitwirkende / © BKG) ----------
const FX = new URL('../tests/fixtures/', import.meta.url).pathname;
const fx = (f) => readFileSync(join(FX, f), 'utf8');
let mockMode = 'voll';
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
	async function req(path, { method = 'GET', form, headers = {} } = {}) {
		const res = await fetch(BASE + path, {
			method,
			redirect: 'manual',
			headers: {
				cookie: cookieHeader(),
				origin: BASE,
				accept: 'text/html',
				...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
				...headers
			},
			body: form ? new URLSearchParams(form).toString() : undefined
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

const sql = postgres(DB, { max: 1, onnotice: () => {} });
await sql.unsafe('drop schema public cascade; create schema public;');
await sql.end();

const migrateOut = execFileSync('node', ['scripts/migrate.mjs'], { env, encoding: 'utf8' });
const token = /Einmal-Token:\s+(\S+)/.exec(migrateOut)?.[1];
check(!!token, 'Migration gibt Einmal-Token aus');

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

	r = await A.req('/nachrichten');
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
	r = await A.req('/nachrichten');
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
	await sqlT.end();

	// Passkey-Endpunkte: nur gleiche Herkunft, nur angemeldet
	r = await X.req('/api/passkey/login/options', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' } });
	check(r.status === 403, 'Passkey-API lehnt fremde Herkunft ab');
	r = await X.req('/api/passkey/register/options', { method: 'POST', headers: { 'content-type': 'application/json' } });
	check(r.status === 401, 'Passkey-Registrierung nur angemeldet');
	r = await X.req('/api/passkey/login/options', { method: 'POST', headers: { 'content-type': 'application/json' } });
	check(r.status === 200 && r.body.includes('challenge'), 'Passkey-Anmeldung liefert Herausforderung');
} finally {
	server.kill();
	mock.close();
}

if (failures) {
	console.log(`\n${failures} Prüfung(en) fehlgeschlagen.\n--- Serverlog ---\n${serverLog}`);
	if (process.env.GITHUB_ACTIONS) console.log(`::error title=Serverlog::${serverLog.slice(-1500).replace(/\n/g, '%0A')}`);
	process.exit(1);
}
console.log('\nAlle Rauchtests bestanden.');
