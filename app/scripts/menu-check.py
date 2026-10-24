#!/usr/bin/env python3
"""Menü im echten Browser prüfen (F-016, D-073). Läuft lokal NACH dem Rauchtest (nutzt dessen Datenbank):

    TEST_DATABASE_URL=postgres://… python3 scripts/menu-check.py [Ordner für Bildschirmfotos]

Geprüft am Computer (1280 px): Entdecken führt zur Startseite, Pfeil klappt auf, Esc schließt und gibt den Fokus
zurück, Tastatur kommt in die Einträge, Maus darüber öffnet, Klick daneben schließt, „Wissen“ klappt auf statt zu
springen, Eintrag führt zum Bereich und schließt. Am Handy (390 px): „Menü“ öffnet das Blatt mit allen Gruppen,
Esc / Schließen / Tippen daneben / nach unten wischen schließen, Eintrag navigiert. Gäste: Mitgliederbereiche mit Schloss.
Startseite: Kopf „Familien finden Familien.“ zuerst, Übersicht darunter. Ohne JavaScript: „Menü“ führt zu /mehr.
"""
import hashlib, os, secrets, subprocess, sys, time, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright

DB = os.environ['TEST_DATABASE_URL']
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'http://127.0.0.1:3998'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3998', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', TURN_ENABLED='false', NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')
fails = 0

def check(ok, msg):
    global fails
    print(('OK    ' if ok else 'FEHL  ') + msg)
    if not ok: fails += 1

def wait_http(url, n=150):
    for _ in range(n):
        try:
            urllib.request.urlopen(url, timeout=2); return True
        except Exception:
            time.sleep(0.3)
    return False

def shot(pg, name, full=False):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, name), full_page=full)

subprocess.run(['node', 'scripts/migrate.mjs'], cwd=APP, env=env, check=True, capture_output=True)
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=open('/tmp/kd-menu-srv.log', 'w'), stderr=subprocess.STDOUT)
try:
    if not wait_http(BASE + '/healthz'):
        print('FEHL Server startet nicht'); sys.exit(1)
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    t = secrets.token_urlsafe(32)
    q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) select %s, id, true, now() + interval '1 day' from users where email = 'dora@example.org'", (hashlib.sha256(t.encode()).hexdigest(),))
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---------- Computer, Mitglied ----------
        ctx = b.new_context(viewport={'width': 1280, 'height': 860}, color_scheme='dark')
        ctx.add_cookies([{'name': 'kd_session', 'value': t, 'url': BASE}])
        pg = ctx.new_page()
        pg.goto(BASE + '/', wait_until='networkidle')
        top = pg.locator('h1.display').bounding_box()
        check(top is not None and top['y'] < 400, f"Startseite: Kopf „Familien finden Familien.“ oben sichtbar (y={top and round(top['y'])})")
        over = pg.locator('#bereiche').bounding_box()
        check(over is not None and over['y'] > top['y'] + 300, 'Startseite: Übersicht „Was es hier alles gibt“ weiter unten')
        shot(pg, '1-startseite-computer.png')
        pg.locator('#bereiche').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
        shot(pg, '1b-uebersicht-computer.png')
        pg.evaluate('window.scrollTo(0, 0)')
        panel = pg.locator('#menu-entdecken')
        check(panel.is_hidden(), 'Menü Entdecken anfangs zu')
        pg.click('[data-toggle="entdecken"]')
        check(panel.is_visible() and pg.get_attribute('[data-toggle="entdecken"]', 'aria-expanded') == 'true', 'Pfeil an Entdecken klappt auf (aria-expanded)')
        labels = panel.locator('strong').all_inner_texts()
        check(labels == ['Was machen wir heute?', 'Veranstaltungen', 'Kinderwagenrouten', 'Freie Plätze & Kurse', 'Einrichtungen'], f'Entdecken: Einträge {labels}')
        check('Startseite' not in ' '.join(labels), 'Kein Punkt „Startseite“')
        pg.wait_for_timeout(200)
        shot(pg, '2-menue-entdecken.png')
        pg.keyboard.press('Tab')
        focused = pg.evaluate("document.activeElement?.closest('#menu-entdecken') !== null")
        check(focused, 'Tab führt in die Einträge')
        pg.keyboard.press('Escape')
        check(panel.is_hidden() and pg.evaluate("document.activeElement?.dataset.toggle") == 'entdecken', 'Esc schließt, Fokus zurück auf den Pfeil')
        pg.mouse.move(10, 600)
        pg.hover('[data-toggle="community"]')
        pg.wait_for_timeout(150)
        check(pg.locator('#menu-community').is_visible(), 'Maus darüber öffnet Community')
        lc = pg.locator('#menu-community strong').all_inner_texts()
        check(lc == ['Familien helfen Familien', 'Marktplatz', 'Einladungen', 'Treffen per QR'], f'Community: Einträge {lc}')
        pg.hover('#menu-community a[href="/marktplatz"]')
        pg.wait_for_timeout(350)
        check(pg.locator('#menu-community').is_visible(), 'Menü bleibt offen beim Hinüberfahren')
        shot(pg, '3-menue-community.png')
        pg.mouse.move(640, 700); pg.wait_for_timeout(400)
        check(pg.locator('#menu-community').is_hidden(), 'Maus weg schließt')
        url0 = pg.url
        pg.click('a[data-toggle="wissen"]')
        check(pg.url == url0 and pg.locator('#menu-wissen').is_visible(), '„Wissen“ klappt auf statt zu springen')
        lw = pg.locator('#menu-wissen strong').all_inner_texts()
        check(lw == ['Unwetterwarnungen', 'Hinweise & Fristen', 'Lebenslagen-Kompass', 'Familienradar'], f'Wissen: Einträge {lw}')
        shot(pg, '4-menue-wissen.png')
        pg.mouse.click(640, 700)
        check(pg.locator('#menu-wissen').is_hidden(), 'Klick daneben schließt')
        pg.click('[data-toggle="wissen"]'); pg.click('#menu-wissen a[href="/kompass"]')
        pg.wait_for_url('**/kompass')
        check(pg.locator('#menu-wissen').is_hidden() and pg.locator('.grp.cur a[data-toggle="wissen"]').count() == 1, 'Eintrag führt zum Bereich, Menü zu, „Wissen“ markiert')
        pg.click('.desk a.top-link[href="/"]'); pg.wait_for_url(BASE + '/')
        check(pg.url == BASE + '/', 'Klick auf „Entdecken“ führt zur Startseite')
        ctx.close()

        # ---------- Handy, Gast ----------
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='light', has_touch=True, is_mobile=True)
        pg = ctx.new_page()
        pg.goto(BASE + '/', wait_until='networkidle')
        shot(pg, '5-startseite-handy.png')
        tabs = pg.locator('.tabs .label').all_inner_texts()
        check(tabs == ['Entdecken', 'Karte', 'Community', 'Nachrichten', 'Menü'], f'Handy-Leiste {tabs}')
        sheet = pg.locator('dialog.sheet')
        pg.click('.tabs a[href="/mehr"]')
        check(sheet.is_visible() and pg.url == BASE + '/', '„Menü“ öffnet das Blatt (keine neue Seite)')
        check(pg.evaluate("document.querySelector('dialog.sheet').scrollTop") == 0 and pg.evaluate("document.activeElement?.classList.contains('x')"), 'Blatt beginnt oben, Fokus auf „Schließen“')
        heads = [x.strip() for x in sheet.locator('h3').all_text_contents()]
        check(heads[:3] == ['Entdecken', 'Community', 'Wissen'] and 'Konto und Infos' in heads[3], f'Blatt mit Gruppen {heads}')
        check(sheet.locator('a[href="/anmelden?weiter=%2Fmarktplatz"] .lock').count() == 1, 'Gast: Marktplatz mit Schloss → Anmeldung')
        pg.wait_for_timeout(400)
        shot(pg, '6-menue-handy.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(sheet.is_hidden(), 'Esc schließt das Blatt')
        pg.click('.tabs a[href="/mehr"]'); pg.click('dialog.sheet .x'); pg.wait_for_timeout(200)
        check(sheet.is_hidden(), '„Menü schließen“ schließt')
        pg.click('.tabs a[href="/mehr"]'); pg.wait_for_timeout(300)
        pg.mouse.click(195, 30); pg.wait_for_timeout(200)
        check(sheet.is_hidden(), 'Tippen daneben schließt')
        pg.click('.tabs a[href="/mehr"]'); pg.wait_for_timeout(300)
        for ev, y in [('touchstart', 300), ('touchmove', 380), ('touchmove', 460), ('touchend', None)]:  # wie ein Finger: einzeln nacheinander
            pg.evaluate("""([ev, y]) => { const d = document.querySelector('dialog.sheet');
                const t = y === null ? [] : [new Touch({ identifier: 1, target: d, clientY: y, clientX: 200 })];
                d.dispatchEvent(new TouchEvent(ev, { touches: t, changedTouches: t, bubbles: true })); }""", [ev, y])
            pg.wait_for_timeout(40)
        pg.wait_for_timeout(250)
        check(sheet.is_hidden(), 'Nach unten wischen schließt')
        pg.click('.tabs a[href="/mehr"]'); pg.click('dialog.sheet a[href="/routen"]'); pg.wait_for_url('**/routen')
        check(sheet.is_hidden() and pg.get_attribute('.tabs a[href="/"]', 'aria-current') == 'page', 'Eintrag navigiert, Blatt zu, Reiter „Entdecken“ markiert')
        ctx.close()

        # ---------- Handy ohne JavaScript ----------
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, java_script_enabled=False)
        pg = ctx.new_page()
        pg.goto(BASE + '/', wait_until='load'); pg.click('.tabs a[href="/mehr"]'); pg.wait_for_url('**/mehr')
        check(pg.locator('h2#wissen').count() == 1, 'Ohne JavaScript: „Menü“ öffnet die Seite /mehr mit allen Gruppen')
        ctx.close()
        b.close()
finally:
    srv.terminate()

print(f"\n{fails} Fehler." if fails else '\nMenü: alle Prüfungen bestanden.')
sys.exit(1 if fails else 0)
