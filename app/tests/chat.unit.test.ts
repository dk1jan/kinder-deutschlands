import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { linkify, parseGeo, remaining, duration, fileSize } from '../src/lib/chat/format';
import { inQuietHours, berlinMinutes, validSubscription } from '../src/lib/server/push';
// JS-Skript (läuft vor dem Start ohne Build) – hier ohne Typprüfung laden
const prepPath = '../scripts/synapse-prepare.mjs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { buildConfig, signingKey, chatSecret, SERVER_NAME }: any = await import(/* @vite-ignore */ prepPath);

process.env.APP_SECRET ||= 'test-secret-test-secret-test-secret-123456';

describe('Chat-Darstellung', () => {
	it('Nachrichtentext: kein HTML, nur http(s)-Links', () => {
		const h = linkify('<img src=x onerror=alert(1)> siehe https://example.org/a?b=1&c=2. und javascript:alert(1)');
		expect(h).not.toMatch(/<img|<script/);
		expect(h).toContain('&lt;img');
		expect(h).toContain('<a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">');
		expect(h).toMatch(/<\/a>\. und javascript:alert\(1\)$/);
		expect(linkify('Zeile 1\nZeile 2')).toBe('Zeile 1<br>Zeile 2');
		expect(linkify('https://x.de/"onmouseover="a')).not.toContain('"onmouseover');
	});
	it('Treffpunkt-Koordinaten', () => {
		expect(parseGeo('geo:53.0793,8.8017')).toEqual({ lat: 53.0793, lon: 8.8017 });
		expect(parseGeo('geo:91,8')).toBeNull();
		expect(parseGeo('javascript:alert(1)')).toBeNull();
	});
	it('Restzeit, Dauer, Dateigröße', () => {
		const now = Date.UTC(2026, 9, 19, 12);
		expect(remaining(now + 30 * 60_000, now)).toBe('noch 30 Min.');
		expect(remaining(now + 30 * 60_000 + 20_000, now)).toBe('noch 30 Min.'); // Uhr der Seite leicht veraltet
		expect(remaining(now + 20_000, now)).toBe('noch 1 Min.');
		expect(remaining(now + 5 * 3600_000, now)).toBe('noch 5 Std.');
		expect(remaining(now + 3 * 86_400_000, now)).toBe('noch 3 Tage');
		expect(remaining(now - 1, now)).toBe('abgelaufen');
		expect(duration(65_400)).toBe('1:05');
		expect(fileSize(1536)).toBe('2 KB');
		expect(fileSize(3 * 1024 * 1024)).toBe('3,0 MB');
	});
});

describe('Ruhezeiten', () => {
	it('am Tag und über Mitternacht', () => {
		expect(inQuietHours({ quiet_from: 13 * 60, quiet_to: 15 * 60 }, 14 * 60)).toBe(true);
		expect(inQuietHours({ quiet_from: 13 * 60, quiet_to: 15 * 60 }, 15 * 60)).toBe(false);
		expect(inQuietHours({ quiet_from: 20 * 60, quiet_to: 7 * 60 }, 23 * 60)).toBe(true);
		expect(inQuietHours({ quiet_from: 20 * 60, quiet_to: 7 * 60 }, 6 * 60 + 59)).toBe(true);
		expect(inQuietHours({ quiet_from: 20 * 60, quiet_to: 7 * 60 }, 12 * 60)).toBe(false);
		expect(inQuietHours({ quiet_from: null, quiet_to: null }, 0)).toBe(false);
	});
	it('deutsche Zeit inkl. Sommerzeit', () => {
		expect(berlinMinutes(new Date('2026-07-01T10:00:00Z'))).toBe(12 * 60);
		expect(berlinMinutes(new Date('2026-12-01T10:00:00Z'))).toBe(11 * 60);
	});
	it('Push-Abo nur mit https-Endpunkt und Schlüsseln', () => {
		expect(validSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } })).toBe(true);
		expect(validSubscription({ endpoint: 'http://127.0.0.1/x', keys: { p256dh: 'a', auth: 'b' } })).toBe(false);
		expect(validSubscription({ endpoint: 'https://x.de' })).toBe(false);
	});
});

describe('Chat-Server-Konfiguration', () => {
	const cfg = buildConfig({
		appUrl: 'https://kinder.example.org',
		appSecret: process.env.APP_SECRET,
		databaseUrl: 'postgres://kd:geheim%21@db:5432/kd',
		dbName: 'synapse',
		configDir: '/config',
		mediaStore: '/data/media_store',
		port: 8008,
		bind: '0.0.0.0',
		pidFile: '/tmp/homeserver.pid',
		internalUrl: 'http://web:3000',
		pushAllow: ['172.16.0.0/12']
	});
	it('ohne Föderation, ohne Registrierung, ohne Passwörter, verschlüsselt', () => {
		expect(cfg).toContain('server_name: "kinder-deutschlands"');
		expect(cfg).toContain('enable_registration: false');
		expect(cfg).toMatch(/password_config:\n {2}enabled: false/);
		expect(cfg).toContain('federation_domain_whitelist: []');
		expect(cfg).toContain('names: [client]');
		expect(cfg).not.toContain('federation]');
		expect(cfg).toContain('encryption_enabled_by_default_for_room_type: all');
		expect(cfg).toMatch(/presence:\n {2}enabled: false/);
		expect(cfg).toContain('include_content: false');
		expect(cfg).toContain('url: "http://web:3000/internal/chat/check"');
		expect(cfg).toContain('password: "geheim!"');
	});
	it('Geheimnisse sind abgeleitet, je Zweck verschieden, nicht das APP_SECRET selbst', () => {
		const a = chatSecret(process.env.APP_SECRET, 'jwt');
		const b = chatSecret(process.env.APP_SECRET, 'module');
		expect(a).not.toBe(b);
		expect(cfg).toContain(a);
		expect(cfg).not.toContain(process.env.APP_SECRET);
	});
	it('Signaturschlüssel im Synapse-Format, stabil', () => {
		const k = signingKey(process.env.APP_SECRET);
		expect(k).toMatch(/^ed25519 a_[0-9a-f]{4} [A-Za-z0-9+/]{43}\n$/);
		expect(signingKey(process.env.APP_SECRET)).toBe(k);
		expect(SERVER_NAME).toBe('kinder-deutschlands');
	});
});

describe('Anmeldetoken für den Chat', async () => {
	const { loginJwt, reauthToken, chatSecret: serverSecret, localpartOf, newLocalpart } = await import('../src/lib/server/chat/synapse');
	it('JWT mit HS256, Aussteller und kurzer Gültigkeit', () => {
		const t = loginJwt('kabcdefghijklmno', 60);
		const [h, p, s] = t.split('.');
		expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' });
		const body = JSON.parse(Buffer.from(p, 'base64url').toString());
		expect(body.sub).toBe('kabcdefghijklmno');
		expect(body.iss).toBe('kinder-deutschlands');
		expect(body.exp - Date.now() / 1000).toBeLessThanOrEqual(61);
		expect(s).toBe(createHmac('sha256', serverSecret('jwt')).update(`${h}.${p}`).digest('base64url'));
	});
	it('Bestätigungstoken nur für das eigene Konto und den Zweck „reauth“', () => {
		const [p] = reauthToken('kabcdefghijklmno').split('.');
		const body = JSON.parse(Buffer.from(p, 'base64url').toString());
		expect(body).toMatchObject({ sub: '@kabcdefghijklmno:kinder-deutschlands', purpose: 'reauth' });
	});
	it('Kennungen', () => {
		expect(newLocalpart()).toMatch(/^k[a-z2-7]{15}$/);
		expect(localpartOf('@kabc:kinder-deutschlands')).toBe('kabc');
		expect(localpartOf('@kabc:evil.example')).toBeNull();
	});
});

describe('Anrufe: TURN', async () => {
	const { turnSettings, buildTurnConfig, buildConfig: bc }: any = await import(/* @vite-ignore */ prepPath);
	const secret = 'y'.repeat(48);
	it('Host aus APP_URL, eigener Portbereich, abschaltbar', () => {
		const t = turnSettings({ APP_URL: 'https://kinder.example.org' });
		expect(t.uris).toEqual(['turn:kinder.example.org:3479?transport=udp', 'turn:kinder.example.org:3479?transport=tcp']);
		expect([t.min, t.max]).toEqual([49160, 49200]);
		expect(turnSettings({ APP_URL: 'https://kinder.example.org', TURN_ENABLED: 'false' })).toBeNull();
		expect(turnSettings({ APP_URL: 'http://localhost:3000' })).toBeNull();
		expect(() => turnSettings({ APP_URL: 'https://a.b', TURN_MIN_PORT: '60000', TURN_MAX_PORT: '50000' })).toThrow();
	});
	it('coturn: gleiches Geheimnis wie Synapse, keine Weiterleitung in interne Netze, kein CLI', () => {
		const t = turnSettings({ APP_URL: 'https://kinder.example.org' });
		const conf = buildTurnConfig(secret, t);
		const sec = chatSecret(secret, 'turn');
		expect(conf).toContain(`static-auth-secret=${sec}`);
		expect(conf).toContain('use-auth-secret');
		expect(conf).toContain('no-cli');
		for (const r of ['10.0.0.0-10.255.255.255', '127.0.0.0-127.255.255.255', '172.16.0.0-172.31.255.255', '192.168.0.0-192.168.255.255', '::1']) expect(conf).toContain(`denied-peer-ip=${r}`);
		const hs = bc({ appUrl: 'https://kinder.example.org', appSecret: secret, databaseUrl: 'postgres://u:p@db/kd', dbName: 'synapse', configDir: '/c', mediaStore: '/m', port: 8008, bind: '0.0.0.0', pidFile: '/p', internalUrl: 'http://web:3000', pushAllow: [], turn: t });
		expect(hs).toContain(`turn_shared_secret: "${sec}"`);
		expect(hs).toContain('turn_allow_guests: false');
		expect(bc({ appUrl: 'https://kinder.example.org', appSecret: secret, databaseUrl: 'postgres://u:p@db/kd', dbName: 'synapse', configDir: '/c', mediaStore: '/m', port: 8008, bind: '0.0.0.0', pidFile: '/p', internalUrl: 'http://web:3000', pushAllow: [], turn: null })).not.toContain('turn_uris');
	});
});

describe('Gruppenanrufe: LiveKit (D-072)', async () => {
	const { livekitSettings, livekitNodeIp, buildLivekitConfig, turnSettings }: any = await import(/* @vite-ignore */ prepPath);
	const secret = 'y'.repeat(48);
	it('Standard an, eigener Port 49210, Grenzen geprüft, abschaltbar', () => {
		const l = livekitSettings({ APP_URL: 'https://kinder.example.org' });
		expect([l.udp, l.tcp, l.max, l.host]).toEqual([49210, 49210, 25, 'kinder.example.org']);
		expect(livekitSettings({ APP_URL: 'https://a.b', LIVEKIT_ENABLED: 'false' })).toBeNull();
		expect(() => livekitSettings({ APP_URL: 'https://a.b', LIVEKIT_MAX_PARTICIPANTS: '1' })).toThrow();
		expect(() => livekitSettings({ APP_URL: 'https://a.b', LIVEKIT_UDP_PORT: '80' })).toThrow();
	});
	it('öffentliche Adresse: fest > TURN_EXTERNAL_IP > IP-Literal/localhost', async () => {
		expect(await livekitNodeIp(livekitSettings({ APP_URL: 'https://a.b', LIVEKIT_NODE_IP: '203.0.113.7', TURN_EXTERNAL_IP: '198.51.100.1' }))).toBe('203.0.113.7');
		expect(await livekitNodeIp(livekitSettings({ APP_URL: 'https://a.b', TURN_EXTERNAL_IP: '198.51.100.1' }))).toBe('198.51.100.1');
		expect(await livekitNodeIp(livekitSettings({ APP_URL: 'http://127.0.0.1:3120' }))).toBe('127.0.0.1');
		expect(await livekitNodeIp(livekitSettings({ APP_URL: 'http://localhost:3000' }))).toBe('127.0.0.1');
	});
	it('Konfiguration: Räume nur über die App, Schlüssel aus APP_SECRET, eigener STUN/TURN statt fremder Server', () => {
		const env = { APP_URL: 'https://kinder.example.org' };
		const conf = buildLivekitConfig(secret, livekitSettings(env), '203.0.113.7', turnSettings(env));
		expect(conf).toContain('auto_create: false');
		expect(conf).toContain('udp_port: 49210');
		expect(conf).toContain('use_external_ip: false');
		expect(conf).toContain('node_ip: "203.0.113.7"');
		expect(conf).toContain(`"kd-app": "${chatSecret(secret, 'livekit')}"`);
		expect(conf).toContain('stun_servers: ["kinder.example.org:3479"]');
		expect(conf).toContain(`secret: "${chatSecret(secret, 'turn')}"`);
		expect(conf).not.toMatch(/google/i);
		const noIp = buildLivekitConfig(secret, livekitSettings(env), '', null);
		expect(noIp).toContain('use_external_ip: true');
		expect(noIp).not.toContain('turn_servers');
	});
});

describe('Gruppenanrufe: Token und Raumname (D-072)', async () => {
	const { livekitJwt, callRoomName, LIVEKIT_KEY } = await import('../src/lib/server/livekit');
	const { chatSecret: serverSecret } = await import('../src/lib/server/chat/synapse');
	const { createHmac } = await import('node:crypto');
	it('Token: HS256 mit dem LiveKit-Schlüssel, nur die übergebenen Rechte, kurz gültig', () => {
		const t = livekitJwt({ sub: '@k:kinder-deutschlands|DEV', video: { room: 'kd-x', roomJoin: true } }, 60);
		const [h, p, sig] = t.split('.');
		expect(createHmac('sha256', serverSecret('livekit')).update(`${h}.${p}`).digest('base64url')).toBe(sig);
		const body = JSON.parse(Buffer.from(p, 'base64url').toString());
		expect(body.iss).toBe(LIVEKIT_KEY);
		expect(body.video).toEqual({ room: 'kd-x', roomJoin: true });
		expect(body.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
	});
	it('Raumname: fest je Chat-Raum, verrät die Chat-Kennung nicht', () => {
		const a = callRoomName('!abcDEF123:kinder-deutschlands');
		expect(a).toMatch(/^kd-[0-9a-f]{32}$/);
		expect(callRoomName('!abcDEF123:kinder-deutschlands')).toBe(a);
		expect(callRoomName('!anders:kinder-deutschlands')).not.toBe(a);
		expect(a).not.toContain('abcDEF123');
	});
});

describe('Suche im Chat (nur im Gerät)', async () => {
	const { searchableText, matches, snippet } = await import('../src/lib/chat/search');
	it('durchsucht Text und Dateinamen, sonst nichts', () => {
		expect(searchableText({ msgtype: 'm.text', body: 'Treffen am Spielplatz' })).toBe('Treffen am Spielplatz');
		expect(searchableText({ msgtype: 'm.file', body: 'Elterngeld-Antrag.pdf' })).toBe('Elterngeld-Antrag.pdf');
		expect(searchableText({ msgtype: 'm.location', body: 'geo:53,8' })).toBe('');
		expect(searchableText(null)).toBe('');
	});
	it('findet ohne Groß-/Kleinschreibung, Umlaute und ß tolerant, ab 2 Zeichen', () => {
		expect(matches('Wir sind im Bürgerpark', 'BÜRGER')).toBe(true);
		expect(matches('Straße gesperrt', 'strasse')).toBe(true);
		expect(matches('Café am Wall', 'cafe')).toBe(true);
		expect(matches('abc', 'a')).toBe(false);
		expect(matches('abc', 'xy')).toBe(false);
	});
	it('Ausschnitt markiert den Treffer im Originaltext', () => {
		expect(snippet('Die Straße am Park ist gesperrt', 'strasse', 4)).toEqual(['Die ', 'Straße', ' am …']);
		expect(snippet('kurz', 'ku')).toEqual(['', 'ku', 'rz']);
		expect(snippet('kurz', 'zz')).toBeNull();
	});
});
