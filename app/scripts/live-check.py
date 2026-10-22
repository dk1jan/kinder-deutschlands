#!/usr/bin/env python3
"""Browsertest Live-Standort im Chat (F-025): zwei echte Chromium-Fenster (Handy-Größe), echter Chat-Server.

Läuft lokal NACH dem Rauchtest mit Chat-Server (nutzt dessen Datenbank und Synapse; Anna und Dora sind Kontakte):

    TEST_DATABASE_URL=postgres://… SYNAPSE_PYTHON=/opt/synvenv/bin/python python3 scripts/live-check.py [Ordner für Bildschirmfotos]

Standorte sind künstlich (Bremen, zwei Punkte ca. 300 m auseinander). Geprüft: Anna und Dora teilen live; der Chat
bleibt aufgeräumt (keine Karte über dem Verlauf, Hinweis zum eigenen Teilen einzeilig); „2 live“ öffnet eine
Vollbild-Karte mit beiden Namen; die Karte lässt sich verschieben und zoomen und springt nicht zurück; Antippen eines
Namens fährt hin; „Alle zeigen“; Esc/Schließen; Stoppen.
"""
import hashlib, os, secrets, subprocess, sys, time, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright

DB = os.environ['TEST_DATABASE_URL']
PY = os.environ['SYNAPSE_PYTHON']
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYN = '/tmp/kd-smoke-synapse'
BASE = 'http://127.0.0.1:3999'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3999', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', SYNAPSE_URL='http://127.0.0.1:8019', SYNAPSE_CONFIG_DIR=f'{SYN}/config',
           SYNAPSE_DB='synapse_smoke', SYNAPSE_MEDIA_STORE=f'{SYN}/media', SYNAPSE_PORT='8019', SYNAPSE_BIND='127.0.0.1', SYNAPSE_PID_FILE=f'{SYN}/homeserver.pid',
           SYNAPSE_PUSH_ALLOW='127.0.0.0/8', CHAT_INTERNAL_URL=BASE, TURN_ENABLED='false', LIVEKIT_ENABLED='false',
           NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')

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

def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, name))

subprocess.run(['node', 'scripts/migrate.mjs'], cwd=APP, env=env, check=True, capture_output=True)
syn = subprocess.Popen([PY, '-m', 'synapse.app.homeserver', '-c', f'{SYN}/config/homeserver.yaml'], env=dict(env, PYTHONPATH=f'{SYN}/config'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
srv = subprocess.Popen(['node', 'scripts/server.mjs'], cwd=APP, env=env, stdout=open('/tmp/kd-live-srv.log', 'w'), stderr=subprocess.STDOUT)
try:
    check(wait_http(BASE + '/healthz') and wait_http('http://127.0.0.1:8019/health'), 'App und Chat-Server laufen')
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    def sess(email):
        t = secrets.token_urlsafe(32)
        q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) select %s, id, true, now() + interval '1 day' from users where email = %s", (hashlib.sha256(t.encode()).hexdigest(), email))
        return t
    with sync_playwright() as p:
        b = p.chromium.launch()
        def page_for(email, lat, lon):
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, permissions=['geolocation'], geolocation={'latitude': lat, 'longitude': lon})
            ctx.add_cookies([{'name': 'kd_session', 'value': sess(email), 'url': BASE}])
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: print('  JS-Fehler', email, e))
            return pg
        anna = page_for('anna@example.org', 53.0758, 8.8072)
        dora = page_for('dora@example.org', 53.0781, 8.8101)
        for pg in (anna, dora):
            pg.goto(BASE + '/nachrichten')
        anna.wait_for_timeout(6000)
        anna.goto(BASE + '/nachrichten/gruppe/neu')
        anna.wait_for_selector('#g-name', timeout=30000)
        anna.fill('#g-name', 'Live-Test Spielplatz')
        anna.wait_for_selector('label.check:has-text("Dora") input', timeout=30000)
        anna.check('label.check:has-text("Dora") input')
        anna.click('button:has-text("Gruppe anlegen")')
        anna.wait_for_url('**/nachrichten/chat/!**', timeout=40000)
        room_url = anna.url
        dora.goto(room_url)
        dora.wait_for_selector('button:has-text("Annehmen")', timeout=40000)
        dora.click('button:has-text("Annehmen")')
        dora.wait_for_selector('#cmp-t', timeout=40000)
        check(True, 'Gruppe Anna + Dora angelegt')

        for pg in (anna, dora):
            pg.click('button[aria-label="Treffpunkt oder Live-Standort"]')
            pg.click('.panel.ort button:has-text("30 Min.")')
            pg.wait_for_selector('.composer .live', timeout=20000)
        line = anna.locator('.composer .live')
        box = line.bounding_box()
        check(box is not None and box['height'] <= 60, f'Hinweis „Du teilst live“ einzeilig (Höhe {box and round(box["height"])} px)')
        check('noch 30 Min.' in line.inner_text(), f'Restzeit im Hinweis: {line.inner_text().splitlines()[0]!r}')
        anna.wait_for_selector('.livebtn:has-text("2 live")', timeout=40000)
        check(True, 'Kopfzeile zeigt „2 live“')
        check(anna.locator('.scroller').bounding_box()['height'] > 300, 'Chatverlauf bleibt groß (keine Karte darüber)')
        shot(anna, '1-chat-mit-live.png')

        anna.click('.livebtn')
        anna.wait_for_selector('.livefull .maplibregl-canvas', timeout=20000)
        anna.wait_for_timeout(2500)
        full = anna.locator('.livefull').bounding_box()
        check(full['width'] == 390 and full['height'] >= 840, 'Live-Karte im Vollbild')
        chips = anna.locator('.livefull .lchip strong').all_inner_texts()
        check(sorted(chips) == ['Dora', 'Du'], f'Namen unten als Knöpfe: {chips}')
        shot(anna, '2-live-vollbild.png')

        # Zoomen mit dem Plus-Knopf
        before = anna.locator('.livefull .maplibregl-canvas').screenshot()
        anna.click('.livefull button.maplibregl-ctrl-zoom-in')
        anna.wait_for_timeout(1200)
        after_zoom = anna.locator('.livefull .maplibregl-canvas').screenshot()
        check(before != after_zoom, 'Plus-Knopf zoomt')
        # Verschieben mit einem Finger (ziehen) – darf nicht zurückspringen
        cb = anna.locator('.livefull .maplibregl-canvas').bounding_box()
        x, y = cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] / 2
        anna.mouse.move(x, y); anna.mouse.down(); anna.mouse.move(x - 150, y - 120, steps=12); anna.mouse.up()
        anna.wait_for_timeout(600)
        moved = anna.locator('.livefull .maplibregl-canvas').screenshot()
        check(moved != after_zoom, 'Karte lässt sich verschieben')
        anna.wait_for_timeout(4000)  # Live-Aktualisierung im Sekundentakt läuft weiter
        later = anna.locator('.livefull .maplibregl-canvas').screenshot()
        check(later == moved, 'Karte bleibt, wo sie hingeschoben wurde (kein Zurückspringen)')
        shot(anna, '3-verschoben.png')
        anna.click('.livefull .lchip:has-text("Dora")')
        anna.wait_for_timeout(1000)
        check(anna.locator('.livefull .maplibregl-canvas').screenshot() != later, 'Antippen von „Dora“ fährt zu ihr')
        anna.click('.livefull button:has-text("Alle zeigen")')
        anna.wait_for_timeout(800)
        shot(anna, '4-alle.png')
        anna.keyboard.press('Escape')
        anna.wait_for_timeout(300)
        check(anna.locator('.livefull').count() == 0, 'Esc schließt die Karte')
        anna.click('.livebtn'); anna.wait_for_selector('.livefull')
        anna.click('.livefull button[aria-label="Karte schließen"]')
        check(anna.locator('.livefull').count() == 0, '„Karte schließen“ schließt')

        dora.click('.composer .live button:has-text("Stoppen")')
        anna.wait_for_selector('.livebtn:has-text("1 live")', timeout=40000)
        check(True, 'Dora stoppt → bei Anna „1 live“')
        b.close()
finally:
    srv.terminate(); syn.terminate()
print(f"\n{failures} Fehler." if failures else '\nLive-Standort: alle Prüfungen bestanden.')
sys.exit(1 if failures else 0)
