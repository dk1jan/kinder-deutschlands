# STATUS

Stand: 18.10.2026 · Bauabschnitt 0 (Fundament) · Version siehe Admin → Übersicht

Statuswerte: **vorgesehen** · **umgesetzt** (Code da, noch nicht vollständig geprüft) · **getestet** (automatische Tests bestanden) · **extern blockiert**

## Betrieb

| Punkt | Status | Hinweis |
|---|---|---|
| Repo, Doku, Projektanweisung | getestet | Quelle der Wahrheit: dieses Repo |
| GitHub Actions (Tests → Build → Branch `deploy` → Aufräumen) | getestet | Lauf vom 18.10. grün; Branch `deploy` zeigt auf `sha-9bd23eda4fce` |
| Portainer-Stack aus Branch `deploy`, Polling 5 Min | umgesetzt | Stack läuft; DB-Volume muss nach Passwortwechsel neu angelegt werden |
| GHCR-Paket öffentlich | getestet | Server zieht das Image ohne Anmeldung |
| Plesk-Domain `kinder.public-power.de`, TLS, Docker-Proxyregel | umgesetzt | TLS-Zertifikat prüfen |
| Tägliche Sicherung (Container `backup`, 14 Tage) | umgesetzt | erst auf dem Server prüfbar |
| Sicherung vor jeder Migration | getestet | Integrationstest |
| Notfall-Update `update.sh` (Portainer-API) | umgesetzt | nicht getestet (Portainer-API hier nicht verfügbar) |

## Querschnitt

| Bereich | Status | Hinweis |
|---|---|---|
| Installation: Einmal-Token, Vorabprüfung, Erst-Admin mit 2FA, Sperre | getestet | inkl. gleichzeitiger Versuche |
| Anmeldung Passwort + TOTP, Replay-Schutz, Rate-Limit | getestet | Passkeys: vorgesehen (Abschnitt 1) |
| Sitzungen (gehasht, gleitend, Abmelden) | getestet | Geräteverwaltung: vorgesehen |
| Rechte Rolle × Geltungsbereich × Aktion, befristet, Entzug, Protokoll | getestet | zweite Freigabe kritischer Aktionen: vorgesehen |
| Regionsmodell (AGS/ARS) | umgesetzt | Bestand: Bund, 16 Länder, Bremen-Stadt, Bremerhaven. Kreise/Gemeinden/Stadtteile + Geometrien per Import (M23): vorgesehen |
| Audit-Protokoll (ohne private Inhalte, IP gehasht) | getestet | |
| Designsystem, Hell/Dunkel/System ohne Aufblitzen | getestet | auch Admin, Setup, Fehlerseite |
| Mobile Navigation (5 Ziele), Desktop-Leiste | umgesetzt | Screenshots geprüft; Screenreader-Test: vorgesehen |
| Sicherheitsheader, CSP, CSRF, noindex | getestet | |
| PWA | vorgesehen | Manifest vorhanden; Service Worker, Push, Installationshilfe iOS: Abschnitt 4/5 |
| Mehrsprachigkeit / einfache Sprache | vorgesehen | Oberfläche Deutsch |
| E-Mail-Versand (SMTP) | vorgesehen | Plesk-Mailserver, ab Abschnitt 1 |
| Datenschutzerklärung, Impressum | vorgesehen | Inhalte brauchen rechtliche Prüfung durch Betreiber |

## Module

| Modul | Status | Abschnitt |
|---|---|---|
| M01 Mitglieder-ID, Profile, QR | vorgesehen | 1 |
| M02 Kommunikation (Text/Medien) | vorgesehen | 4 |
| M02 Audio/Video | vorgesehen | 7 |
| M03 Regionale Community | vorgesehen | 3 |
| M04 Geschützte Gruppen | vorgesehen (Rechtebasis getestet) | 3 |
| M05 Familienradar | vorgesehen | 5 |
| M06 Treffen, temporäre Räume, Live-Standort | vorgesehen | 4 |
| M07 Social-Media-Links, Editor | vorgesehen | 3 |
| M08 Affiliate | extern blockiert | 7 – Amazon-Bedingungen prüfen, PartnerNet-Konto nötig |
| M09 Marktplatz | vorgesehen | 6 |
| M10 Familienkarte | vorgesehen | 2 |
| M11 Spielplatzkarte | vorgesehen | 2 |
| M12 Veranstaltungen | vorgesehen | 5 |
| M13 Familienfreundliche Orte | vorgesehen | 2 |
| M14 Kinderwagenrouten | vorgesehen | 7 |
| M15 Lebenslagen-Kompass | vorgesehen | 6 |
| M16 Familien helfen Familien | vorgesehen | 6 |
| M17 Freie Plätze und Kurse | vorgesehen | 5 |
| M18 Merklisten, Kalender | vorgesehen | 5 |
| M19 Wissen aus der Community | vorgesehen | 3 |
| M20 Regionale Hinweise | vorgesehen | 5 |
| M21 Geburtstage, Einladungen | vorgesehen | 6 |
| M22 Verifizierte Einrichtungen | vorgesehen | 5 |
| M23 Datenversorgung | vorgesehen | 2 (erster Import) |
| M24 Admin/Moderation/Redaktion | umgesetzt (Basis) | Übersicht, Nutzer, Rechte, Protokoll getestet; Moderation/Datenzentrale ab 2–3 |

## Offene Punkte

1. Jan: einmalige Einrichtung nach DEPLOYMENT.md (Plesk, Portainer, GHCR-Paket öffentlich).
2. Beobachten, ob das Löschen alter Image-Versionen mit `GITHUB_TOKEN` greift (Schritt läuft fehlertolerant; erst ab 4 Versionen sichtbar).
3. Annahmen bestätigen (DECISIONS.md D-008 bis D-010): E2EE-Chat über eigenen Synapse, TURN auf demselben Server, Mail über Plesk.
4. Sicherheit Server allgemein (nicht Kinder-spezifisch): Firewall aus, Portainer :9000 und weitere Dienste öffentlich erreichbar.
