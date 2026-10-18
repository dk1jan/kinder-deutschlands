# CHANGELOG

Neueste Einträge oben. Format: Datum · was · warum · Module · DB-Migration.

## 2026-10-18 · Abschnitt 2: Familienkarte, Orte, Datenimport, Datenzentrale

**Was**
- Gemeinsames Ortsmodell (Spielplatz, Indoorspielplatz, Wickelmöglichkeit, Toilette, Stillmöglichkeit, Familiencafé, Ausflugsort, Schwimmbad) mit dreiwertigen Merkmalen (ja/nein/unbekannt), Herkunft je Quelle, Prüfzeitpunkten, Bestätigungsstatus.
- Karte `/karte`: eigene Vektorkacheln (Protomaps-Ausschnitt Bremen + Niedersachsen, MapLibre, im Projektdesign hell/dunkel), Gruppierung, Filter-Chips nach Art und Ausstattung, Suche (Orte, Stadtteile, Gemeinden), Liste nach Entfernung, „Mein Standort“ (bleibt im Browser), Ortskarte unten, Desktop mit Seitenleiste. Liste funktioniert auch ohne JavaScript.
- Ortsseite `/orte/…`: Ausstattung, Spielgeräte, Toilette in der Nähe, Öffnungszeiten, Quelle und Aktualität, ehrlich „Noch keine Erfahrungen“, Merken, Teilen, Hinweg, Fehler melden. Defekt/Sperrung sofort als unbestätigter Hinweis; Redaktion bestätigt oder markiert als amtlich (mit Quelle).
- Ort vorschlagen `/orte/neu` mit Dublettenprüfung (80 m), sichtbar erst nach Freigabe. „Meine Orte“ im Profil.
- Datenimport (M23): Quellenkatalog (8 Quellen), Zeitplan im Web-Container, Abgleich per Prüfsumme, Vorschau/Freigabe, Schutz vor Massenentfernung (> 15 % → Vorschau), Archivieren statt Löschen, redaktionell gesperrte Felder, Dublettenerkennung (30 m), Wiederholung mit wachsendem Abstand.
- Quellen: OSM/Overpass (Spielplätze mit Spielgeräten, Toiletten, Wickeln, Indoor, Zoos/Bäder) für Bremen + Niedersachsen, BKG VG250 (Länder, Kreise, Gemeinden), OSM-Stadtteile Bremen/Bremerhaven, Protomaps-Kacheln (monatlich).
- Datenzentrale `/admin/daten`: Quellenstatus, Jetzt abrufen, Pausieren, Rhythmus/Freigaberegeln/Gebiete, Abrufe mit Vorschau (Übernehmen/Verwerfen), Prüffälle (Vorschläge, Meldungen, Dubletten mit Zusammenführen), Ortspflege mit Sperren und Hinweisen. Öffentliche Quellenseite `/karte/quellen`.
- Profil: Regionssuche statt Auswahlliste; „Familien entdecken“ schließt Unterregionen (Stadtteile) ein. Datenexport und Kontolöschung berücksichtigen Merkliste, Vorschläge, Meldungen.
- Betrieb: Image enthält `pmtiles` (feste SHA-256-Prüfsumme, da das Release keine Prüfsummendatei hat) und Kartenschriften; Compose mit Volume `tiles`, 2 GB Arbeitsspeicher. CI räumt `tmp-*`-Branches auf; manueller Prüflauf `probe.yml` für Datenquellen.
**Warum** Bauabschnitt 2 laut ROADMAP. Quellen am 18.10.2026 echt geprüft (Erreichbarkeit, Umfang, Lizenz), siehe D-020.
**Module** M10, M11, M13, M23, M24, Querschnitt · **DB-Migration** ja – `0004_orte.sql` (Quellen, Abrufe, Orte, Herkunft, Dubletten, Merkliste, Meldungen, Hinweise, Rechte `data.view`/`data.import`)
**Tests** svelte-check 0 Fehler, 89 Unit/DB-Tests (neu: OSM-Übersetzung inkl. echtem Ausschnitt Findorff, Overpass-Ausweichserver, Import/Vorschau/Sperren/Archiv/Dubletten/Zusammenführen/Meldungen/Vorschläge/Löschung), 105 E2E-Prüfungen mit Nachbau von Overpass/VG250/Protomaps (echte Ausschnitte), Bildschirmfotos mobil/desktop hell/dunkel mit echtem Kartenausschnitt Bremen, Build

## 2026-10-18 · Mailserver in der Verwaltung einstellen

**Was** Neue Seite Verwaltung → Einstellungen: Mailserver, Port, Absender, Benutzername, Passwort, „Zertifikat nicht prüfen“. Speichern prüft sofort Verbindung und Anmeldung und meldet Fehler verständlich (Passwort falsch, Port falsch, Zertifikat …). Test-Mail-Knopf, „Gespeicherte Werte entfernen“. Passwort AES-256-GCM-verschlüsselt in `settings`, nie angezeigt, nie protokolliert. Portainer-Variablen `SMTP_*` nur noch Rückfall. Neues Recht `settings.manage` (Betreiber, Technikadministration). Änderungen im Protokoll (ohne Passwort).
**Warum** Wunsch Jan: Einstellungen im Backend statt in Portainer.
**Module** M24, Querschnitt · **DB-Migration** ja – `0003_einstellungen.sql` (Recht `settings.manage` für tech_admin)
**Tests** svelte-check 0 Fehler, 55 Unit/DB-Tests (neu: Verschlüsselung, Vorrang/Rückfall, Validierung, Recht), 70 E2E-Prüfungen (neu: Einstellungsseite, Speichern mit Verbindungsfehler, Passwort nie im HTML, Ablehnung, Entfernen), Build

## 2026-10-18 · Abschnitt 1: Mitglieder, Familien-ID, QR, Kontakte, Passkeys

**Was**
- Registrierung mit E-Mail-Bestätigung (24 h), erneutes Senden, Passwort vergessen/neu (1 h); Antworten verraten nie, ob eine Adresse existiert.
- Familien-ID je Mitglied (9 Zeichen, zufällig, mit Prüfzeichen, tolerant bei O/0, I/L/1); Suche nach ID mit Ratenbegrenzung.
- Profil (Name, kann helfen, sucht, Interessen, Altersgruppen der Kinder, Region, auffindbar) mit Sichtbarkeit je Feld (alle/Mitglieder/Kontakte/niemand) und Vorgaben zurückhaltend/offen; Vorschau „So sehen andere mich“.
- QR: dauerhafter Code (ersetzbar), befristete Begegnungscodes (1 h–7 Tage, widerrufbar), Druckvorlage für den Wimpel; QR-Landeseite ohne Cache.
- Kontaktanfragen (annehmen/ablehnen/zurückziehen, gegenseitige Anfrage verbindet direkt, 30/Tag), Kontakte entfernen, Blockieren in beide Richtungen, Entdecken nach Region.
- Sicherheit: Passkeys (anmelden ohne Passwort, zählt als 2FA), 2FA ein/aus, Sitzungen/Geräte beenden, Passwort ändern.
- Konto: Datenexport (JSON), Löschung (letzter Betreiber geschützt); Löschliste im Sicherungs-Volume wird beim Start automatisch erneut angewendet.
- Verwaltung: Test-E-Mail-Knopf, Familien-ID/Bestätigt/Anmeldeschutz in der Nutzerliste, Kennzahlen unbestätigt/Kontakte.
- Compose: neue Variable `SMTP_INSECURE_TLS` (optional).
**Warum** Bauabschnitt 1 laut ROADMAP/REQUIREMENTS. **Module** M01, M24, Querschnitt
**DB-Migration** ja – `0002_mitglieder.sql` (Profile, E-Mail-Token, QR-Token, Anfragen, Kontakte, Blockierungen, Passkeys, Löschprotokoll; bestehende aktive Konten gelten als bestätigt)
**Tests** svelte-check 0 Fehler, 48 Unit/DB-Tests, 64 E2E-Prüfungen (Rauchtest inkl. Mail-Testpostfach), Passkey-Prüfung lokal mit virtuellem Authenticator 3/3, Build

## 2026-10-18 · Betrieb: HTTPS auf kinder.jan-krueger.org

**Was** Defekte Plesk-Subdomain (kein nginx-Block, daher Zertifikat von public-power.de) neu angelegt; Diagnose und Lösung in DEPLOYMENT.md.
**Warum** Browser zeigte „Nicht sicher“. **Module** Betrieb · **DB-Migration** nein

## 2026-10-18 · Neue Gestaltung der Oberfläche

**Was** Designsystem „Wimpelkette“ (DECISIONS D-013): neue Farb-Tokens hell/dunkel, Kopfleiste (Desktop) und Tab-Leiste mit Wimpel-Markierung (mobil), Startseite neu (Wimpelkette, Kinderwagen-Illustration, Familien-ID-Etikett mit echtem QR-Code, Modul-Postkarten, schematische Regionskarte, Versprechen, Abschluss), Unterseiten Karte/Community/Nachrichten mit eigener Illustration und Liste „Was hier kommt“, Konto-Seiten in Seitencontainer.
**Warum** Erste Fassung wirkte leer und beliebig (Rückmeldung Jan).
**Module** Querschnitt (Design), M01/M02/M03/M10 nur als ehrliche Vorschau – keine Funktion vorgetäuscht · **DB-Migration** nein
**Tests** svelte-check, 27 Unit/DB-Tests, 27 E2E-Prüfungen lokal; Screenshots mobil/desktop hell/dunkel geprüft

## 2026-10-18 · Testdomain festgelegt

**Was** Testdomain bleibt `kinder.jan-krueger.org` (Entscheidung Jan); DEPLOYMENT/STATUS angepasst.
**Warum** `APP_URL` und Browser-Adresse müssen exakt übereinstimmen, sonst blockiert der CSRF-Schutz Formulare.
**Module** Querschnitt · **DB-Migration** nein

## 2026-10-18 · Start-Diagnose und Testdomain

**Was** Migrationsrunner bricht bei abgelehntem DB-Passwort/fehlender DB sofort mit klarer Meldung ab (statt 60 s zu warten) und nennt beim Warten den Fehlercode. DEPLOYMENT.md: Testdomain jetzt `kinder.public-power.de`, Docker-Proxyregel statt nginx-Block, Abschnitt „Datenbank lehnt Passwort ab“, Umgang mit offengelegten Geheimnissen.
**Warum** Erster Serverstart scheiterte: DB-Volume stammte von einem Start mit anderem Passwort; die Ursache war im Log nicht sichtbar.
**Module** Querschnitt · **DB-Migration** nein · **Tests** check, Unit/DB, Build, Rauchtest lokal

## 2026-10-18 · CI: Rauchtest stabilisiert

**Was** Replay-Prüfung im End-to-End-Test nutzt jetzt genau den Einrichtungs-Code statt eines neu berechneten (sonst Fehlschlag an der 30-Sekunden-Grenze). Fehler erscheinen als Anmerkungen im Actions-Lauf.
**Warum** Erster CI-Lauf schlug im Rauchtest fehl; zweiter Lauf komplett grün (Tests, Build, Branch `deploy`, Aufräumen).
**Module** Querschnitt · **DB-Migration** nein

## 2026-10-18 · Abschnitt 0: Fundament

**Was**
- SvelteKit-App (Node, TypeScript) mit PostgreSQL 17 + PostGIS, eigener Migrationsrunner mit Sicherung vor jeder Migration.
- Einrichtungsassistent: Einmal-Token im Container-Log, Vorabprüfung, Erst-Admin mit Pflicht-2FA (TOTP), danach dauerhaft gesperrt.
- Anmeldung mit Passwort (scrypt) + TOTP inkl. Replay-Schutz und Rate-Limits; Sitzungen nur als Hash gespeichert.
- Rechtesystem Rolle × Geltungsbereich (global/Region/Thema/Organisation/Gruppe) × Aktion, befristbar, widerrufbar, protokolliert; geschützte Gruppen nie über Regions-/Themenrechte.
- Regionsmodell nach amtlichem Regionalschlüssel (Bund, Länder, Bremen-Stadt, Bremerhaven).
- Admin: Übersicht (Systemzustand, Sicherung, Kennzahlen), Nutzer, Rollen und Rechte mit Vorschau, Protokoll.
- Designsystem „Wimpel & Watt“, Hell/Dunkel/System ohne Aufblitzen, mobile Fünf-Ziele-Navigation, ehrliche Leerzustände.
- Docker-Image, Compose-Stack (web, db, backup) ohne öffentliche Ports, GitHub Actions mit Tests, Build, Branch `deploy`, Aufräumen.
- Doku: REQUIREMENTS (Masterprompt unverändert), STATUS, DECISIONS, ARCHITECTURE, ROADMAP, DEPLOYMENT.

**Warum** Abhängigkeiten zuerst (Masterprompt Abschnitt 7): Identität, Rechte, Regionen, Design, Installation, Basis-Admin.

**Module** Querschnitt, M24 (Basis), M04 (Rechtebasis)

**DB-Migration** ja – `0001_fundament.sql`

**Tests** 27 Unit-/DB-Tests und 27 End-to-End-Prüfungen lokal bestanden (PostgreSQL 16 + PostGIS 3.4 lokal; CI nutzt 17 + 3.6).
