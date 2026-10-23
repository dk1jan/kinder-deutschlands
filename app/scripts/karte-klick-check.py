#!/usr/bin/env python3
"""Browsertest F-035: Zusatzpunkt (Einrichtung) auf der Familienkarte antippen – am Computer und am Handy.
Läuft NACH dem Rauchtest (nutzt dessen Datenbank mit „Smoke-Jugendfarm“ bei 8.80/53.07):
    TEST_DATABASE_URL=postgres://… python3 scripts/karte-klick-check.py [Ordner/Präfix für Bildschirmfotos]"""
import os, sys, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright
APP='/home/claude/kinder-deutschlands/app'; DB=os.environ['TEST_DATABASE_URL']; BASE='http://127.0.0.1:3999'
env=dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48,'x'), PORT='3999', SCHEDULER='off', BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', NO_PROXY='127.0.0.1', no_proxy='127.0.0.1')
srv=subprocess.Popen(['node','build'],cwd=APP,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
try:
    for _ in range(100):
        try: urllib.request.urlopen(BASE+'/healthz',timeout=2); break
        except Exception: time.sleep(0.3)
    with sync_playwright() as p:
        b=p.chromium.launch()
        for vp,touch in [({'width':1150,'height':900},False),({'width':390,'height':844},True)]:
            ctx=b.new_context(viewport=vp, has_touch=touch, is_mobile=touch); pg=ctx.new_page()
            pg.goto(BASE+'/karte?lon=8.8&lat=53.07&z=16', wait_until='networkidle'); pg.wait_for_timeout(4000)
            cb=pg.locator('.maplibregl-canvas').bounding_box()
            x,y=cb['x']+cb['width']/2, cb['y']+cb['height']/2
            if touch: pg.touchscreen.tap(x,y)
            else: pg.mouse.click(x,y)
            pg.wait_for_timeout(800)
            ok=pg.locator('text=Smoke-Jugendfarm').count()>0
            print('OK  ' if ok else 'FEHL', 'Klick auf Einrichtung zeigt Karte', 'Handy' if touch else 'Computer')
            (len(sys.argv) > 1 and pg.screenshot(path=f"{sys.argv[1]}-{'handy' if touch else 'pc'}.png")); ctx.close()
        b.close()
finally: srv.terminate()
