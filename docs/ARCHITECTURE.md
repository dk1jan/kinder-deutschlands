# ARCHITECTURE

## Überblick

```
Internet ── Plesk nginx (TLS, kinder-deutschlands.de) ── 127.0.0.1:3120 ── web (SvelteKit/Node)
                                                                              │  /_matrix/client, /_matrix/media → synapse
                                                                              │  Netz „backend“ (intern, ohne Internet)
                                                       ┌──────────────────────┼───────────────────────┐
                                     db (PostgreSQL 17 + PostGIS: kd, synapse)   synapse (Matrix, E2EE)   backup (täglich)
                                                                              ▲
                                       Regelprüfung /internal/chat/check, Push /_matrix/push/v1/notify (nur intern)
```

Kartenkacheln (PMTiles) liefert die App selbst aus (Volume `tiles`, D-021); Datenabrufe laufen als Zeitplan im Web-Container (D-023).
Unwetterwarnungen holt ein eigener 5-Minuten-Takt im Web-Container vom DWD (`src/lib/server/warnings/`: ZIP- und CAP-Leser ohne Zusatzbibliothek, Kreiszuordnung, Zustellung; D-087). Rundnachrichten (`broadcasts.ts`, D-086) und das Moderatoren-Forum (`posts.team`, D-085) nutzen das vorhandene Rechte- und Mitteilungssystem.

Chat (D-034): Browser ↔ App-Proxy ↔ Synapse. Verschlüsselung nur im Browser (`app/src/lib/chat/`). Die App schreibt die Synapse-Konfiguration beim Start (`app/scripts/synapse-prepare.mjs`), das Regelmodul `app/scripts/kd_rules.py` fragt die App bei Einladungen, Beitritten ohne Einladung und beim Senden. Serverseite: `app/src/lib/server/chat/` (Admin-Zugang, Räume/Treffen, Regeln, Meldungen), `app/src/lib/server/push.ts` (Web-Push, Gateway, Ruhezeiten). Anrufe: 1:1 über Matrix-Signalisierung + coturn (D-056); Gruppenanrufe über LiveKit (Container `livekit`, D-072) – Token von der App (`src/lib/server/livekit.ts`, `/api/anruf`), Signalweg über `scripts/server.mjs` (`/livekit/rtc`), Ende-zu-Ende-Schlüssel im Browser (`src/lib/chat/groupcall.svelte.ts`, Weitergabe per Olm). Optional später n8n (intern).

## Repo-Aufbau

| Pfad | Inhalt |
|---|---|
| `app/` | Webanwendung (SvelteKit, adapter-node) |
| `app/migrations/` | nummerierte SQL-Migrationen, nie nachträglich ändern – nur neue anhängen |
| `app/scripts/migrate.mjs` | vor jedem Start: Sicherung (wenn Migrationen anstehen), Migration, Setup-Token |
| `app/scripts/smoke-test.mjs` | End-to-End-Test gegen gebauten Server + echte DB |
| `app/src/lib/server/` | Serverlogik: `rights.ts` (reine Rechte-Logik), `roles.ts`, `session.ts`, `setup.ts`, `crypto.ts`, `totp.ts`, `password.ts`, `audit.ts`, `system.ts`, `guard.ts` |
| `app/src/routes/(app)/` | Mitgliederoberfläche mit Navigation |
| `app/src/routes/admin/` | Verwaltung (jede Seite und jede Aktion prüft ihr Recht selbst) |
| `app/src/routes/setup/` | Einrichtungsassistent |
| `deploy/docker-compose.yml` | Stack-Vorlage (`__WEB_IMAGE__` wird von Actions ersetzt) |
| `deploy/update.sh` | Notfall-Neuausrollen über Portainer-API |
| `deploy/plesk-nginx.conf` | nginx-Block für Plesk |
| `.github/workflows/build-deploy.yml` | Tests (mit echtem Synapse) → Image → Stack-Test (`deploy/stack-test.sh`) → Branch `deploy` → Aufräumen |
| Branch `deploy` | nur generiert: fertige Compose-Datei für Portainer |

## Datenmodell (Stand 0001)

`users` (technische Konto-ID, E-Mail intern) · `sessions` (Token-Hash) · `roles`, `role_permissions`, `role_assignments` (Rolle × Geltungsbereich, befristet, widerrufen) · `regions` (ARS-Schlüssel, Ebene, Eltern, Geometrie) · `settings` · `audit_log` · `schema_migrations`.

Geplant (M01): eigene Tabellen für öffentliche Kontakt-ID und widerrufbare QR-Tokens – getrennt von `users.id`.

## Sicherheitsprinzipien

- Server prüft jede Aktion (`requireAction` in jeder Seite und jeder Formular-Aktion). Layouts allein schützen nichts.
- Keine Geheimnisse im Repo/Image. Laufzeit: `APP_SECRET`, `POSTGRES_PASSWORD`, SMTP nur als Portainer-Umgebungsvariablen.
- Aus `APP_SECRET` werden per HKDF zweckgebundene Schlüssel abgeleitet (`totp`, `setup`, `ip`). **APP_SECRET nie ändern** – sonst sind 2FA-Geheimnisse nicht mehr lesbar.
- CSP mit Nonces, keine fremden Skripte/Fonts; CSRF-Prüfung durch SvelteKit (ORIGIN = APP_URL); `noindex` im Testbetrieb.
- Datenbank nur im internen Netz, Web nur auf 127.0.0.1.
- Protokolle ohne private Inhalte, IP nur als tagesgesalzener Hash.

## Tests

- `npm test`: Unit (Rechte, TOTP-RFC-Vektoren, Kryptografie, Passwörter, Weiterleitungen) + DB-Integration (Migration, Setup inkl. Wettlauf, Rechte, Sitzungen, Sicherung vor Migration). DB-Tests nur mit `TEST_DATABASE_URL`.
- `node scripts/smoke-test.mjs`: kompletter Ablauf über HTTP wie im Browser ohne JavaScript.
- CI führt alles vor jedem Build aus. Schlägt ein Test fehl, wird nichts ausgerollt.
