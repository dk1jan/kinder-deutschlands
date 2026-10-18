# ARCHITECTURE

## Überblick

```
Internet ── Plesk nginx (TLS, kinder.jan-krueger.org) ── 127.0.0.1:3120 ── web (SvelteKit/Node)
                                                                              │  Netz „backend“ (intern, ohne Internet)
                                                                     db (PostgreSQL 17 + PostGIS 3.6)
                                                                     backup (täglich pg_dump, 14 Tage)
```

Geplante Zusatzdienste (eigene Abschnitte): Valkey (Warteschlange, Abschnitt 2/5), Kachelserver/PMTiles (Abschnitt 2), Synapse + LiveKit/coturn (Abschnitt 4/7), optional n8n (intern).

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
| `.github/workflows/build-deploy.yml` | Tests → Image → Branch `deploy` → Aufräumen |
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
