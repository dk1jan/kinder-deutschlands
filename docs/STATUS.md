# STATUS

Stand: 19.10.2026 · Bauabschnitt 5 (Angebote & Radar) fertig – Veranstaltungen, Einrichtungen, freie Plätze, Hinweise, Merkliste, Familienradar

Statuswerte: **vorgesehen** · **umgesetzt** (Code da, noch nicht vollständig geprüft) · **getestet** (automatische Tests bestanden) · **extern blockiert**

## Betrieb

| Punkt | Status | Hinweis |
|---|---|---|
| Repo, Doku, Projektanweisung | getestet | Quelle der Wahrheit: dieses Repo |
| GitHub Actions (Tests → Build → Branch `deploy` → Aufräumen) | getestet | Lauf vom 18.10. grün; Branch `deploy` zeigt auf `sha-9bd23eda4fce` |
| Portainer-Stack aus Branch `deploy`, Polling 5 Min | umgesetzt | Stack läuft; DB-Volume muss nach Passwortwechsel neu angelegt werden |
| GHCR-Paket öffentlich | getestet | Server zieht das Image ohne Anmeldung |
| Plesk-Subdomain `kinder.jan-krueger.org`, TLS, Docker-Proxyregel | getestet | Zertifikat korrekt, HTTPS 200 (18.10.) |
| Tägliche Sicherung (Container `backup`, 14 Tage; Bilder als Archiv, letzte 3; Chat-DB 14 Tage, Chat-Medien letzte 3) | umgesetzt | erst auf dem Server prüfbar |
| Chat-Server Synapse (Container `synapse`, Volumes `synapse-config`, `synapse-data`) | getestet | Stack-Test in CI mit echten Images vor jedem Ausrollen; Neustart bei Konfigurationsänderung automatisch |
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
| PWA | umgesetzt | Manifest mit PNG-Symbolen, Service Worker (nur Push, kein Offline-Speicher), Push-Gateway getestet (Testablage), iOS-Installationshilfe. Echte Zustellung über Apple/Google/Mozilla erst auf dem Server prüfbar |
| Mehrsprachigkeit / einfache Sprache | vorgesehen | Oberfläche Deutsch |
| E-Mail-Versand (SMTP) | getestet | Einstellung in Verwaltung → Einstellungen (Passwort verschlüsselt, Verbindungsprüfung, Test-Mail); Rückfall Portainer-Variablen. Echter Versand: wartet auf Eintrag durch Jan |
| Datenschutzerklärung, Impressum | vorgesehen | Inhalte brauchen rechtliche Prüfung durch Betreiber |

## Module

| Modul | Status | Abschnitt |
|---|---|---|
| M01 Mitglieder-ID, Profile, QR | getestet | Familien-ID, Profil + Sichtbarkeit, Vorschau „So sehen andere mich“, QR dauerhaft/befristet/widerrufbar, Druckvorlage, Kontaktanfragen, Kontakte, Blockieren, Entdecken nach Region. Freigabestufe „Gruppen“ kommt mit M04 (Abschnitt 3) |
| M02 Kommunikation (Text/Medien) | getestet | Direkt-/Gruppenchat E2EE, Bilder, Dateien, Sprachnachrichten, Links, Löschen, Stummschalten, Melden mit Freigabe, Blockieren wirkt serverseitig, Wiederherstellungsschlüssel/Gerätewechsel, Geräteliste, Ruhezeiten, Lesebestätigung/Tippen nur bewusst, kein Online-Status. Suche nur im Gerät (geladene Nachrichten): vorgesehen. Sprachnachricht/Kamera im Browser nur auf echten Geräten prüfbar | 4 |
| M02 Audio/Video, „Ruf mich an“ | vorgesehen | 7 (TURN/LiveKit) |
| M03 Regionale Community | getestet | Themen + Regionen abonnierbar, Feed, Beiträge/Antworten/Bilder, Suche, Schlagworte, Lesezeichen, Umfragen, hilfreich/Lösung, anheften/schließen/archivieren/verschieben. Medien: nur Bilder (Video/Audio mit M02) | 3 |
| M04 Geschützte Gruppen | getestet | offen/Anfrage/geschützt, Aufnahmefragen, Pseudonym, keine Mitgliederliste für Fremde, Gruppenmoderation ohne Profilzugriff. Aufnahme durch Partnerorganisationen: vorgesehen (Rolle vorhanden, Ablauf noch nicht). Profil-Freigabestufe „Gruppen“ (M01): vorgesehen | 3 |
| M05 Familienradar | getestet | Bis zu 5 private Profile (Regionen inkl. Unterregionen, Themen, Alter, Arten), Vorschau, pausieren/löschen; Übersicht im Portal; E-Mail/Push freiwillig, wöchentlich oder täglich, nur Neues, mit Quelle/Datum/Frist/Link, neutraler Betreff/Push; gefolgte Einrichtungen. Abo einzelner Orte/Termine: vorgesehen (Merken als Ersatz). Echter E-Mail-Versand erst mit SMTP | 5 |
| M06 Treffen, temporäre Räume, Live-Standort | getestet | Treffen per QR mit Ablauf und Löschung, dauerhaft behalten, Treffpunkt-Pin mit Hinweg, Live-Standort 15/30/60 Min. (nur bei geöffneter Seite – Grenze von Web-Apps) | 4 |
| M07 Social-Media-Links, Editor | getestet | Linkkarte mit SSRF-Schutz, Einbettung YouTube/Vimeo erst nach Klick, Teilen-Menü (PWA, Android/Chrome; iOS unterstützt share_target nicht), Editor mit Vorschau. Abruf echter Fremdseiten nur auf dem Server prüfbar | 3 |
| M08 Affiliate | extern blockiert | 7 – Amazon-Bedingungen prüfen, PartnerNet-Konto nötig |
| M09 Marktplatz | vorgesehen | 6 |
| M10 Familienkarte | umgesetzt | Karte, Liste, Umkreis/Entfernung, Filter, Gruppierung, Suche getestet. Ebenen Mitglieder/Abdeckung, Hilfe, Veranstaltungen, Marktplatz, Routen: mit den jeweiligen Modulen | 2 |
| M11 Spielplatzkarte | umgesetzt | Import, Ausstattung, Spielgeräte, Detail, Merken, Fehler melden, Hinweise (Nutzer/Redaktion/amtlich), Vorschlagen mit Dublettenprüfung, Quelle/Aktualität getestet. Sternebewertungen mit Text und Fotos (nach Freigabe) getestet. Änderungen abonnieren, Treffen am Spielplatz: vorgesehen (Abschnitt 4/5) | 2 |
| M12 Veranstaltungen | getestet | Liste/Kalender/Karte/Detail, Filter (Zeitraum, Region, Art, Alter, kostenlos, drinnen/draußen, FreiKarte, Suche), Herkunft sichtbar, Sichtbarkeit öffentlich/Netzwerk/privat-Link, wiederkehrend mit Einzelabsagen, Fristen, Kapazität, Warteliste-Angabe, Merken, Kalenderdatei, „Interessiert/Ich komme“ (unverbindlich) mit „Wer kommt mit?“ nur mit Zustimmung, „Was machen wir heute?“, Melden, ICS-Import. Event-Chat zu „Wer kommt mit?“: vorgesehen. Budget-Filter: nur „kostenlos“ | 5 |
| M13 Familienfreundliche Orte | umgesetzt | Toiletten, Wickeln, Indoor, Zoos/Bäder aus OSM, Familiencafés/Stillmöglichkeiten nur über Vorschläge (keine verlässliche offene Quelle). Bewertungen/Fotos getestet | 2 |
| M14 Kinderwagenrouten | vorgesehen | 7 |
| M15 Lebenslagen-Kompass | vorgesehen | 6 |
| M16 Familien helfen Familien | vorgesehen | 6 |
| M17 Freie Plätze und Kurse | getestet | Nur verifizierte Einrichtungen; Verfügbarkeit mit Stand und Gültigkeit (3/7/14/30 Tage), sonst „unbekannt“; Erinnerung zur erneuten Bestätigung; Anbieter-Abo über „Folgen“ + Radar | 5 |
| M18 Merklisten, Kalender | getestet | Merkliste (Termine/Angebote/Hinweise; Orte weiter unter „Meine Orte“), Erinnerungen vor Beginn/Frist, .ics je Termin, persönlicher Kalender-Abo-Link (gehasht, erneuer-/abschaltbar) | 5 |
| M19 Wissen aus der Community | getestet | Einträge mit Quellen/Prüfdatum, Sichtbarkeit, Übernahme nur mit Zustimmung, nie aus Gruppen | 3 |
| M20 Regionale Hinweise | getestet | Arten neu/aktualisiert/Absage/Frist/Sperrung/Leistung, Herkunft amtlich (nur mit Quelle)/Anbieter/Redaktion/ungeprüft, Region nach oben und unten, Ortshinweise der Karte integriert, „wichtig“ als Push nur mit Opt-in. Hinweise von Mitgliedern außerhalb der Karte: vorgesehen | 5 |
| M21 Geburtstage, Einladungen | vorgesehen | 6 |
| M22 Verifizierte Einrichtungen | getestet | Antrag, Prüfung durch Verwaltung (Prüfangaben danach gelöscht), Profil, Team mit Verwaltung/Redaktion über Familien-ID, Vertretung, Folgen (Einrichtung sieht nur grobe Zahl), Angebote/Termine/Hinweise pflegen, eigener Kalender (ICS) täglich übernommen, pausieren. Übernahme importierter Einrichtungseinträge: vorgesehen (noch keine Einrichtungsquelle mit geklärter Lizenz) | 5 |
| M23 Datenversorgung | umgesetzt | Quellenkatalog, Abruf, Abgleich, Vorschau/Freigabe, Sperren, Dubletten, Archiv, Fehlerwiederholung getestet. Weitere Prüfkandidaten (familiennetz bremen, Kita-Portal, FreiKarte …): je Quelle Lizenz klären, vorgesehen | 2 |
| M24 Admin/Moderation/Redaktion | getestet | Übersicht, Nutzer, Rechte, Protokoll, Einstellungen, Datenzentrale, Moderation (Warteschlange, Fall, Entscheidung mit Begründung, Einspruch, Einschränkung, Zuständigkeit nach Region/Thema/Gruppe), Gruppen, Wissen, Chat-Meldungen (Wortlaut nur mit Freigabe), Chat-Server im Systemzustand, Prüfung von Einrichtungen, redaktionelle Hinweise, Meldungen zu Terminen/Angeboten/Einrichtungen. Zweite Freigabe kritischer Aktionen: vorgesehen |

## Offene Punkte

1. **Jan:** Mailserver in Verwaltung → Einstellungen eintragen, dann Test-E-Mail. Bis dahin ist die Registrierung geschlossen.
2. Nach dem Ausrollen: Verwaltung → Übersicht → „Chat-Server“ muss „In Ordnung“ zeigen. Dann mit zwei Konten testen: Kontakt verbinden → „Nachricht“ → Wiederherstellungsschlüssel aufbewahren.
2a. Abschnitt 5 ist leer, bis Inhalte kommen (keine erfundenen Termine): erste Einrichtungen anmelden lassen (`/einrichtungen/antrag`) und unter Verwaltung → Einrichtungen prüfen; Redaktion kann Hinweise unter Verwaltung → Hinweise veröffentlichen. Weitere Terminquellen (z. B. familiennetz bremen) nur nach Lizenzklärung. Als Nächstes Abschnitt 6.
3. Beobachten, ob das Löschen alter Image-Versionen mit `GITHUB_TOKEN` greift (Schritt läuft fehlertolerant; erst ab 4 Versionen sichtbar).
4. Annahmen bestätigen (DECISIONS.md D-009, D-010): TURN auf demselben Server, Mail über Plesk. Chat-Architektur ist mit D-034 festgelegt.
5. Sicherheit Server allgemein (nicht Kinder-spezifisch): Firewall aus, Portainer :9000 und weitere Dienste öffentlich erreichbar.
6. ODbL: Orte aus OSM + Mitglieder-Ergänzungen bilden eine abgeleitete Datenbank – auf Anfrage als ODbL-Export bereitstellen; rechtliche Prüfung durch Betreiber empfohlen (D-020).
