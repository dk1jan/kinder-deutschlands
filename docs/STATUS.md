# STATUS

Stand: 18.10.2026 · Bauabschnitt 2 (Karte & Orte) fertig – erste echte Daten kommen nach dem Ausrollen automatisch

Statuswerte: **vorgesehen** · **umgesetzt** (Code da, noch nicht vollständig geprüft) · **getestet** (automatische Tests bestanden) · **extern blockiert**

## Betrieb

| Punkt | Status | Hinweis |
|---|---|---|
| Repo, Doku, Projektanweisung | getestet | Quelle der Wahrheit: dieses Repo |
| GitHub Actions (Tests → Build → Branch `deploy` → Aufräumen) | getestet | Lauf vom 18.10. grün; Branch `deploy` zeigt auf `sha-9bd23eda4fce` |
| Portainer-Stack aus Branch `deploy`, Polling 5 Min | umgesetzt | Stack läuft; DB-Volume muss nach Passwortwechsel neu angelegt werden |
| GHCR-Paket öffentlich | getestet | Server zieht das Image ohne Anmeldung |
| Plesk-Subdomain `kinder.jan-krueger.org`, TLS, Docker-Proxyregel | getestet | Zertifikat korrekt, HTTPS 200 (18.10.) |
| Tägliche Sicherung (Container `backup`, 14 Tage) | umgesetzt | erst auf dem Server prüfbar |
| Datenabrufe nach Zeitplan (im Web-Container) | getestet | mit Nachbau der Dienste; echter Erstabruf auf dem Server nach dem Ausrollen (Regionen → Kacheln → Orte, ca. 10–30 Min) |
| Eigene Kartenkacheln (Volume `tiles`, ~1,5 GB) | getestet | Auslieferung mit Range lokal mit echtem Bremer Ausschnitt geprüft |
| Sicherung vor jeder Migration | getestet | Integrationstest |
| Notfall-Update `update.sh` (Portainer-API) | umgesetzt | nicht getestet (Portainer-API hier nicht verfügbar) |

## Querschnitt

| Bereich | Status | Hinweis |
|---|---|---|
| Installation: Einmal-Token, Vorabprüfung, Erst-Admin mit 2FA, Sperre | getestet | inkl. gleichzeitiger Versuche |
| Anmeldung Passwort + TOTP, Replay-Schutz, Rate-Limit | getestet | |
| Passkeys (Registrieren, Anmelden ohne Passwort, Entfernen) | getestet | lokal mit virtuellem Authenticator (`scripts/passkey-check.py`), nicht in CI |
| Registrierung, E-Mail-Bestätigung, Passwort zurücksetzen | getestet | keine Preisgabe vorhandener Adressen (D-016); echter Versand erst mit SMTP |
| Sitzungen (gehasht, gleitend, Abmelden) | getestet | Geräteliste und Sitzungen beenden: umgesetzt (noch ohne eigenen automatischen Test) |
| Datenexport, Kontolöschung, Löschliste nach Wiederherstellung | getestet | DB-Tests + E2E (Löschung); D-018 |
| Rechte Rolle × Geltungsbereich × Aktion, befristet, Entzug, Protokoll | getestet | zweite Freigabe kritischer Aktionen: vorgesehen |
| Regionsmodell (AGS/ARS) | getestet | Länder/Kreise/Gemeinden HB+NI amtlich aus VG250, Stadtteile Bremen/Bremerhaven aus OSM (D-020). Stadtteile Niedersachsen: vorgesehen |
| Audit-Protokoll (ohne private Inhalte, IP gehasht) | getestet | |
| Designsystem „Wimpelkette“, Hell/Dunkel/System ohne Aufblitzen | getestet | Startseite + Unterseiten neu gestaltet (D-013); Admin/Setup nutzen dieselben Tokens |
| Mobile Tab-Leiste (5 Ziele), Desktop-Kopfleiste | umgesetzt | Screenshots geprüft; Screenreader-Test: vorgesehen |
| Sicherheitsheader, CSP, CSRF, noindex | getestet | |
| Luftbild (LGLN Niedersachsen, optional Esri) | getestet | mit Nachbau des WMS; Bremen nur mit Esri-Schlüssel |
| Navigation an externe Apps | getestet | Google, Apple, Waze, OSM, geo: |
| Kartenoberfläche hell/dunkel, mobil/desktop | getestet | Bildschirmfotos geprüft; Screenreader-Test: vorgesehen |
| PWA | vorgesehen | Manifest vorhanden; Service Worker, Push, Installationshilfe iOS: Abschnitt 4/5 |
| Mehrsprachigkeit / einfache Sprache | vorgesehen | Oberfläche Deutsch |
| E-Mail-Versand (SMTP) | getestet | Einstellung in Verwaltung → Einstellungen (Passwort verschlüsselt, Verbindungsprüfung, Test-Mail); Rückfall Portainer-Variablen. Echter Versand: wartet auf Eintrag durch Jan |
| Datenschutzerklärung, Impressum | vorgesehen | Inhalte brauchen rechtliche Prüfung durch Betreiber |

## Module

| Modul | Status | Abschnitt |
|---|---|---|
| M01 Mitglieder-ID, Profile, QR | getestet | Familien-ID, Profil + Sichtbarkeit, Vorschau „So sehen andere mich“, QR dauerhaft/befristet/widerrufbar, Druckvorlage, Kontaktanfragen, Kontakte, Blockieren, Entdecken nach Region. Freigabestufe „Gruppen“ kommt mit M04 (Abschnitt 3) |
| M02 Kommunikation (Text/Medien) | vorgesehen | 4 |
| M02 Audio/Video | vorgesehen | 7 |
| M03 Regionale Community | vorgesehen | 3 |
| M04 Geschützte Gruppen | vorgesehen (Rechtebasis getestet) | 3 |
| M05 Familienradar | vorgesehen | 5 |
| M06 Treffen, temporäre Räume, Live-Standort | vorgesehen | 4 |
| M07 Social-Media-Links, Editor | vorgesehen | 3 |
| M08 Affiliate | extern blockiert | 7 – Amazon-Bedingungen prüfen, PartnerNet-Konto nötig |
| M09 Marktplatz | vorgesehen | 6 |
| M10 Familienkarte | umgesetzt | Karte, Liste, Umkreis/Entfernung, Filter, Gruppierung, Suche getestet. Ebenen Mitglieder/Abdeckung, Hilfe, Veranstaltungen, Marktplatz, Routen: mit den jeweiligen Modulen | 2 |
| M11 Spielplatzkarte | umgesetzt | Import, Ausstattung, Spielgeräte, Detail, Merken, Fehler melden, Hinweise (Nutzer/Redaktion/amtlich), Vorschlagen mit Dublettenprüfung, Quelle/Aktualität getestet. Fotos, Text-/Sternebewertungen, Änderungen abonnieren, Treffen am Spielplatz: vorgesehen (Abschnitt 3/4, brauchen Moderation bzw. Benachrichtigungen) | 2 |
| M12 Veranstaltungen | vorgesehen | 5 |
| M13 Familienfreundliche Orte | umgesetzt | Toiletten, Wickeln, Indoor, Zoos/Bäder aus OSM, Familiencafés/Stillmöglichkeiten nur über Vorschläge (keine verlässliche offene Quelle). Fotos/Erfahrungen: Abschnitt 3 | 2 |
| M14 Kinderwagenrouten | vorgesehen | 7 |
| M15 Lebenslagen-Kompass | vorgesehen | 6 |
| M16 Familien helfen Familien | vorgesehen | 6 |
| M17 Freie Plätze und Kurse | vorgesehen | 5 |
| M18 Merklisten, Kalender | vorgesehen | 5 |
| M19 Wissen aus der Community | vorgesehen | 3 |
| M20 Regionale Hinweise | vorgesehen | 5 |
| M21 Geburtstage, Einladungen | vorgesehen | 6 |
| M22 Verifizierte Einrichtungen | vorgesehen | 5 |
| M23 Datenversorgung | umgesetzt | Quellenkatalog, Abruf, Abgleich, Vorschau/Freigabe, Sperren, Dubletten, Archiv, Fehlerwiederholung getestet. Weitere Prüfkandidaten (familiennetz bremen, Kita-Portal, FreiKarte …): je Quelle Lizenz klären, vorgesehen | 2 |
| M24 Admin/Moderation/Redaktion | umgesetzt (Basis) | Übersicht, Nutzer, Rechte, Protokoll, Einstellungen (E-Mail), Datenzentrale (Quellen, Abrufe, Prüffälle, Ortspflege) getestet; Moderation/Datenzentrale ab 2–3 |

## Offene Punkte

1. **Jan:** Mailserver in Verwaltung → Einstellungen eintragen, dann Test-E-Mail. Bis dahin ist die Registrierung geschlossen.
2. Nach dem Ausrollen: Verwaltung → Daten und Orte prüfen (erste Abrufe laufen automatisch). Als Nächstes Abschnitt 3 (Community).
3. Beobachten, ob das Löschen alter Image-Versionen mit `GITHUB_TOKEN` greift (Schritt läuft fehlertolerant; erst ab 4 Versionen sichtbar).
4. Annahmen bestätigen (DECISIONS.md D-008 bis D-010): E2EE-Chat über eigenen Synapse, TURN auf demselben Server, Mail über Plesk.
5. Sicherheit Server allgemein (nicht Kinder-spezifisch): Firewall aus, Portainer :9000 und weitere Dienste öffentlich erreichbar.
6. ODbL: Orte aus OSM + Mitglieder-Ergänzungen bilden eine abgeleitete Datenbank – auf Anfrage als ODbL-Export bereitstellen; rechtliche Prüfung durch Betreiber empfohlen (D-020).
