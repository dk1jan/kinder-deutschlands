# CHANGELOG

Neueste Einträge oben. Format: Datum · was · warum · Module · DB-Migration.

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
