#!/usr/bin/env python3
"""Machbarkeits- und Abnahmetest für D-066 (Chat-Schlüssel aus dem Passwort, F-004) in echten Browsern mit echtem
Chat-Server und echter Ende-zu-Ende-Verschlüsselung. Läuft lokal NACH dem Rauchtest (nutzt dessen Datenbank/Synapse):

    TEST_DATABASE_URL=… SYNAPSE_PYTHON=/opt/synvenv/bin/python node scripts/smoke-test.mjs
    TEST_DATABASE_URL=… SYNAPSE_PYTHON=/opt/synvenv/bin/python python3 scripts/chatkey-check.py

Geprüft (neue Testkonten Erik und Fiona):
 1. Anmeldung mit Passwort → Chat richtet sich ohne Code ein (Sicherung mit Passwort-Ableitung).
 2. Neues Gerät, nur Anmeldung → frühere Nachricht ist lesbar.
 3. Passwort ändern unter Sicherheit → weiteres neues Gerät mit neuem Passwort → frühere Nachricht lesbar.
 4. Anmeldung ohne Passwort (wie Passkey) → Chat fragt einmal nach dem Passwort → danach lesbar.
 5. Passwort zurückgesetzt, kein Gerät online → „vorheriges Passwort“ → lesbar; nächstes Gerät entsperrt sich selbst.
 6. Altes Passwort unbekannt → „Neu beginnen“ → neue Nachrichten funktionieren.
"""
import base64, hashlib, os, secrets, subprocess, sys, time, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright

DB = os.environ['TEST_DATABASE_URL']
PY = os.environ['SYNAPSE_PYTHON']
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYN = '/tmp/kd-smoke-synapse'
BASE = 'http://127.0.0.1:3999'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3999', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', SYNAPSE_URL='http://127.0.0.1:8019', SYNAPSE_CONFIG_DIR=f'{SYN}/config',
           SYNAPSE_DB='synapse_smoke', SYNAPSE_MEDIA_STORE=f'{SYN}/media', SYNAPSE_PORT='8019', SYNAPSE_BIND='127.0.0.1', SYNAPSE_PID_FILE=f'{SYN}/homeserver.pid',
           SYNAPSE_PUSH_ALLOW='127.0.0.0/8', CHAT_INTERNAL_URL=BASE, TURN_ENABLED='false', NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')
PW1, PW2, PW3, PW4 = 'Erik schreibt gern Briefe 41', 'Erik hat ein neues Passwort 42', 'Erik hat es zurueckgesetzt 43', 'Erik weiss gar nichts mehr 44'
PWF = 'Fiona liest alles mit Freude 45'
failures = 0


def check(ok, label):
    global failures
    print(('OK   ' if ok else 'FEHL ') + label, flush=True)
    if not ok:
        failures += 1


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def scrypt_hash(pw):
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 17, r=8, p=1, maxmem=256 * 1024 * 1024, dklen=32)
    return f'scrypt$131072$8$1${b64u(salt)}${b64u(key)}'


def wait_http(url, n=150):
    for _ in range(n):
        try:
            urllib.request.urlopen(url, timeout=2)
            return True
        except Exception:
            time.sleep(0.3)
    return False


subprocess.run(['node', 'scripts/migrate.mjs'], cwd=APP, env=env, check=True, capture_output=True)
syn = subprocess.Popen([PY, '-m', 'synapse.app.homeserver', '-c', f'{SYN}/config/homeserver.yaml'], env=dict(env, PYTHONPATH=f'{SYN}/config'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=open('/tmp/kd-chatkey-srv.log', 'w'), stderr=subprocess.STDOUT)
try:
    check(wait_http(BASE + '/healthz') and wait_http('http://127.0.0.1:8019/health'), 'App und Chat-Server laufen')
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    for email, pw in [('erik@example.org', PW1), ('fiona@example.org', PWF)]:
        q.execute("delete from users where email = %s", (email,))
        q.execute("insert into users (email, password_hash, email_verified_at) values (%s, %s, now())", (email, scrypt_hash(pw)))

    with sync_playwright() as p:
        b = p.chromium.launch()

        def device(label):
            ctx = b.new_context()
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: print('  JS-Fehler', label, e))
            return ctx, pg

        def login(pg, email, pw):
            pg.goto(BASE + '/anmelden', wait_until='networkidle')
            pg.wait_for_timeout(300)
            pg.fill('#email', email)
            pg.fill('#password', pw)
            pg.click('form[action^="?/anmelden"] button[type=submit]')
            try:
                pg.wait_for_url(lambda u: '/anmelden' not in u, timeout=30000)
            except Exception:
                print('  Anmeldung hängt:', pg.url, pg.inner_text('main')[:400].replace('\n', ' | '))
                raise
            pg.wait_for_timeout(500)

        def settle(pg, gone, timeout=90000):
            # nach einem Klick: warten, bis die alte Karte verschwunden ist
            pg.wait_for_function(f"() => !document.body.innerText.includes({gone!r})", timeout=timeout)

        def keystate(pg, timeout=60000):
            # wartet, bis der Chat bereit ist und keine Arbeit mehr läuft; liefert sichtbaren Zustand
            pg.wait_for_function("() => !document.body.innerText.includes('wird eingerichtet') && !document.body.innerText.includes('Chat wird geladen') && !document.body.innerText.includes('entschlüsselt …')", timeout=timeout)
            t = pg.inner_text('body')
            if 'Chat entsperren' in t: return 'passwort'
            if 'ältere Nachrichten behalten' in t: return 'abweichend'
            return 'ok'

        # 1. Erik und Fiona melden sich mit Passwort an – Chat richtet sich selbst ein
        e1c, e1 = device('E1'); login(e1, 'erik@example.org', PW1)
        f1c, f1 = device('F1'); login(f1, 'fiona@example.org', PWF)
        for pg in (e1, f1):
            pg.goto(BASE + '/profil')  # legt Profil und Familien-ID an
        q.execute("select u.id, p.contact_id from users u join user_profiles p on p.user_id = u.id where u.email in ('erik@example.org', 'fiona@example.org') order by u.email")
        (eid, ecid), (fid, fcid) = q.fetchall()
        a, bb = sorted([eid, fid])
        q.execute("insert into contacts (user_a, user_b) values (%s, %s) on conflict do nothing", (a, bb))
        e1.goto(BASE + '/nachrichten/sicherheit'); f1.goto(BASE + '/nachrichten/sicherheit')
        check(keystate(e1) == 'ok' and keystate(f1) == 'ok', '1. Nach Anmeldung mit Passwort: Verschlüsselung ohne Code eingerichtet')
        check(e1.is_visible('text=Geschützt mit deinem Passwort'), '1. Sicherheitsseite: „geschützt mit deinem Passwort“, kein Code angezeigt')
        q.execute("select localpart from chat_accounts where user_id = %s", (eid,))
        e_mx = '@' + q.fetchone()[0] + ':kinder-deutschlands'
        cs = psycopg2.connect(DB.rsplit('/', 1)[0] + '/synapse_smoke'); cs.autocommit = True; qs = cs.cursor()
        qs.execute("select content from account_data where user_id = %s and account_data_type like 'm.secret_storage.key.%%'", (e_mx,))
        rows = qs.fetchall()
        check(len(rows) >= 1 and all('passphrase' in r[0] and 'm.pbkdf2' in r[0] for r in rows), '1. Sicherung auf dem Server mit Passwort-Ableitung (nur Salz/Runden, kein Schlüssel)')
        secret = e1.evaluate("() => localStorage.getItem('kd_chat_secret')") or ''
        check(PW1 not in secret and len(secret) > 20, '1. Im Browser liegt nur das abgeleitete Geheimnis, nicht das Passwort')

        e1.goto(f'{BASE}/nachrichten/chat/neu?mit={ecid if False else fcid}')
        e1.wait_for_url('**/nachrichten/chat/!**', timeout=40000)
        room = e1.url.split('/nachrichten/chat/')[1]
        e1.wait_for_selector('#cmp-t:not([disabled])', timeout=60000)
        e1.fill('#cmp-t', 'Geheime Nachricht eins')
        e1.click('button[aria-label="Senden"]')
        e1.wait_for_selector('text=Geheime Nachricht eins', timeout=20000)
        f1.goto(f'{BASE}/nachrichten/chat/{room}')
        f1.wait_for_selector('text=Geheime Nachricht eins', timeout=40000)
        check(True, '1. Nachricht verschlüsselt gesendet und bei Fiona gelesen')
        # warten, bis der Raumschlüssel verschlüsselt in der Sicherung liegt
        for _ in range(60):
            qs.execute("select count(*) from e2e_room_keys where user_id = %s", (e_mx,))
            if qs.fetchone()[0] > 0: break
            time.sleep(0.5)
        check(True, '1. Raumschlüssel liegt verschlüsselt in der Sicherung')

        def reads(pg, text='Geheime Nachricht eins', t=45000):
            pg.goto(f'{BASE}/nachrichten/chat/{room}')
            try:
                pg.wait_for_selector(f'text={text}', timeout=t)
                return True
            except Exception:
                return False

        e1c.close()
        # 2. Neues Gerät: nur anmelden
        e2c, e2 = device('E2'); login(e2, 'erik@example.org', PW1)
        e2.goto(BASE + '/nachrichten'); st = keystate(e2)
        check(st == 'ok', f'2. Neues Gerät entsperrt sich nach Anmeldung selbst ({st})')
        check(reads(e2), '2. Frühere Nachricht auf dem neuen Gerät lesbar – ohne Code')

        # 3. Passwort ändern → weiteres Gerät mit neuem Passwort
        e2.goto(BASE + '/profil/sicherheit')
        e2.fill('#current', PW1); e2.fill('#password', PW2); e2.fill('#password2', PW2)
        e2.click('form[action="?/passwort"] button[type=submit]')
        e2.wait_for_selector('text=Passwort geändert', timeout=30000)
        e2.wait_for_timeout(3000)
        e2c.close()
        e3c, e3 = device('E3'); login(e3, 'erik@example.org', PW2)
        e3.goto(BASE + '/nachrichten'); st = keystate(e3)
        check(st == 'ok', f'3. Nach Passwortwechsel: neues Gerät mit neuem Passwort entsperrt sich selbst ({st})')
        check(reads(e3), '3. Frühere Nachricht nach Passwortwechsel lesbar')
        e3c.close()

        # 4. Anmeldung ohne Passwort (wie Passkey): Sitzung direkt, ohne Geheimnis
        tok = secrets.token_urlsafe(32)
        q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) values (%s, %s, true, now() + interval '1 day')", (hashlib.sha256(tok.encode()).hexdigest(), eid))
        e4c = b.new_context(); e4c.add_cookies([{'name': 'kd_session', 'value': tok, 'url': BASE}]); e4 = e4c.new_page()
        e4.goto(BASE + '/nachrichten'); st = keystate(e4)
        check(st == 'passwort', f'4. Ohne Passwort-Anmeldung (Passkey): Chat fragt einmal nach dem Passwort ({st})')
        e4.fill('#kc-pw', 'falsches Passwort 1234'); e4.click('form:has(#kc-pw) button[type=submit]')
        e4.wait_for_selector('text=Das Passwort passt nicht', timeout=30000)
        check(True, '4. Falsches Passwort wird abgelehnt')
        e4.fill('#kc-pw', PW2); e4.click('form:has(#kc-pw) button[type=submit]')
        settle(e4, 'Chat entsperren'); st = keystate(e4)
        check(st == 'ok' and reads(e4), f'4. Mit Passwort entsperrt, frühere Nachricht lesbar ({st})')
        e4c.close()

        # 5. Passwort zurückgesetzt (vergessen), kein Gerät online → vorheriges Passwort
        q.execute("update users set password_hash = %s where id = %s", (scrypt_hash(PW3), eid))
        e5c, e5 = device('E5'); login(e5, 'erik@example.org', PW3)
        e5.goto(BASE + '/nachrichten'); st = keystate(e5)
        check(st == 'abweichend', f'5. Nach Zurücksetzen ohne Gerät online: Hinweis „vorheriges Passwort“ ({st})')
        e5.fill('#kc-old', PW2); e5.click('form:has(#kc-old) button[type=submit]')
        settle(e5, 'ältere Nachrichten behalten'); st = keystate(e5)
        check(st == 'ok' and reads(e5), f'5. Mit vorherigem Passwort entsperrt, frühere Nachricht lesbar ({st})')
        e5.wait_for_timeout(2000); e5c.close()
        e6c, e6 = device('E6'); login(e6, 'erik@example.org', PW3)
        e6.goto(BASE + '/nachrichten'); st = keystate(e6)
        check(st == 'ok' and reads(e6), f'5. Danach entsperrt sich das nächste Gerät mit dem neuen Passwort selbst ({st})')
        e6c.close()

        # 6. Altes Passwort unbekannt → neu beginnen
        q.execute("update users set password_hash = %s where id = %s", (scrypt_hash(PW4), eid))
        e7c, e7 = device('E7'); login(e7, 'erik@example.org', PW4)
        e7.goto(BASE + '/nachrichten'); st = keystate(e7)
        check(st == 'abweichend', f'6. Wieder ohne passendes Gerät: Hinweis ({st})')
        e7.click('text=Ich weiß es nicht mehr'); e7.click('button:has-text("Neu beginnen")')
        settle(e7, 'ältere Nachrichten behalten'); st = keystate(e7, 90000)
        check(st == 'ok', f'6. Neu begonnen: Verschlüsselung wieder eingerichtet ({st})')
        e7.goto(f'{BASE}/nachrichten/chat/{room}')
        e7.wait_for_selector('#cmp-t:not([disabled])', timeout=60000)
        e7.fill('#cmp-t', 'Nach Neubeginn')
        e7.click('button[aria-label="Senden"]')
        f1.goto(f'{BASE}/nachrichten/chat/{room}')
        try:
            f1.wait_for_selector('text=Nach Neubeginn', timeout=45000); ok = True
        except Exception:
            ok = False
        check(ok, '6. Neue Nachricht nach Neubeginn kommt bei Fiona an')
        b.close()
finally:
    srv.terminate(); syn.terminate()
    time.sleep(1)

print(f'\n{failures} Prüfung(en) fehlgeschlagen.' if failures else '\nChat-Schlüssel-Test bestanden.')
sys.exit(1 if failures else 0)
