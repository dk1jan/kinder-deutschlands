#!/usr/bin/env python3
"""Browsertest „Kinderwagenroute per GPS aufzeichnen“ (F-027). Läuft lokal NACH dem Rauchtest (nutzt dessen Datenbank):

    TEST_DATABASE_URL=postgres://… python3 scripts/route-gps-check.py [Ordner für Bildschirmfotos]

Simulierter Spaziergang (Chromium-Standortsimulation, Bremen, ~600 m, alle ~12 m ein Punkt). Geprüft: Umschalten auf
„Per GPS aufzeichnen“, Start, laufende Anzeige (Zeit, km, Linie), Pause, Beenden → Prüfschritt mit Start/Ziel und
Reglern (Standard 50 m), Regler auf 0 m verlängert die Strecke um ~100 m, Einreichen; in der Datenbank liegt der
Start ~50 m entlang des Wegs vom echten Anfang entfernt; keine Zeitangaben gespeichert. Verwerfen löscht alles.
"""
import hashlib, math, os, secrets, subprocess, sys, time, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright

DB = os.environ['TEST_DATABASE_URL']
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'http://127.0.0.1:3994'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3994', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', TURN_ENABLED='false', NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')
fails = 0
def check(ok, msg):
    global fails
    print(('OK    ' if ok else 'FEHL  ') + msg, flush=True)
    if not ok: fails += 1
def wait_http(url, n=150):
    for _ in range(n):
        try:
            urllib.request.urlopen(url, timeout=2); return True
        except Exception:
            time.sleep(0.3)
    return False
def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, name), full_page=False)
def dist(a, b):
    r = math.pi / 180
    x = math.sin((b[1] - a[1]) * r / 2) ** 2 + math.cos(a[1] * r) * math.cos(b[1] * r) * math.sin((b[0] - a[0]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(x))

# Weg: 300 m nach Osten, dann 300 m nach Norden (Bremen, Werdersee), Punkt alle 12 m
lat0, lon0 = 53.0705, 8.8205
mlon = math.pi / 180 * 6371000 * math.cos(lat0 * math.pi / 180)
walk = [(lon0 + i * 12 / mlon, lat0) for i in range(26)] + [(lon0 + 300 / mlon, lat0 + i * 12 / 111200) for i in range(1, 26)]

subprocess.run(['node', 'scripts/migrate.mjs'], cwd=APP, env=env, check=True, capture_output=True)
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=open('/tmp/kd-route-srv.log', 'w'), stderr=subprocess.STDOUT)
try:
    check(wait_http(BASE + '/healthz'), 'App läuft')
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    t = secrets.token_urlsafe(32)
    q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) select %s, id, true, now() + interval '1 day' from users where email = 'dora@example.org'", (hashlib.sha256(t.encode()).hexdigest(),))
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, permissions=['geolocation'], geolocation={'latitude': walk[0][1], 'longitude': walk[0][0], 'accuracy': 6})
        ctx.add_cookies([{'name': 'kd_session', 'value': t, 'url': BASE}])
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: print('  JS-Fehler', e))
        pg.goto(BASE + '/routen/neu', wait_until='networkidle')
        pg.click('button[role="tab"]:has-text("Per GPS aufzeichnen")')
        pg.wait_for_selector('button:has-text("Aufzeichnung starten")')
        check(pg.locator('text=Seite offen lassen').count() == 1, 'Hinweis „Seite offen lassen“ vor dem Start')
        shot(pg, '1-start.png')
        pg.click('button:has-text("Aufzeichnung starten")')
        for i, (lo, la) in enumerate(walk):
            ctx.set_geolocation({'latitude': la, 'longitude': lo, 'accuracy': 6})
            pg.wait_for_timeout(120)
            if i == 30:
                pg.click('button:has-text("Pause")')
                check(pg.locator('.stats strong').inner_text() == 'Pause', 'Pause angezeigt')
                ctx.set_geolocation({'latitude': la + 0.001, 'longitude': lo + 0.001, 'accuracy': 6})  # Abstecher während der Pause → nicht aufgezeichnet
                pg.wait_for_timeout(300)
                pg.click('button:has-text("Weiter")')
        pg.wait_for_timeout(1200)
        stats = pg.locator('.stats').inner_text()
        check('Läuft' in stats and 'km' in stats, f'Laufende Anzeige: {stats!r}')
        shot(pg, '2-laeuft.png')
        pg.click('button:has-text("Beenden")')
        pg.wait_for_selector('#trim-s')
        check(pg.input_value('#trim-s') == '50' and pg.input_value('#trim-e') == '50', 'Prüfschritt: Regler stehen auf 50 m')
        km50 = pg.locator('.rec p strong').first.inner_text()
        pg.locator('#trim-s').fill('0'); pg.locator('#trim-e').fill('0')
        pg.wait_for_timeout(300)
        km0 = pg.locator('.rec p strong').first.inner_text()
        f50, f0 = float(km50.replace(' km', '').replace(',', '.')), float(km0.replace(' km', '').replace(',', '.'))
        check(0.08 <= f0 - f50 <= 0.12 and 0.55 <= f0 <= 0.65, f'Regler: 50 m je Ende = {km50}, 0 m = {km0} (Weg ca. 0,6 km)')
        pg.locator('#trim-s').fill('50'); pg.locator('#trim-e').fill('50')
        pg.wait_for_timeout(300)
        pg.locator('.rec .mapbox').scroll_into_view_if_needed()
        if SHOTS: pg.locator('.rec .mapbox').screenshot(path=os.path.join(SHOTS, '3-pruefen-karte.png'))
        shot(pg, '3-pruefen.png')
        pg.fill('#title', 'GPS-Testrunde Werdersee')
        pg.check('input[name="public_ends"]')
        pg.click('button:has-text("Route einreichen")')
        pg.wait_for_url('**/routen/*', timeout=20000)
        rid = pg.url.split('/routen/')[1].split('?')[0]
        q.execute("select ST_AsGeoJSON(geom), distance_m from stroller_routes where id = %s", (rid,))
        import json
        geo, dm = q.fetchone()
        coords = json.loads(geo)['coordinates']
        d_start = dist(walk[0], coords[0]); d_end = dist(walk[-1], coords[-1])
        check(40 <= d_start <= 60 and 40 <= d_end <= 60, f'Gespeicherte Route beginnt/endet ~50 m vom echten Anfang/Ende ({d_start:.0f} m / {d_end:.0f} m)')
        check(len(coords) <= 500 and 480 <= dm <= 520, f'{len(coords)} Punkte, {dm:.0f} m Länge (600 − 2 × 50)')
        check(all(dist((lo, la), (walk[30][0] + 0.001, walk[30][1] + 0.001)) > 50 for lo, la in coords), 'Abstecher während der Pause nicht in der Route')
        q.execute("select column_name from information_schema.columns where table_name = 'stroller_routes' and data_type like 'timestamp%'")
        cols = {r[0] for r in q.fetchall()}
        check(not any(k in cols for k in ('recorded_at', 'started_at', 'track_times')), f'Keine Aufzeichnungszeiten gespeichert (Zeitspalten: {sorted(cols)})')
        # Verwerfen löscht die Aufzeichnung
        pg.goto(BASE + '/routen/neu', wait_until='networkidle')
        pg.click('button[role="tab"]:has-text("Per GPS aufzeichnen")')
        pg.click('button:has-text("Aufzeichnung starten")')
        for lo, la in walk[:5]:
            ctx.set_geolocation({'latitude': la, 'longitude': lo, 'accuracy': 6}); pg.wait_for_timeout(120)
        pg.click('button:has-text("Verwerfen")')
        check(pg.locator('button:has-text("Aufzeichnung starten")').count() == 1, 'Verwerfen löscht die Aufzeichnung')
        # Ungenaues GPS wird nicht aufgezeichnet
        pg.click('button:has-text("Aufzeichnung starten")')
        ctx.set_geolocation({'latitude': walk[3][1], 'longitude': walk[3][0], 'accuracy': 120}); pg.wait_for_timeout(500)
        check('0 km' in pg.locator('.stats').inner_text() or '0,00 km' in pg.locator('.stats').inner_text(), 'GPS mit ± 120 m wird verworfen')
        b.close()
finally:
    srv.terminate()
print(f"\n{fails} Fehler." if fails else '\nGPS-Route: alle Prüfungen bestanden.')
sys.exit(1 if fails else 0)
