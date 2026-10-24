#!/usr/bin/env python3
"""Barrierefreiheit automatisch prüfen (Querschnitt, Abschnitt 8.3) mit axe-core in echtem Chromium.

Läuft lokal NACH dem Rauchtest (nutzt dessen Datenbank und Konten):

    TEST_DATABASE_URL=postgres://… node scripts/smoke-test.mjs
    TEST_DATABASE_URL=postgres://… python3 scripts/a11y-check.py

Geprüft: WCAG 2.1 A/AA-Regeln von axe-core auf den wichtigsten Seiten – ohne Anmeldung, als Mitglied und in der
Verwaltung, hell und dunkel, Handy- und Desktopbreite. „Schwer“/„kritisch“ = Fehler, Rest wird nur gemeldet.
Ersetzt keinen Test mit Screenreader und echten Menschen (bleibt vorgesehen).
"""
import hashlib, os, secrets, subprocess, sys, time, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright

DB = os.environ['TEST_DATABASE_URL']
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'http://127.0.0.1:3999'
AXE = open(os.path.join(APP, 'node_modules/axe-core/axe.min.js')).read()
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3999', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', TURN_ENABLED='false', NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')

PUBLIC = ['/', '/+MENU', '/mehr', '/karte', '/anmelden', '/registrieren', '/kompass', '/kompass/geburt', '/routen', '/hinweise', '/impressum', '/datenschutz', '/partnerlinks', '/veranstaltungen', '/warnungen?region=04011', '/warnungen/smoke.dwd.1']
MEMBER = ['/', '/+MENU', '/mehr', '/community/neu', '/profil/familie', '/profil/sicherheit', '/nachrichten/sicherheit', '/community', '/nachrichten', '/profil', '/profil/bearbeiten', '/marktplatz', '/hilfe', '/hinweise/neu', '/routen/neu', '/einladungen', '/radar', '/veranstaltungen', '/einrichtungen', '/ORT', '/warnungen', '/community?bereich=team', '/feedback']
ADMIN = ['/admin', '/admin/statistik', '/admin/rechtstexte', '/admin/hinweise', '/admin/moderation', '/admin/nutzer', '/admin/rechte', '/admin/gruppen', '/admin/freigaben', '/admin/protokoll', '/admin/routen', '/admin/affiliate', '/admin/daten', '/admin/rundnachrichten', '/admin/feedback']

def wait_http(url, n=150):
    for _ in range(n):
        try:
            urllib.request.urlopen(url, timeout=2); return True
        except Exception:
            time.sleep(0.3)
    return False

subprocess.run(['node', 'scripts/migrate.mjs'], cwd=APP, env=env, check=True, capture_output=True)
srv = subprocess.Popen(['node', 'build'], cwd=APP, env=env, stdout=open('/tmp/kd-a11y-srv.log', 'w'), stderr=subprocess.STDOUT)
serious = 0
report = {}
try:
    if not wait_http(BASE + '/healthz'):
        print('FEHL Server startet nicht'); sys.exit(1)
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    def sess(email):
        t = secrets.token_urlsafe(32)
        q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) select %s, id, true, now() + interval '1 day' from users where email = %s", (hashlib.sha256(t.encode()).hexdigest(), email))
        return t
    q.execute("select u.email from users u join role_assignments r on r.user_id = u.id and r.role_key = 'superadmin' limit 1")
    admin = q.fetchone()[0]
    q.execute("select id from places where status = 'aktiv' and kind = 'spielplatz' limit 1")
    ort = q.fetchone()[0]
    with sync_playwright() as p:
        b = p.chromium.launch()
        runs = [('ohne Anmeldung', None, PUBLIC), ('Mitglied', 'dora@example.org', MEMBER), ('Verwaltung', admin, ADMIN)]
        for who, email, pages in runs:
            for scheme, w in [('light', 390), ('dark', 1280)]:
                ctx = b.new_context(viewport={'width': w, 'height': 900}, color_scheme=scheme, bypass_csp=True)  # nur für das Prüfskript
                if email:
                    ctx.add_cookies([{'name': 'kd_session', 'value': sess(email), 'url': BASE}])
                pg = ctx.new_page()
                for path in pages:
                    url = BASE + path.replace('/ORT', f'/orte/{ort}').replace('/+MENU', '/')
                    pg.goto(url, wait_until='networkidle')
                    pg.wait_for_timeout(600)
                    if path == '/+MENU':  # Menü geöffnet prüfen (F-016): Aufklapper am Computer, Blatt am Handy
                        pg.click('[data-toggle="community"]' if w >= 960 else '.tabs a[href="/mehr"]')
                        pg.wait_for_timeout(400)
                    pg.add_script_tag(content=AXE)
                    res = pg.evaluate("""async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
                        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, target: v.nodes.slice(0, 3).map(x => x.target.join(' ')) })) }""")
                    for v in res:
                        key = (v['id'], v['impact'])
                        report.setdefault(key, {'help': v['help'], 'where': set()})
                        report[key]['where'].add(f"{path} [{who}, {scheme}, {w}px] {', '.join(v['target'])}")
                        if v['impact'] in ('serious', 'critical'): serious += 1
                ctx.close()
        b.close()
finally:
    srv.terminate()

for (rid, impact), v in sorted(report.items(), key=lambda x: (x[0][1] not in ('critical', 'serious'), x[0][0])):
    print(f"{'FEHL' if impact in ('serious', 'critical') else 'INFO'} {rid} ({impact}): {v['help']}")
    for w in sorted(v['where'])[:6]: print('       ', w)
print(f"\n{serious} schwere Verstöße." if serious else '\nKeine schweren Verstöße (WCAG 2.1 A/AA, axe-core).')
sys.exit(1 if serious else 0)
