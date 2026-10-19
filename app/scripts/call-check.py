#!/usr/bin/env python3
"""Browsertest für Anrufe (M02, Abschnitt 7): zwei echte Chromium-Fenster, echter Chat-Server, echte Ende-zu-Ende-Verschlüsselung.

Läuft lokal NACH dem Rauchtest mit Chat-Server (nutzt dessen Datenbank, Synapse-Konfiguration und die Konten
anna@ und dora@, die dort Kontakte geworden sind):

    TEST_DATABASE_URL=postgres://… SYNAPSE_PYTHON=/opt/synvenv/bin/python node scripts/smoke-test.mjs
    TEST_DATABASE_URL=postgres://… SYNAPSE_PYTHON=/opt/synvenv/bin/python python3 scripts/call-check.py

Kamera und Mikrofon sind künstlich (Chromium „fake device“). Geprüft: Dora ruft Anna per Video an, Anna nimmt an,
beide sehen „verbunden“ und empfangen Bild und Ton des anderen; Auflegen beendet bei beiden. Nicht in CI, weil
dort kein Browser mit Medien läuft – Netz-Durchgang (TURN) lässt sich nur auf dem Server prüfen.
"""
import hashlib, os, secrets, subprocess, sys, time, urllib.request
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

failures = 0
def check(ok, label):
    global failures
    print(('OK   ' if ok else 'FEHL ') + label, flush=True)
    if not ok: failures += 1

def wait_http(url, n=150):
    for _ in range(n):
        try:
            urllib.request.urlopen(url, timeout=2); return True
        except Exception:
            time.sleep(0.3)
    return False

subprocess.run(['node', 'scripts/migrate.mjs'], cwd=APP, env=env, check=True, capture_output=True)
syn = subprocess.Popen([PY, '-m', 'synapse.app.homeserver', '-c', f'{SYN}/config/homeserver.yaml'], env=dict(env, PYTHONPATH=f'{SYN}/config'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=open('/tmp/kd-call-srv.log', 'w'), stderr=subprocess.STDOUT)
try:
    check(wait_http(BASE + '/healthz') and wait_http('http://127.0.0.1:8019/health'), 'App und Chat-Server laufen')
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    def sess(email):
        t = secrets.token_urlsafe(32)
        q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) select %s, id, true, now() + interval '1 day' from users where email = %s", (hashlib.sha256(t.encode()).hexdigest(), email))
        return t
    q.execute("select p.contact_id from user_profiles p join users u on u.id = p.user_id where u.email = 'anna@example.org'")
    anna_cid = q.fetchone()[0]
    q.execute("""select count(*) from contacts c join users a on a.id in (c.user_a, c.user_b) and a.email = 'anna@example.org'
                 join users d on d.id in (c.user_a, c.user_b) and d.email = 'dora@example.org'""")
    check(q.fetchone()[0] == 1, 'Anna und Dora sind Kontakte (aus dem Rauchtest)')
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        def page_for(email):
            ctx = b.new_context(permissions=['camera', 'microphone'])
            ctx.add_cookies([{'name': 'kd_session', 'value': sess(email), 'url': BASE}])
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: print('  JS-Fehler', email, e))
            return pg
        anna = page_for('anna@example.org')
        dora = page_for('dora@example.org')
        anna.goto(BASE + '/nachrichten'); dora.goto(BASE + '/nachrichten')
        anna.wait_for_timeout(6000)
        dora.goto(f'{BASE}/nachrichten/chat/neu?mit={anna_cid}')
        dora.wait_for_url('**/nachrichten/chat/!**', timeout=40000)
        room_url = dora.url
        check('/nachrichten/chat/' in room_url, 'Dora öffnet den Direktchat mit Anna')
        # Anna tritt automatisch bei (Einladung eines Kontakts); dann erscheinen bei Dora die Anruf-Knöpfe
        dora.wait_for_selector('button[aria-label="Videoanruf"]', timeout=60000)
        check(True, 'Anruf-Knöpfe im Direktchat')
        dora.click('button[aria-label="Videoanruf"]')
        anna.wait_for_selector('text=Videoanruf von', timeout=30000)
        check(True, 'Anna sieht den eingehenden Videoanruf (auf einer beliebigen Seite)')
        anna.click('button[aria-label="Annehmen"]')
        dora.wait_for_selector('.call .label:has-text("·")', timeout=40000)
        anna.wait_for_selector('.call .label:has-text("·")', timeout=40000)
        check(True, 'Beide verbunden')
        dora.wait_for_timeout(3000)
        def media(pg):
            return pg.evaluate("""() => { const v = document.querySelector('.call video.remote'); const s = v && v.srcObject;
                return s ? { video: s.getVideoTracks().filter(t => t.readyState === 'live').length, audio: s.getAudioTracks().filter(t => t.readyState === 'live').length, w: v.videoWidth } : null }""")
        ma, md = media(anna), media(dora)
        print('  Medien Anna:', ma, ' Dora:', md)
        check(bool(ma and ma['video'] and ma['audio'] and ma['w'] > 0), 'Anna empfängt Bild und Ton von Dora')
        check(bool(md and md['video'] and md['audio'] and md['w'] > 0), 'Dora empfängt Bild und Ton von Anna')
        anna.screenshot(path='/tmp/kd-call-anna.png'); dora.screenshot(path='/tmp/kd-call-dora.png')
        check(dora.is_visible('.call button:has-text("Auflegen")') and anna.is_visible('.call button:has-text("Stumm")'), 'Bedienleiste im Videoanruf sichtbar')
        anna.click('.call button:has-text("Stumm")')
        check(anna.evaluate("() => document.querySelector('.call button[aria-pressed=\"true\"]')?.textContent?.includes('Ton an')"), 'Stummschalten')
        dora.click('.call button:has-text("Auflegen")')
        anna.wait_for_selector('.call .label:has-text("beendet")', timeout=20000)
        check(True, 'Auflegen beendet den Anruf bei beiden')
        b.close()
finally:
    srv.terminate(); syn.terminate()
    time.sleep(1)

print(f'\n{failures} Prüfung(en) fehlgeschlagen.' if failures else '\nAnruf-Test bestanden.')
sys.exit(1 if failures else 0)
