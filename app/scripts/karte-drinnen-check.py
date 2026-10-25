#!/usr/bin/env python3
"""Browsertest F-056/F-057: Karte zeigt bei Wetterwarnung am Kartenpunkt den Hinweis mit „Lieber drinnen“ (Filter Indoor, Bibliothek, Bäder, Familienzentrum)
und bei erwartetem Regen (Radar-Nachbau) den Satz „Regen in der Nähe“.
Läuft NACH dem Rauchtest (nutzt dessen Datenbank mit „smoke.dwd.1“ bei Bremen):
    TEST_DATABASE_URL=postgres://… python3 scripts/karte-drinnen-check.py [Präfix für Bildschirmfotos]"""
import os, sys, subprocess, time, urllib.request, json, threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ['TEST_DATABASE_URL']; BASE = 'http://127.0.0.1:3999'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3999', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', NO_PROXY='127.0.0.1', no_proxy='127.0.0.1')
class Radar(BaseHTTPRequestHandler):
    def do_GET(self):
        t0 = int(time.time() // 300 * 300)
        radar = [{'timestamp': datetime.fromtimestamp(t0 + i * 300, timezone.utc).isoformat(), 'source': 'RADARCOMP::RV::test',
                  'precipitation_5': [[0, 30 if 70 <= i * 5 < 130 else 0, 0], [0, 0, 0], [None, 0, 0]]} for i in range(25)]
        body = json.dumps({'radar': radar, 'geometry': {}, 'bbox': [1, 2, 3, 4]}).encode()
        self.send_response(200); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
rad = HTTPServer(('127.0.0.1', 3997), Radar); threading.Thread(target=rad.serve_forever, daemon=True).start()
env['BRIGHTSKY_URL'] = 'http://127.0.0.1:3997'
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
fails = 0
def check(ok, msg):
    global fails
    print(('OK   ' if ok else 'FEHL ') + msg)
    fails += 0 if ok else 1
try:
    for _ in range(100):
        try: urllib.request.urlopen(BASE + '/healthz', timeout=2); break
        except Exception: time.sleep(0.3)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vp, touch in [({'width': 1150, 'height': 900}, False), ({'width': 390, 'height': 844}, True)]:
            who = 'Handy' if touch else 'Computer'
            ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
            reqs = []
            pg.on('request', lambda r: reqs.append(r.url))
            # Punkt in der Warnfläche (Bremen): Hinweis erscheint
            pg.goto(BASE + '/karte?lon=8.85&lat=53.03&z=11', wait_until='networkidle'); pg.wait_for_timeout(2500)
            wx = pg.locator('.wx')
            check(wx.count() == 1 and 'Unwetterwarnung' in wx.inner_text() and 'ORKANBÖEN' in wx.inner_text(), f'Hinweis „Unwetterwarnung hier“ ({who})')
            check(pg.locator('.wx .rain').count() == 1 and 'Regen ab ca.' in pg.locator('.wx .rain').inner_text() and 'Deutscher Wetterdienst' in pg.locator('.wx .rain').inner_text(), f'Regen in der Nähe mit Quelle ({who})')
            check(pg.locator('.wx a[href="/warnungen/smoke.dwd.1"]').count() == 1, f'Hinweis verlinkt die Warnung ({who})')
            reqs.clear()
            pg.locator('.wx button:has-text("Lieber drinnen")').click(); pg.wait_for_timeout(1500)
            pressed = [t for t in ('Drinnen spielen', 'Bibliotheken', 'Familienzentren', 'Spielplätze') if pg.locator(f'.chips button.chip[aria-pressed="true"]:has-text("{t}")').count()]
            check(pressed == ['Drinnen spielen', 'Bibliotheken', 'Familienzentren'], f'„Lieber drinnen“ schaltet Drinnen, Bibliotheken, Familienzentren ein ({who}: {pressed})')
            check(any('baeder' in u for u in reqs), f'Karte fragt auch Bäder ab ({who})')
            check(pg.locator('.wx button:has-text("Alle Orte zeigen")').count() == 1, f'Knopf wechselt auf „Alle Orte zeigen“ ({who})')
            if len(sys.argv) > 1: pg.screenshot(path=f"{sys.argv[1]}-{'handy' if touch else 'pc'}.png")
            pg.locator('.wx button:has-text("Alle Orte zeigen")').click(); pg.wait_for_timeout(500)
            check(pg.locator('.chips button.chip[aria-pressed="true"]').count() == 0, f'„Alle Orte zeigen“ löscht den Filter ({who})')
            ctx.close()
            # Punkt ohne Warnung (München): kein Hinweis
            ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
            pg.goto(BASE + '/karte?lon=11.58&lat=48.14&z=11', wait_until='networkidle'); pg.wait_for_timeout(2500)
            check(pg.locator('.wx p:not(.rain)').count() == 0, f'ohne Warnung keine Warnzeile ({who})')
            check(pg.locator('.wx .rain').count() == 1 and pg.locator('.wx button:has-text("Lieber drinnen")').count() == 1, f'Regen allein zeigt „Lieber drinnen“ ({who})')
            ctx.close()
        b.close()
finally:
    srv.terminate()
rad.shutdown()
sys.exit(1 if fails else 0)
