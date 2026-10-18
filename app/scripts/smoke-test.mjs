// End-to-End-Rauchtest gegen den gebauten Server und eine echte Datenbank.
// Ablauf wie ein Mensch im Browser (ohne JavaScript): Setup mit Einmal-Token → Erst-Admin mit 2FA →
// Setup gesperrt → Abmelden → Anmelden mit Passwort + Code → Adminseiten → Rechte, Theme, Header.
// Nutzung: TEST_DATABASE_URL=postgres://… node scripts/smoke-test.mjs   (Datenbank wird geleert!)
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import postgres from 'postgres';

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
	if (!cond) failures++;
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

const jar = new Map();
function cookieHeader() {
	return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function req(path, { method = 'GET', form } = {}) {
	const res = await fetch(BASE + path, {
		method,
		redirect: 'manual',
		headers: {
			cookie: cookieHeader(),
			origin: BASE,
			accept: 'text/html',
			...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
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
for (let i = 0; i < 50; i++) {
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
	r = await req('/setup?/konto', { method: 'POST', form: { email: 'Admin@Example.org', password: pw, password2: pw, code: totp(secret) } });
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

	r = await req('/anmelden', { method: 'POST', form: { email: 'admin@example.org', password: 'falsches Passwort!' } });
	check(r.status === 400, 'Falsches Passwort abgelehnt');

	r = await req('/anmelden?weiter=%2Fadmin', { method: 'POST', form: { email: 'admin@example.org', password: pw } });
	check(r.status === 303 && r.location.startsWith('/anmelden/code'), 'Passwort richtig → zweiter Faktor verlangt');

	r = await req('/admin');
	check(r.status === 303 && r.location.startsWith('/anmelden/code'), 'Vor dem zweiten Faktor kein Adminzugang');

	r = await req('/anmelden/code?/verify&weiter=%2Fadmin', { method: 'POST', form: { code: totp(secret) } });
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
} finally {
	server.kill();
}

if (failures) {
	console.log(`\n${failures} Prüfung(en) fehlgeschlagen.\n--- Serverlog ---\n${serverLog}`);
	process.exit(1);
}
console.log('\nAlle Rauchtests bestanden.');
