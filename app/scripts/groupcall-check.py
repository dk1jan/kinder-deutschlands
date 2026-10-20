#!/usr/bin/env python3
"""Browsertest für Gruppenanrufe (D-072): drei echte Chromium-Fenster, echter Chat-Server, echter Medienserver (LiveKit),
Ende-zu-Ende-Verschlüsselung von Bild und Ton mit Schlüssel aus dem verschlüsselten Chat.

Läuft lokal NACH dem Rauchtest mit Chat-Server (nutzt dessen Datenbank und Synapse-Konfiguration; Anna und Dora sind
dort Kontakte geworden, Emil legt dieser Test als dritten Kontakt von Anna an):

    TEST_DATABASE_URL=postgres://… SYNAPSE_PYTHON=/opt/synvenv/bin/python LIVEKIT_BIN=/opt/livekit/livekit-server node scripts/smoke-test.mjs
    TEST_DATABASE_URL=postgres://… SYNAPSE_PYTHON=/opt/synvenv/bin/python LIVEKIT_BIN=/opt/livekit/livekit-server python3 scripts/groupcall-check.py

Kamera und Mikrofon sind künstlich (Chromium „fake device“: bewegtes Bild, Piepton). Geprüft: Anna legt eine Gruppe mit
Dora und Emil an, startet einen Videoanruf; Dora tritt mit Ton bei, Emil mit Video; alle sehen drei Kacheln, empfangen
entschlüsseltes Bild (Bildgröße > 0, Bild läuft weiter) und hörbaren Ton (Pegel > 0); Stummschalten wird bei den anderen
angezeigt; Hinweis „Gruppenanruf läuft“ im Chat; Verlassen und Auflegen. Netz-Durchgang über Mobilfunk/TURN lässt sich
nur auf dem Server prüfen.
"""
import base64, hashlib, hmac, json, os, secrets, subprocess, sys, time, urllib.request
import psycopg2
from playwright.sync_api import sync_playwright

DB = os.environ['TEST_DATABASE_URL']
PY = os.environ['SYNAPSE_PYTHON']
LK = os.environ['LIVEKIT_BIN']
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYN = '/tmp/kd-smoke-synapse'
BASE = 'http://127.0.0.1:3999'
env = dict(os.environ, DATABASE_URL=DB, APP_URL=BASE, ORIGIN=BASE, APP_SECRET='smoke-test-secret-'.ljust(48, 'x'), PORT='3999', SCHEDULER='off',
           BACKUP_DIR='/tmp/kd-smoke-backups', TILES_DIR='/tmp/kd-smoke-tiles', SYNAPSE_URL='http://127.0.0.1:8019', SYNAPSE_CONFIG_DIR=f'{SYN}/config',
           SYNAPSE_DB='synapse_smoke', SYNAPSE_MEDIA_STORE=f'{SYN}/media', SYNAPSE_PORT='8019', SYNAPSE_BIND='127.0.0.1', SYNAPSE_PID_FILE=f'{SYN}/homeserver.pid',
           SYNAPSE_PUSH_ALLOW='127.0.0.0/8', CHAT_INTERNAL_URL=BASE, TURN_ENABLED='false', LIVEKIT_URL='http://127.0.0.1:7880',
           NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost')

def hmac_hkdf(ikm, info, salt=b'kinder-deutschlands', n=32):
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    return hmac.new(prk, info + b'\x01', hashlib.sha256).digest()[:n]

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
lk = subprocess.Popen([LK, '--config', f'{SYN}/config/livekit.yaml'], stdout=open('/tmp/kd-gc-livekit.log', 'w'), stderr=subprocess.STDOUT)
srv = subprocess.Popen(['node', 'scripts/server.mjs'], cwd=APP, env=env, stdout=open('/tmp/kd-gc-srv.log', 'w'), stderr=subprocess.STDOUT)
try:
    check(wait_http(BASE + '/healthz') and wait_http('http://127.0.0.1:8019/health') and wait_http('http://127.0.0.1:7880'), 'App, Chat-Server und Medienserver laufen')
    c = psycopg2.connect(DB); c.autocommit = True; q = c.cursor()
    # Emil als dritter Kontakt von Anna (Testdaten, nur für diesen Lauf)
    q.execute("select id from users where email = 'emil@example.org'")
    if not q.fetchone():
        q.execute("insert into users (email, password_hash, email_verified_at) values ('emil@example.org', '!', now()) returning id")
        emil_id = q.fetchone()[0]
        q.execute("insert into user_profiles (user_id, contact_id, display_name) values (%s, 'EMIL7K2QZ', 'Emil')", (emil_id,))
        q.execute("select id from users where email = 'anna@example.org'")
        anna_id = q.fetchone()[0]
        a, b = sorted([str(anna_id), str(emil_id)])
        q.execute("insert into contacts (user_a, user_b) values (%s, %s)", (a, b))
    def sess(email):
        t = secrets.token_urlsafe(32)
        q.execute("insert into sessions (id_hash, user_id, mfa_verified, expires_at) select %s, id, true, now() + interval '1 day' from users where email = %s", (hashlib.sha256(t.encode()).hexdigest(), email))
        return t
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        def page_for(email):
            ctx = b.new_context(permissions=['camera', 'microphone'], viewport={'width': 1100, 'height': 760})
            ctx.add_cookies([{'name': 'kd_session', 'value': sess(email), 'url': BASE}])
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: print('  JS-Fehler', email, e))
            pg.on('console', lambda m: print('  Konsole', email, m.type, m.text[:300]) if m.type in ('error', 'warning') and ('nruf' in m.text or 'livekit' in m.text.lower() or 'encrypt' in m.text.lower()) else None)
            return pg
        anna, dora, emil = page_for('anna@example.org'), page_for('dora@example.org'), page_for('emil@example.org')
        for pg in (anna, dora, emil):
            pg.goto(BASE + '/nachrichten')
        anna.wait_for_timeout(6000)
        # Gruppe anlegen (Anna lädt ihre Kontakte Dora und Emil ein)
        anna.goto(BASE + '/nachrichten/gruppe/neu')
        anna.wait_for_selector('#g-name', timeout=30000)
        anna.fill('#g-name', 'Spielplatzrunde Test')
        anna.wait_for_selector('label.check:has-text("Dora") input', timeout=30000)
        anna.check('label.check:has-text("Dora") input')
        anna.check('label.check:has-text("Emil") input')
        anna.click('button:has-text("Gruppe anlegen")')
        anna.wait_for_url('**/nachrichten/chat/!**', timeout=40000)
        room_url = anna.url
        check(True, 'Anna legt die Gruppe mit Dora und Emil an')
        for pg in (dora, emil):
            pg.goto(room_url)
            pg.wait_for_selector('button:has-text("Annehmen")', timeout=40000)
            pg.click('button:has-text("Annehmen")')
            pg.wait_for_selector('#cmp-t', timeout=40000)
        check(True, 'Dora und Emil nehmen die Einladung an')
        anna.wait_for_selector('button[aria-label="Gruppenanruf starten (Video)"]', timeout=40000)
        check(True, 'Gruppenanruf-Knöpfe in der Gruppe')
        anna.click('button[aria-label="Gruppenanruf starten (Video)"]')
        anna.wait_for_selector('.gc .sub:has-text("dabei")', timeout=40000)
        check(True, 'Anna ist im Anruf (Schlüssel im eigenen Browser erzeugt)')
        # Hinweis im Chat und im Verlauf
        dora.wait_for_selector('.gcbanner:has-text("Gruppenanruf läuft")', timeout=40000)
        check(True, 'Dora sieht „Gruppenanruf läuft · Beitreten“')
        dora.wait_for_selector('.callev:has-text("Gruppenanruf gestartet")', timeout=20000)
        check(True, 'Verlauf zeigt „hat einen Gruppenanruf gestartet“ (verschlüsseltes Ereignis)')
        dora.click('.gcbanner button:has-text("Beitreten")')
        emil.wait_for_selector('.gcbanner button:has-text("Mit Video")', timeout=40000)
        emil.click('.gcbanner button:has-text("Mit Video")')
        for pg, who in ((dora, 'Dora'), (emil, 'Emil')):
            try:
                pg.wait_for_selector('.gc .sub:has-text("dabei")', timeout=75000)
                check(True, f'{who}: Schlüssel über den verschlüsselten Chat erhalten, verbunden')
            except Exception:
                pg.screenshot(path=f'/tmp/kd-gc-fehl-{who}.png')
                check(False, f'{who}: verbunden – Anzeige: {pg.evaluate("() => (document.querySelector(\'.gc, .gcbanner, .notice, [role=alert]\')?.innerText || document.body.innerText).slice(0, 400)")}')
                raise
        def tiles(pg):
            return pg.evaluate("() => document.querySelectorAll('.gc .tile').length")
        for _ in range(40):
            if tiles(anna) == 3 and tiles(dora) == 3 and tiles(emil) == 3: break
            anna.wait_for_timeout(500)
        check(tiles(anna) == 3 and tiles(dora) == 3 and tiles(emil) == 3, f'Alle sehen drei Kacheln ({tiles(anna)}/{tiles(dora)}/{tiles(emil)})')
        anna.wait_for_timeout(5000)
        # Beim Medienserver: alle Spuren Ende-zu-Ende-verschlüsselt (er kann sie nicht lesen)
        def lk_api(method, body, video):
            key = base64.urlsafe_b64encode(hmac_hkdf(env['APP_SECRET'].encode(), b'chat:livekit')).decode().rstrip('=')
            b64 = lambda o: base64.urlsafe_b64encode(json.dumps(o, separators=(',', ':')).encode()).decode().rstrip('=')
            n = int(time.time())
            h, pl = b64({'alg': 'HS256', 'typ': 'JWT'}), b64({'iss': 'kd-app', 'nbf': n - 5, 'exp': n + 60, 'video': video})
            sig = base64.urlsafe_b64encode(hmac.new(key.encode(), f'{h}.{pl}'.encode(), hashlib.sha256).digest()).decode().rstrip('=')
            rq = urllib.request.Request(f'http://127.0.0.1:7880/twirp/livekit.RoomService/{method}', data=json.dumps(body).encode(), headers={'authorization': f'Bearer {h}.{pl}.{sig}', 'content-type': 'application/json'})
            return json.loads(urllib.request.urlopen(rq, timeout=5).read())
        rooms = lk_api('ListRooms', {}, {'roomList': True}).get('rooms', [])
        tracks = []
        for r in rooms:
            for pp in lk_api('ListParticipants', {'room': r['name']}, {'roomAdmin': True, 'room': r['name']}).get('participants', []):
                tracks += [(t.get('type'), t.get('encryption')) for t in pp.get('tracks', [])]
        check(len(tracks) >= 5 and all(e not in (None, '', 'NONE') for _, e in tracks), f'Medienserver: alle {len(tracks)} Spuren Ende-zu-Ende-verschlüsselt ({sorted(set(e for _, e in tracks if e))})')
        VIDEO = """() => [...document.querySelectorAll('.gc .tile video')].filter(v => !v.classList.contains('mirror')).map(v => ({ w: v.videoWidth, t: v.currentTime }))"""
        # Ton hörbar? Pegel der empfangenen (entschlüsselten) Tonspuren messen
        AUDIO = """async () => { const els = [...document.querySelectorAll('.audio audio')]; const ctx = new AudioContext(); await ctx.resume();
            const out = []; for (const el of els) { const s = el.srcObject; if (!s || !s.getAudioTracks().length) { out.push(-1); continue; }
              const src = ctx.createMediaStreamSource(s); const an = ctx.createAnalyser(); an.fftSize = 2048; src.connect(an);
              let peak = 0; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 100)); const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); for (const x of d) peak = Math.max(peak, Math.abs(x)); }
              out.push(Math.round(peak * 1000) / 1000); }
            ctx.close(); return out; }"""
        for pg, who, n_video in ((anna, 'Anna', 1), (dora, 'Dora', 2), (emil, 'Emil', 1)):
            v1 = pg.evaluate(VIDEO); pg.wait_for_timeout(1500); v2 = pg.evaluate(VIDEO)
            moving = [a['w'] > 0 and b['t'] > a['t'] for a, b in zip(v1, v2)]
            check(len(v1) == n_video and all(moving), f'{who} empfängt entschlüsseltes Bild von {n_video} Person(en) ({v2})')
            lv = pg.evaluate(AUDIO)
            check(len(lv) == 2 and all(x > 0.01 for x in lv), f'{who} hört beide anderen (Pegel {lv})')
        anna.screenshot(path='/tmp/kd-gc-anna.png'); emil.screenshot(path='/tmp/kd-gc-emil.png')
        # Stumm wird bei den anderen angezeigt
        anna.click('.gc button:has-text("Stumm")')
        emil.wait_for_selector('.gc .tile:has-text("Anna") .sr:has-text("stumm")', timeout=15000)
        check(True, 'Anna schaltet stumm – Emil sieht es')
        anna.click('.gc button:has-text("Ton an")')
        # Verkleinern: Chat bleibt nutzbar, Ton läuft weiter
        dora.click('button[aria-label="Verkleinern (Chat nutzen)"]')
        check(dora.is_visible('.mini') and dora.is_visible('#cmp-t') and dora.evaluate("() => document.querySelectorAll('.audio audio').length") == 2, 'Dora verkleinert: Chat nutzbar, Ton läuft weiter')
        # Verlassen
        emil.click('.gc button:has-text("Auflegen")')
        emil.wait_for_selector('text=Du hast den Anruf verlassen', timeout=10000)
        for _ in range(30):
            if tiles(anna) == 2: break
            anna.wait_for_timeout(500)
        check(tiles(anna) == 2, 'Emil legt auf – bei Anna nur noch zwei Kacheln')
        # Wer neu beitritt, bekommt den Schlüssel erneut (Emil kommt zurück)
        emil.wait_for_selector('.gcbanner button:has-text("Beitreten")', timeout=40000)
        emil.click('.gcbanner button:has-text("Beitreten")')
        emil.wait_for_selector('.gc .sub:has-text("3 dabei")', timeout=75000)
        emil.wait_for_timeout(3000)
        lv = emil.evaluate(AUDIO)
        check(len(lv) == 2 and all(x > 0.01 for x in lv), f'Emil tritt erneut bei und hört wieder beide (Pegel {lv})')
        for pg in (anna, dora, emil):
            pg.evaluate("() => document.querySelector('.gc button.no, .mini button.no')?.click()")
        anna.wait_for_timeout(1500)
        check(anna.evaluate("() => !document.querySelector('.gc .tile')"), 'Alle legen auf – Anruf beendet')
        b.close()
finally:
    srv.terminate(); syn.terminate(); lk.kill()
    time.sleep(1)

print(f'\n{failures} Prüfung(en) fehlgeschlagen.' if failures else '\nGruppenanruf-Test bestanden.')
sys.exit(1 if failures else 0)
