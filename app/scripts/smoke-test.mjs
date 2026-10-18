// End-to-End-Rauchtest gegen den gebauten Server und eine echte Datenbank.
// Ablauf wie ein Mensch im Browser (ohne JavaScript): Setup mit Einmal-Token → Erst-Admin mit 2FA →
// Setup gesperrt → Abmelden → Anmelden mit Passwort + Code → Adminseiten → Rechte, Theme, Header.
// Nutzung: TEST_DATABASE_URL=postgres://… node scripts/smoke-test.mjs   (Datenbank wird geleert!)
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

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
	BACKUP_DIR: '/tmp/kd-smoke-backups'
};

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

	// Passkey-Endpunkte: nur gleiche Herkunft, nur angemeldet
	r = await X.req('/api/passkey/login/options', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' } });
	check(r.status === 403, 'Passkey-API lehnt fremde Herkunft ab');
	r = await X.req('/api/passkey/register/options', { method: 'POST', headers: { 'content-type': 'application/json' } });
	check(r.status === 401, 'Passkey-Registrierung nur angemeldet');
	r = await X.req('/api/passkey/login/options', { method: 'POST', headers: { 'content-type': 'application/json' } });
	check(r.status === 200 && r.body.includes('challenge'), 'Passkey-Anmeldung liefert Herausforderung');
} finally {
	server.kill();
}

if (failures) {
	console.log(`\n${failures} Prüfung(en) fehlgeschlagen.\n--- Serverlog ---\n${serverLog}`);
	if (process.env.GITHUB_ACTIONS) console.log(`::error title=Serverlog::${serverLog.slice(-1500).replace(/\n/g, '%0A')}`);
	process.exit(1);
}
console.log('\nAlle Rauchtests bestanden.');
