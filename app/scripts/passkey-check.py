"""Passkey-Ende-zu-Ende-Prüfung mit virtuellem Authenticator (Chromium, Playwright für Python).

Nicht Teil der CI (Browser-Download zu groß für knappen GitHub-Speicher). Lokal ausführen:
  1. node scripts/smoke-test.mjs   (legt anna@example.org an; Passwort siehe unten)
  2. Server starten: APP_URL=http://localhost:3996 ORIGIN=http://localhost:3996 PORT=3996 ... node build
  3. python3 scripts/passkey-check.py [Screenshot-Ordner]
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3996"
EMAIL, PW = "anna@example.org", "Mama sucht Spielplatzfreunde 1"
shots = sys.argv[1] if len(sys.argv) > 1 else None
ok = True


def check(cond, label):
    global ok
    print(("OK    " if cond else "FEHL  ") + label)
    ok = ok and cond


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1.5, reduced_motion="reduce")
    page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    cdp.send("WebAuthn.enable")
    cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
        "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
        "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True}})

    page.goto(BASE + "/anmelden")
    page.fill("#email", EMAIL)
    page.fill("#password", PW)
    page.click("form[action*='anmelden'] button[type=submit]")
    page.wait_for_url("**/profil**")
    check("/profil" in page.url, "Anmeldung mit Passwort")
    if shots: page.screenshot(path=f"{shots}/a1-profil.png", full_page=True)

    page.goto(BASE + "/profil/sicherheit")
    page.click("text=Passkey hinzufügen")
    page.wait_for_selector("text=Passkey gespeichert", timeout=10000)
    check(page.locator("text=Entfernen").count() >= 1, "Passkey registriert und aufgelistet")
    if shots: page.screenshot(path=f"{shots}/a1-sicherheit.png", full_page=True)

    page.goto(BASE + "/profil")
    page.click("text=Abmelden")
    page.wait_for_url(BASE + "/")
    page.goto(BASE + "/anmelden")
    page.click("text=Mit Passkey anmelden")
    page.wait_for_url("**/profil**", timeout=10000)
    check("/profil" in page.url, "Anmeldung nur mit Passkey (ohne Passwort)")

    for path, name in [("/profil/bearbeiten", "a1-bearbeiten"), ("/profil/vorschau", "a1-vorschau"), ("/nachrichten", "a1-kontakte"),
                       ("/profil/qr", "a1-qr"), ("/profil/qr/druck?id=", None)]:
        if name and shots:
            page.goto(BASE + path)
            page.screenshot(path=f"{shots}/{name}.png", full_page=True)
    browser.close()

print("Alle Passkey-Prüfungen bestanden." if ok else "Passkey-Prüfung fehlgeschlagen.")
sys.exit(0 if ok else 1)
