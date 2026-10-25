#!/usr/bin/env python3
"""Browsertest F-053: Warnkarte auf /warnungen – Fläche einer NINA-Meldung antippen zeigt die Meldung mit Link.
Läuft NACH dem Rauchtest (nutzt dessen Datenbank mit „smoke.nina.1“ bei Bremen):
    TEST_DATABASE_URL=postgres://… python3 scripts/warnkarte-check.py [Ordner/Präfix für Bildschirmfotos]"""
import os, sys, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ['TEST_DATABASE_URL']; BASE = 'http://127.0.0.1:3999'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3999', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', NO_PROXY='127.0.0.1', no_proxy='127.0.0.1')
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
fails = 0
try:
    for _ in range(100):
        try: urllib.request.urlopen(BASE + '/healthz', timeout=2); break
        except Exception: time.sleep(0.3)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vp, touch in [({'width': 1150, 'height': 900}, False), ({'width': 390, 'height': 844}, True)]:
            ctx = b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
            pg.goto(BASE + '/warnungen', wait_until='networkidle'); pg.wait_for_timeout(3500)
            pg.locator('.wm .map').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
            pg.evaluate("() => { const m = document.querySelector('.wm .map').__kdMap; m.jumpTo({ center: [8.85, 53.04], zoom: 9 }); }")
            pg.wait_for_timeout(1200)
            pt = pg.evaluate("() => document.querySelector('.wm .map').__kdMap.project([8.86, 53.03])")
            box = pg.locator('.wm .map').bounding_box()
            x, y = box['x'] + pt['x'], box['y'] + pt['y']
            pg.mouse.click(x, y) if not touch else pg.touchscreen.tap(x, y)
            pg.wait_for_timeout(700)
            ok = pg.locator('.wm .card a:has-text("Smoke: Trinkwasser abkochen")').count() > 0
            print(('OK   ' if ok else 'FEHL ') + 'Fläche antippen zeigt NINA-Meldung', 'Handy' if touch else 'Computer')
            fails += 0 if ok else 1
            if len(sys.argv) > 1: pg.locator('.wm').screenshot(path=f"{sys.argv[1]}-{'handy' if touch else 'pc'}.png")
            ctx.close()
        b.close()
finally:
    srv.terminate()
sys.exit(1 if fails else 0)
