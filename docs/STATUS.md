# STATUS

Stand: 20.10.2026 · Sammel-Update und Gruppenanrufe (D-072)

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
| Medienserver LiveKit (Container `livekit`, Port 49210 UDP/TCP) und Dienst `init` (Volumes beschreibbar) | getestet | Stack-Test in CI: Container gesund, Token nur über die App, Verwaltung nicht erreichbar, Volumes beschreibbar |
| Chat-Server Synapse (Container `synapse`, Volumes `synapse-config`, `synapse-data`) | getestet | Stack-Test in CI mit echten Images vor jedem Ausrollen; Neustart bei Konfigurationsänderung automatisch |
| Datenabrufe nach Zeitplan (im Web-Container) | getestet | mit Nachbau der Dienste; echter Erstabruf auf dem Server nach dem Ausrollen (Regionen → Kacheln → Orte, ca. 10–30 Min) |
| Eigene Kartenkacheln (Volume `tiles`, ~1,5 GB) | getestet | Auslieferung mit Range lokal mit echtem Bremer Ausschnitt geprüft |
| Sicherung vor jeder Migration | getestet | Integrationstest |
| Notfall-Update `update.sh` (Portainer-API) | umgesetzt | nicht getestet (Portainer-API hier nicht verfügbar) |
| Umzug auf anderen Server (`deploy/umzug.sh`) | getestet | Export → Import im CI-Stack-Test; auf echtem Zweitserver noch nicht ausprobiert |

## Querschnitt

| Bereich | Status | Hinweis |
|---|---|---|
| Installation: Einmal-Token, Vorabprüfung, Erst-Admin mit 2FA, Sperre | getestet | inkl. gleichzeitiger Versuche |
| Anmeldung Passwort + TOTP, Replay-Schutz, Rate-Limit | getestet | |
| Passkeys (Registrieren, Anmelden ohne Passwort, Entfernen) | getestet | lokal mit virtuellem Authenticator (`scripts/passkey-check.py`), nicht in CI |
| Registrierung, E-Mail-Bestätigung, Passwort zurücksetzen | getestet | keine Preisgabe vorhandener Adressen (D-016); echter Versand erst mit SMTP |
| Sitzungen (gehasht, gleitend, Abmelden) | getestet | Geräteliste, einzeln/alle abmelden getestet (8.3) |
| Datenexport, Kontolöschung, Löschliste nach Wiederherstellung | getestet | DB-Tests + E2E (Löschung); D-018 |
| Rechte Rolle × Geltungsbereich × Aktion, befristet, Entzug, Protokoll | getestet | zweite Freigabe kritischer Aktionen getestet (D-057) |
| Regionsmodell (AGS/ARS) | getestet | Länder/Kreise/Gemeinden HB+NI amtlich aus VG250, Stadtteile Bremen/Bremerhaven aus OSM (D-020). Stadt-/Ortsteile Niedersachsen aus OSM: umgesetzt, Zuordnung getestet (Abruf läuft auf dem Server); VG250 für alle Länder (Sammel-Update) |
| Audit-Protokoll (ohne private Inhalte, IP gehasht) | getestet | |
| Designsystem „Wimpelkette“, Hell/Dunkel/System ohne Aufblitzen | getestet | Startseite + Unterseiten neu gestaltet (D-013); Admin/Setup nutzen dieselben Tokens |
| Navigation: 4 Ziele + „Mehr“, Kacheln auf Entdecken (D-069) | getestet | Screenshots geprüft; automatische Barrierefreiheitsprüfung (axe, WCAG 2.1 AA) ohne schwere Verstöße (8.3); Test mit Screenreader und Menschen: vorgesehen |
| Sicherheitsheader, CSP, CSRF, noindex | getestet | |
| Luftbild (LGLN Niedersachsen, optional Esri) | getestet | mit Nachbau des WMS; Gebiet ganz Deutschland (F-011); außerhalb Niedersachsens über Esri-Schlüssel |
| Navigation an externe Apps | getestet | Google, Apple, Waze, OSM, geo: |
| Kartenoberfläche hell/dunkel, mobil/desktop | getestet | Bildschirmfotos geprüft; axe-Prüfung ohne schwere Verstöße; Screenreader-Test: vorgesehen |
| PWA | umgesetzt | Manifest mit PNG-Symbolen, Service Worker (nur Push, kein Offline-Speicher), Push-Gateway getestet (Testablage), iOS-Installationshilfe. Echte Zustellung über Apple/Google/Mozilla erst auf dem Server prüfbar |
| Mehrsprachigkeit | bewusst nicht | Entscheidung Jan (D-071), Oberfläche Deutsch |
| Einfache Sprache | vorgesehen | |
| E-Mail-Versand (SMTP) | getestet | Einstellung in Verwaltung → Einstellungen (Passwort verschlüsselt, Verbindungsprüfung, Test-Mail); Rückfall Portainer-Variablen. Echter Versand: wartet auf Eintrag durch Jan |
| Datenschutzerklärung, Impressum | umgesetzt | Pflegbar in Verwaltung → Rechtstexte, Entwurf aus den Systemfunktionen, öffentlich „Entwurf“ bis zur Bestätigung (D-067). Getestet; **rechtliche Prüfung und Betreiberangaben: Jan** |

## Module

| Modul | Status | Abschnitt |
|---|---|---|
| M01 Mitglieder-ID, Profile, QR | getestet | Familien-ID, Profil + Sichtbarkeit, Partnerschaft/Familie verbinden (D-070), eigene E-Mail ändern, Vorschau „So sehen andere mich“, QR dauerhaft/befristet/widerrufbar, Druckvorlage, Kontaktanfragen, Kontakte, Blockieren, Entdecken nach Region. Freigabestufe „Mitglieder meiner Gruppen“ getestet (8.2, D-063) |
| M02 Kommunikation (Text/Medien) | getestet | Direkt-/Gruppenchat E2EE, Bilder, Dateien, Sprachnachrichten, Links, Löschen, Stummschalten, Melden mit Freigabe, Blockieren wirkt serverseitig, Schlüssel aus dem Passwort ohne Code, Gerätewechsel/Passwortwechsel/Reset im Browsertest (D-066), Geräteliste, Ruhezeiten, Lesebestätigung/Tippen nur bewusst, kein Online-Status. Suche im Verlauf nur im Gerät (geladene Nachrichten) getestet (8.2, Browsertest). Sprachnachricht/Kamera im Browser nur auf echten Geräten prüfbar | 4 |
| M02 Audio/Video 1:1 | getestet | Audio-/Videoanruf im Direktchat, E2EE-Signalisierung, Medien P2P, eigener TURN (coturn). Lokal mit zwei Browsern getestet (`scripts/call-check.py`), Stack-Test prüft TURN-Container und Zugangsdaten. Server 20.10.: TURN läuft, Verbindung Handy (Mobilfunk) ↔ PC kam zustande, Bild ja, **Ton nicht bestätigt** (Mikrofon-Freigabe prüfen). Klingeln nur bei geöffneter App | 7 |
| M02 Gruppenanrufe | getestet | „wie Zoom“ in Gruppen und Treffen (D-072): eigener Medienserver LiveKit, Bild/Ton Ende-zu-Ende-verschlüsselt (Schlüssel per Olm nur an Mitglieder im Anruf), Kacheln, Sprecher-Rahmen, Stumm/Kamera/Kamera wechseln/Bildschirm teilen, verkleinern (Chat nutzbar), Hinweis „Gruppenanruf läuft · Beitreten“, Eintrag im Verlauf, bis 25 Personen. Lokal mit drei Browsern und echtem Medienserver getestet (`scripts/groupcall-check.py`), Rauchtest prüft Token/Mitgliedschaft/Gerät/Signalweg, Stack-Test den Container. **Server offen:** Port 49210 UDP/TCP, Test mit Handys (Mobilfunk). Bildschirm teilen nur am Computer | 9 |
| M02 „Ruf mich an“ | vorgesehen | später |
| M03 Regionale Community | getestet | Themen + Regionen abonnierbar, Feed, Beiträge/Antworten/Bilder, Suche, Schlagworte, Lesezeichen, Umfragen, hilfreich/Lösung, anheften/schließen/archivieren/verschieben. Medien: nur Bilder (Video/Audio mit M02) | 3 |
| M04 Geschützte Gruppen | getestet | offen/Anfrage/geschützt, Aufnahmefragen, Pseudonym, keine Mitgliederliste für Fremde, Gruppenmoderation ohne Profilzugriff. Aufnahme durch Partnerorganisationen getestet (8.2, D-064); Profil-Freigabestufe „Gruppen“ getestet | 3 |
| M05 Familienradar | getestet | Bis zu 5 private Profile (Regionen inkl. Unterregionen, Themen, Alter, Arten), Vorschau, pausieren/löschen; Übersicht im Portal; E-Mail/Push freiwillig, wöchentlich oder täglich, nur Neues, mit Quelle/Datum/Frist/Link, neutraler Betreff/Push; gefolgte Einrichtungen. Abo einzelner Orte getestet (8.1); einzelne Termine über „Merken“ (Änderung/Absage + Erinnerung). Echter E-Mail-Versand erst mit SMTP | 5 |
| M06 Treffen, temporäre Räume, Live-Standort | getestet | Treffen per QR mit Ablauf und Löschung, dauerhaft behalten, Treffpunkt-Pin mit Hinweg, Live-Standort 15/30/60 Min. (nur bei geöffneter Seite – Grenze von Web-Apps) | 4 |
| M07 Social-Media-Links, Editor | getestet | Linkkarte mit SSRF-Schutz, Einbettung YouTube/Vimeo erst nach Klick, Teilen-Menü (PWA, Android/Chrome; iOS unterstützt share_target nicht), Editor mit Vorschau. Abruf echter Fremdseiten nur auf dem Server prüfbar | 3 |
| M08 Affiliate | extern blockiert | Technik getestet (Kennung beim Anzeigen, Kennzeichnung, fremde Kennungen nie überschrieben, nie in geschützten Bereichen, Erklärseite). Standardmäßig AUS – wartet auf PartnerNet-Konto und Prüfung der aktuellen Amazon-Bedingungen durch Jan (D-058) | 7 |
| M09 Marktplatz | getestet | Nur Mitglieder, nur private Anbieter. Verkaufen/verschenken/tauschen/suchen, 9 Kategorien, Bilder (ohne Personen, Metadaten entfernt), Preis/VB, Zustand, Größe, Alter, grobe Gegend (Mittelpunkt der Region, nie Adresse), Suche/Filter/Umkreis/Sortierung, Merken, Suchaufträge (Mitteilung, Push nur wenn eingeschaltet), Status verfügbar/reserviert/abgegeben/abgelaufen (30 Tage, verlängerbar), Kontakt als Kontaktanfrage mit Bezug → Chat nach Annahme, Melden/Moderation, Telefonnummern → Prüfung, Grenzen gegen Massenanzeigen, Hinweis/Bestätigung bei Autositzen und Kinderwagen. Marktplatz-Ebene auf der Familienkarte (M10): vorgesehen. Regeln für gewerbliche Anbieter: bewusst noch ausgeschlossen (D-051) | 6 |
| M10 Familienkarte | getestet | Karte, Liste, Umkreis/Entfernung, Filter, Gruppierung, Suche; Ebenen Termine (7 Tage), Kinderwagenrouten, Marktplatz und Hilfe (nur Mitglieder, je Gegend) mit Liste und Teilen-Link. Ebene „Mitglieder/Abdeckung“: bewusst nicht (keine Personen auf der Karte, D-061) | 2/8 |
| M11 Spielplatzkarte | umgesetzt | Import, Ausstattung, Spielgeräte, Detail, Merken, Fehler melden, Hinweise (Nutzer/Redaktion/amtlich), Vorschlagen mit Dublettenprüfung, Quelle/Aktualität getestet. Sternebewertungen mit Text und Fotos (nach Freigabe) getestet. Ort abonnieren (Hinweise, Termine) und „Treffen hier“ getestet (8.1); „Mitmachen“ oben, Quelle unten (F-005) | 2 |
| M12 Veranstaltungen | getestet | Liste/Kalender/Karte/Detail, Filter (Zeitraum, Region, Art, Alter, kostenlos, drinnen/draußen, FreiKarte, Suche), Herkunft sichtbar, Sichtbarkeit öffentlich/Netzwerk/privat-Link, wiederkehrend mit Einzelabsagen, Fristen, Kapazität, Warteliste-Angabe, Merken, Kalenderdatei, „Interessiert/Ich komme“ (unverbindlich) mit „Wer kommt mit?“ nur mit Zustimmung, „Was machen wir heute?“, Melden, ICS-Import, Event-Chat je Termin-Tag (verschlüsselt, nur Teilnehmende). Budget-Filter: nur „kostenlos“ | 5 |
| M13 Familienfreundliche Orte | umgesetzt | Toiletten, Wickeln, Indoor, Zoos/Bäder aus OSM, Familiencafés/Stillmöglichkeiten nur über Vorschläge (keine verlässliche offene Quelle). Bewertungen/Fotos getestet | 2 |
| M14 Kinderwagenrouten | getestet | Einzeichnen ohne GPS, Länge/Rundweg automatisch, Untergrund/Steigung/Treppen/Engstellen/Schatten/Rast/Dauer, Pflichtbestätigung öffentliche Start-/Zielorte, Prüfung durch Redaktion, Orte bis 150 m am Weg, Erfahrungen/Hindernisse, GPX, Filter. Import aus Quellen mit geklärter Lizenz und Ebene in der Familienkarte: vorgesehen | 7 |
| M15 Lebenslagen-Kompass | getestet | 6 Lebenslagen (Schwangerschaft, Geburt, Kita-Start, Schule, Trennung, Geld knapp) mit Schritten und offiziellen Links (Quelle Familienportal BMFSFJ, Prüfdatum), Abhaken nur im Browser, Beratung = verifizierte Einrichtungen der Gegend, Wissenseinträge und Gruppen zum Thema, Krisennummern bei sensiblen Lagen. Auswahl wird nicht gespeichert. Pflege unter Verwaltung → Lebenslagen. Weitere Lagen/regionale Inhalte (Bremen/Niedersachsen): vorgesehen, nur aus geprüften Quellen | 6 |
| M16 Familien helfen Familien | getestet | „Ich brauche Hilfe“/„Ich kann helfen“ nach Thema und Gegend, Hinweis „Erfahrung, keine Fachberatung“ mit Verweis auf Beratungsstellen, Vermittlung von Fremdbetreuung wird abgelehnt (mit Hinweis auf geprüfte Wege), Krisenwörter → offizielle Notruf-/Krisennummern, Antwort als Kontaktanfrage mit Bezug, erledigt/wieder öffnen, Ablauf 30 Tage, Melden | 6 |
| M17 Freie Plätze und Kurse | getestet | Nur verifizierte Einrichtungen; Verfügbarkeit mit Stand und Gültigkeit (3/7/14/30 Tage), sonst „unbekannt“; Erinnerung zur erneuten Bestätigung; Anbieter-Abo über „Folgen“ + Radar | 5 |
| M18 Merklisten, Kalender | getestet | Merkliste (Termine/Angebote/Hinweise; Orte weiter unter „Meine Orte“), Erinnerungen vor Beginn/Frist, .ics je Termin, persönlicher Kalender-Abo-Link (gehasht, erneuer-/abschaltbar) | 5 |
| M19 Wissen aus der Community | getestet | Einträge mit Quellen/Prüfdatum, Sichtbarkeit, Übernahme nur mit Zustimmung, nie aus Gruppen | 3 |
| M20 Regionale Hinweise | getestet | Arten neu/aktualisiert/Absage/Frist/Sperrung/Leistung, Herkunft amtlich (nur mit Quelle)/Anbieter/Redaktion/ungeprüft, Region nach oben und unten, Ortshinweise der Karte integriert, „wichtig“ als Push nur mit Opt-in. Hinweise von Mitgliedern mit Prüfung durch die Redaktion getestet (8.2, D-065) | 5 |
| M21 Geburtstage, Einladungen | getestet | Einladung per geheimem Link (erneuern, abschalten), Zu-/Absage auch ohne Konto, Adresse erst nach Zusage, höchstens N Zusagen, Antwortfrist, Gästeliste nur für Gastgeberin (Namen für Zusagende optional), Absagen mit Benachrichtigung, verschlüsselter Gäste-Chat (nur Konto + Zusage, gelöscht 2 Tage nach dem Termin), Löschung 30 Tage nach dem Termin, Ideen aus Familienkarte und Veranstaltungen der eigenen Gegend | 6 |
| M22 Verifizierte Einrichtungen | getestet | Antrag, Prüfung durch Verwaltung (Prüfangaben danach gelöscht), Profil, Team mit Verwaltung/Redaktion über Familien-ID, Vertretung, Folgen (Einrichtung sieht nur grobe Zahl), Angebote/Termine/Hinweise pflegen, eigener Kalender (ICS) täglich übernommen, pausieren. Übernahme importierter Einrichtungseinträge: vorgesehen (noch keine Einrichtungsquelle mit geklärter Lizenz) | 5 |
| M23 Datenversorgung | umgesetzt | Orte für ganz Deutschland (16 Länder, F-015), Quellenkatalog, Abruf, Abgleich, Vorschau/Freigabe, Sperren, Dubletten, Archiv, Fehlerwiederholung getestet. Weitere Prüfkandidaten (familiennetz bremen, Kita-Portal, FreiKarte …): je Quelle Lizenz klären, vorgesehen | 2 |
| M24 Admin/Moderation/Redaktion | getestet | Übersicht, Nutzer (nur Familien-ID, keine E-Mail – D-060), Nachricht an Mitglied/Fallbeteiligte, Rechte, Protokoll, Einstellungen, Datenzentrale, Moderation (Warteschlange, Fall, Entscheidung mit Begründung, Einspruch, Einschränkung, Zuständigkeit nach Region/Thema/Gruppe), Gruppen, Wissen, Chat-Meldungen (Wortlaut nur mit Freigabe), Chat-Server im Systemzustand, Prüfung von Einrichtungen, redaktionelle Hinweise, Meldungen zu Terminen/Angeboten/Einrichtungen, Statistik (nur Zählungen, „< 5“ bei Region, Ungemessenes als „nicht erfasst“), zweite Freigabe kritischer Aktionen, Routen-Prüfung |

## Offene Punkte

1. **Jan:** Mailserver in Verwaltung → Einstellungen eintragen, dann Test-E-Mail. Bis dahin ist die Registrierung geschlossen.
2. Nach dem Ausrollen: Verwaltung → Übersicht → „Chat-Server“ muss „In Ordnung“ zeigen. Dann mit zwei Konten testen: Kontakt verbinden → „Nachricht“ → Wiederherstellungsschlüssel aufbewahren.
2a. Abschnitt 5 ist leer, bis Inhalte kommen (keine erfundenen Termine): erste Einrichtungen anmelden lassen (`/einrichtungen/antrag`) und unter Verwaltung → Einrichtungen prüfen; Redaktion kann Hinweise unter Verwaltung → Hinweise veröffentlichen. Weitere Terminquellen (z. B. familiennetz bremen) nur nach Lizenzklärung.
2b. Abschnitt 6: Marktplatz und Hilfe sind leer, bis Mitglieder etwas einstellen. Kompass startet mit Inhalten aus dem Familienportal des Bundes; regionale Ergänzungen (Bremen/Niedersachsen) über Verwaltung → Lebenslagen. Abschnitt 7 ist fertig. Abschnitt 8 („Lücken schließen“) läuft: 8.1 fertig (Kartenebenen, Orte abonnieren, Treffen am Ort), 8.2 fertig (Stufe „Gruppen“, Partnerorganisationen, Mitgliederhinweise, Chat-Suche), 8.3 fertig (Rechtstexte, Barrierefreiheit, Geräteliste). **Jan:** Verwaltung → Rechtstexte ausfüllen und rechtlich prüfen lassen. Sammel-Update F-001–F-015 umgesetzt (Ausnahme F-012: Kartengebiet stellt Jan in der Verwaltung um). Gruppenanrufe umgesetzt (D-072).
2c. **Jan (Abschnitt 7):** Anrufe brauchen offene Ports 3479 UDP+TCP, 49160–49200 UDP und für Gruppenanrufe 49210 UDP+TCP am Server (IONOS-Firewall, falls aktiv; Befehl in DEPLOYMENT.md). Danach Videoanruf zwischen zwei Handys (WLAN ↔ Mobilfunk) testen. Partnerlinks bleiben aus, bis PartnerNet-Konto + Prüfung der Amazon-Bedingungen erledigt sind (Verwaltung → Affiliate). Zweite Freigabe greift erst, wenn es zwei Betreiber gibt.
3. Beobachten, ob das Löschen alter Image-Versionen mit `GITHUB_TOKEN` greift (Schritt läuft fehlertolerant; erst ab 4 Versionen sichtbar).
4. Annahmen bestätigen (DECISIONS.md D-009, D-010): TURN auf demselben Server, Mail über Plesk. Chat-Architektur ist mit D-034 festgelegt.
5. Sicherheit Server allgemein (nicht Kinder-spezifisch): Firewall aus, Portainer :9000 und weitere Dienste öffentlich erreichbar.
6. ODbL: Orte aus OSM + Mitglieder-Ergänzungen bilden eine abgeleitete Datenbank – auf Anfrage als ODbL-Export bereitstellen; rechtliche Prüfung durch Betreiber empfohlen (D-020).
