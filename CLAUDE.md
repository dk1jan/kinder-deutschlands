# Kinder Deutschlands – Arbeitsregeln für Claude

Quelle der Wahrheit ist dieses Repo. Zu Beginn jeder Sitzung lesen: `docs/STATUS.md`, die neuesten Einträge in `docs/CHANGELOG.md`, `docs/DECISIONS.md`. Bei Bedarf `docs/REQUIREMENTS.md` (verbindlicher Masterprompt), `ARCHITECTURE.md`, `ROADMAP.md`, `DEPLOYMENT.md`. Außerdem `docs/FEEDBACK.md` lesen (Test-/Fehler-/Änderungsliste) und offene Einträge mitmelden. Neue Beobachtungen von Jan sofort dort eintragen (Stichwort reicht), nicht sofort umsetzen, außer er verlangt es; „Sammel-Update bauen“ = alle offenen Einträge zu einem Auftrag bündeln (Ablauf steht in der Datei). Dann dem Nutzer in 3–5 Zeilen melden: Stand, letzte Änderung, offene Punkte.

Bei jeder Änderung im selben Commit:
- Code + Tests + Doku.
- `docs/CHANGELOG.md`: Datum, was, warum, Module (M01–M24), DB-Migration ja/nein, welche Tests gelaufen sind.
- `docs/STATUS.md`: Modulstatus (vorgesehen / umgesetzt / getestet / extern blockiert). Nichts „getestet“ nennen ohne echten Testlauf.
- Grundsatzentscheidungen in `docs/DECISIONS.md`, Server-/Betriebsdaten in `docs/DEPLOYMENT.md`.
- Neue DB-Änderungen nur als neue Datei `app/migrations/NNNN_name.sql`, bestehende nie ändern.

Vor dem Push lokal: `cd app && npm run check && npm test && npm run build` (DB-Tests mit `TEST_DATABASE_URL`, E2E mit `node scripts/smoke-test.mjs`).
Push auf `main` → Actions testet, baut, aktualisiert Branch `deploy` → Portainer rollt in ≤ 5 Min aus. Branch `deploy` nie von Hand ändern.

Nie: Passwörter, Tokens, Schlüssel in Repo, Chat oder Logs. Keine Anforderung aus REQUIREMENTS.md stillschweigend streichen. Keine erfundenen Daten, Mitglieder, Bewertungen oder Statistiken.

Antworten an Jan: kurz, Deutsch, copy-paste-fertig. Er will nichts von Hand pflegen oder hin- und herkopieren.
