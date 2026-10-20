# CHANGELOG

Neueste Einträge oben. Format: Datum · was · warum · Module · DB-Migration.

## 2026-10-20 · Abschnitt 8.2: Freigabestufe „Gruppen“, Partnerorganisationen, Hinweise von Mitgliedern, Suche im Chat

**Was**
- Profil (M01): neue Freigabestufe „Mitglieder meiner Gruppen“ – sichtbar für Mitglieder aus gemeinsamen offenen/Beitritts-Gruppen (ohne Pseudonym) und für Kontakte; geschützte Gruppen zählen nie. Vorschau „So sehen andere mich“ mit Gruppen-Sicht; Entdecken nutzt dieselbe Regel.
- Gruppen (M04): Aufnahme durch Partnerorganisation. Verwaltung → Gruppen: verifizierte Einrichtung zuordnen (nicht bei offenen Gruppen). Deren Verwaltung entscheidet über Anfragen (nur Pseudonym + Antworten, keine Familien-ID, keine Mitgliederliste, keine Moderation); Einstieg unter „Meine Einrichtungen → Aufnahme in Gruppen“. Neue Anfragen melden sich jetzt bei Gruppenmoderation und Partner (ohne Namen). Anfragende sehen, wer mitentscheidet.
- Hinweise (M20): „Hinweis vorschlagen“ für Mitglieder (`/hinweise/neu`) mit Art, Gegend, optionaler Quelle, Laufzeit; private Daten werden abgewiesen, 3 pro Tag. Redaktion prüft unter Verwaltung → Hinweise („Vorschläge von Mitgliedern“), Ablehnung nur mit Grund; Mitglied erhält Mitteilung, sieht Status, kann beenden/zurückziehen. Sichtbar als „Hinweis eines Mitglieds“. Export und Kontolöschung umfassen die Vorschläge.
- Chat (M02): „Im Verlauf suchen“ im Menü jeder Unterhaltung – nur in den auf dem Gerät geladenen, entschlüsselten Nachrichten (Text und Dateinamen), Groß/klein-, Umlaut- und ß-tolerant, Treffer mit Ausschnitt, Antippen springt zur Nachricht, „Ältere Nachrichten laden“ erweitert die Suche. Nichts geht an den Server.
**Warum** Offene „vorgesehen“-Punkte aus STATUS (Abschnitt 8); Grundsätze D-063 bis D-065.
**Module** M01, M02, M04, M20, M22 (Partnerrolle), M24 · **DB-Migration** ja – `0011_gruppen_hinweise.sql` (community_groups.partner_org_id; notices: Status pruefung/abgelehnt, review_note)
**Tests** svelte-check 0 Fehler; 198 Unit/DB-Tests (neu 5 Unit: Stufe „gruppen“, Chat-Suche Text/Umlaute/Ausschnitt; 3 DB: Gruppen-Sicht nur offene Gruppen ohne Pseudonym/aktiv/Kontakte/ohne Anmeldung nie, Partner nur verifiziert + Verwaltung/keine Profile/keine Mitgliederliste/Mitteilung ohne Namen/Protokoll/pausiert/offene Gruppe, Mitgliederhinweise Arten/Region/private Daten/Prüfung/Rechte/Ablehnung mit Grund/Limit/beenden/Export/Löschung); Rauchtest 274 Prüfungen mit echtem Synapse (neu: Stufe speichern + Vorschau, Hinweis vorschlagen → unsichtbar → Redaktion gibt frei → sichtbar als Mitglied, Gruppenverwaltung mit Partner); Browsertest `call-check.py`: Suche im Verlauf (Umlaut-tolerant) und Sprung zur Nachricht, danach Videoanruf wie bisher; Bildschirmfotos; Build
**Korrektur unterwegs** Benannte Form-Actions: `/hinweise/neu` nutzt `?/vorschlagen` (SvelteKit erlaubt keine Default-Action neben benannten).

## 2026-10-20 · Abschnitt 8.1: Kartenebenen, Orte abonnieren, Treffen am Spielplatz

**Was**
- Familienkarte (M10): Knopf „Ebenen“ mit Kartenart (Karte/Luftbild) und Zusatzebenen: Termine der nächsten 7 Tage (je Termin das nächste Datum, nur was die Person sehen darf, abgesagte nicht), Kinderwagenrouten als Linien (nur geprüfte), Marktplatz und Hilfe (nur angemeldet, nur Anzahl je Gegend am Mittelpunkt der Region, Blockierte zählen nicht). Antippen öffnet eine Karte mit Link; die Liste zeigt die Einträge nach Entfernung. Auswahl teilbar per `?ebenen=` und im Browser gemerkt.
- Orte abonnieren (M11/M05): „Abonnieren“ auf jeder Ortsseite (merkt den Ort mit). Mitteilung (Push nur mit Schalter „Radar“) bei neuem Hinweis (defekt/gesperrt, auch unbestätigt – ohne Freitext), Bestätigung durch Redaktion/amtlich, Aufhebung, neuem Termin an diesem Ort (nicht bei privaten Terminen, nicht an den Auslöser). Übersicht und „Abo beenden“ im Familienradar; Datenexport enthält das Abo.
- „Treffen hier“ (M11/M06) auf der Ortsseite: Treffen per QR mit Name und Treffpunkt des Ortes vorausgefüllt.
- Korrektur Wiederholungen (M12): Startzeiten mit Sekunden (z. B. aus Kalender-Importen) ließen den ersten Termin einer Serie wegfallen.
- STATUS: Anruf über Mobilfunk – Ton beim Test am 20.10. nicht bestätigt (Bild ja); bleibt offen bis zum Test mit Mikrofon-Freigabe.
**Warum** Offene „vorgesehen“-Punkte aus STATUS (Abschnitt 8 „Lücken schließen“); Grundsätze D-061, D-062.
**Module** M05, M06, M10, M11, M12 · **DB-Migration** ja – `0010_luecken.sql` (place_favorites.notify)
**Tests** svelte-check 0 Fehler; 192 Unit/DB-Tests (neu 1 Unit: Serie mit Sekunden; 4 DB: Termine-Ebene Sichtbarkeit/nächstes Datum/Ausschnitt/abgesagt, Marktplatz/Hilfe nur Mitglieder je Gegend ohne Blockierte, Routen erst nach Prüfung, Ort abonnieren mit allen Auslösern/ohne Auslöser/privat/Abo beenden/Export); Rauchtest 265 Prüfungen mit echtem Synapse (neu: Ebenen ohne/mit Anmeldung, zu großer Ausschnitt, Abo, „Treffen hier“, Radar-Liste); Bildschirmfotos Karte mit Ebenen (mobil); Build
## 2026-10-20 · Test-/Fehler-/Änderungsbereich (`docs/FEEDBACK.md`)

**Was** Neue Sammelliste für Beobachtungen aus dem Testen (Fehler, Ändern, Entfernen, Dazu, Fragen) mit IDs, Priorität, Status und festem Ablauf „sammeln → ein Sammel-Update“. `CLAUDE.md` verweist darauf, damit jeder neue Chat offene Einträge mitmeldet.
**Warum** Jan will beim Testen im Chat Punkte nennen und am Ende alles in einem Auftrag umsetzen lassen, statt jede Kleinigkeit einzeln auszurollen.
**Module** keine (nur Doku/Prozess) · **DB-Migration** nein · **Tests** nicht nötig (kein Code); Doku-Push löst laut `paths-ignore` keinen Build aus.

## 2026-10-19 · Abschnitt 7: Anrufe mit TURN, Kinderwagenrouten, Partnerlinks, Statistik, zweite Freigabe

**Was**
- Audio-/Videoanrufe (M02) im verschlüsselten Direktchat: Knöpfe „Anruf“/„Videoanruf“ (nur zwischen genau zwei Personen), eingehender Anruf mit Klingelton auf jeder Seite der App, annehmen/ablehnen, stumm, Kamera aus, auflegen, Dauer. Signalisierung Ende-zu-Ende-verschlüsselt, Medien direkt zwischen den Geräten (DTLS-SRTP), kein Mitschnitt. Besetzt → automatisch abgelehnt.
- Eigener TURN-Server (Container `turn`, coturn 4.6.3, Port 3479 UDP/TCP, Relay 49160–49200 UDP) für Geräte hinter NAT/Mobilfunk; Zugangsdaten zeitlich begrenzt (1 Std.) vom Chat-Server, Geheimnis aus APP_SECRET abgeleitet, keine Weiterleitung in private Netze. Konfiguration schreibt die App – nichts von Hand.
- Kinderwagenrouten `/routen` (M14): Weg auf der Karte Punkt für Punkt einzeichnen (kein GPS, kein Bewegungsprofil), Länge automatisch, Rundweg-Erkennung, Untergrund, Steigung, Treppen, Engstellen, Schatten, Rastplätze, Dauer. Bestätigung „Start/Ziel sind öffentliche Orte“ Pflicht. Mitgliederrouten erst nach Prüfung durch die Redaktion öffentlich. Spielplätze/Toiletten/Wickeln bis 150 m am Weg automatisch, Erfahrungen „passt/Hindernis/gesperrt“ (Hindernisse sofort als ungeprüfter Hinweis + Fall für die Redaktion), GPX-Download, Filter (Region, Umkreis, Länge, ohne Treppen, eben). Verwaltung → Routen.
- Partnerlinks (M08): amazon.de-Links in Community-Beiträgen erhalten beim Anzeigen die Partnerkennung von Kinder Deutschlands, sichtbar als „Partnerlink“ mit Erklärseite `/partnerlinks`; fremde Kennungen werden nie überschrieben, sondern als „fremder Partnerlink“ markiert. Nie in geschützten Gruppen, Chats, Marktplatz, Einladungen. Standardmäßig AUS; Einschalten nur mit Bestätigung der geprüften Amazon-Bedingungen (Verwaltung → Affiliate, mit Link-Test).
- Statistik (M24, Verwaltung → Statistik): Zeitraum 7/30/90/365 Tage mit Vorzeitraum, optional Region; Mitglieder, Community, Kommunikation (nur technische Zahlen), Moderation, Orte/Daten, Termine/Angebote/Radar, Marktplatz/Hilfe. Nur Zählungen; mit Regionsfilter Werte 1–4 als „< 5“; Ungemessenes (Seitenaufrufe, Anrufe) als „nicht erfasst“.
- Zweite Freigabe (M24, Verwaltung → Freigaben): Betreiber-/Technikrolle vergeben/entziehen und Konto sperren brauchen eine zweite Person mit demselben Recht; Antrag mit Begründung, 72 Std. gültig, nicht selbst freigebbar, zurückziehbar. Gibt es nur eine berechtigte Person, gilt die Aktion sofort mit Vermerk im Protokoll.
- Kontolöschung/Datenexport umfassen Routen und Erfahrungen; offene Anträge werden zurückgezogen. Moderation kennt Routen. Startseite: Einstieg Routen.
**Warum** Bauabschnitt 7 laut ROADMAP; Grundsätze D-056 bis D-059.
**Module** M02, M08, M14, M24 (Statistik, zweite Freigabe, Routen-Redaktion), M10 (Routen-Ebene in eigener Karte) · **DB-Migration** ja – `0009_ausbau.sql` (approvals, stroller_routes, route_reports, Moderationsziel „route“, Rechte routes.edit/stats.view, Einstellung affiliate = aus)
**Offen (vorgesehen, nicht gestrichen)** Gruppenanrufe (LiveKit), Klingeln bei geschlossener App (Web-Push kann kein Anrufsignal), „Ruf mich an“, Routen-Import aus Quellen mit geklärter Lizenz, Routen als Ebene der Familienkarte, weitere Partnerprogramme, Kennzahlen zu Anrufen (bewusst nicht erfasst, solange ohne Inhaltsbezug nicht messbar).
**Tests** svelte-check 0 Fehler; 187 Unit/DB-Tests (neu: TURN-Konfiguration, Partnerlink-Regeln; 6 DB: zweite Freigabe allein/zu zweit/selbst/kein Recht/doppelt/abgelehnt/abgelaufen, Sperre beendet Sitzungen, Route Prüfung/Länge/Sprünge/Telefonnummer/Rundweg/Orte am Weg/Filter/Hinweise/GPX, Statistik inkl. „< 5“ und „nicht erfasst“, Partnerlinks aus/an/geschützte Gruppe, unkritische Rechte direkt); Rauchtest 257 Prüfungen mit echtem Synapse (neu u. a. Route einreichen → Prüfung → öffentlich, GPX, Hinweis, Statistik, Freigaben, Affiliate nur mit Bestätigung, Erklärseite); Anruftest `scripts/call-check.py` lokal mit zwei Browsern: Videoanruf verschlüsselt, beide empfangen Bild und Ton, stumm, auflegen. Ein Rauchtestlauf scheiterte einmal zufällig an der Schlüsselübernahme im Chat-Teil (unverändert seit Abschnitt 4), Wiederholung grün. TURN über das Internet: erst auf dem Server prüfbar. Build

## 2026-10-19 · Abschnitt 6: Marktplatz, Familien helfen Familien, Lebenslagen-Kompass, Einladungen, Event-Chat

**Was**
- Marktplatz `/marktplatz` (M09, nur Mitglieder): verkaufen, verschenken, tauschen, suchen; Kategorien, Bilder (ohne Personen, ohne Metadaten), Preis/VB, Zustand, Größe, Alter, nur grobe Gegend (Mittelpunkt der Region). Suche, Filter, Umkreis, Sortierung, Merken (Merkliste), Suchaufträge mit Mitteilung (Push nur mit neuem Schalter „Marktplatz“). Status verfügbar/reserviert/abgegeben, Ablauf nach 30 Tagen, verlängern, Bilder ergänzen/entfernen, löschen, melden. Anfrage = Kontaktanfrage mit Bezug zur Anzeige, danach verschlüsselter Chat. Nur private Anbieter, Grenzen gegen Massenanzeigen, Telefonnummern → Prüfung, Sicherheitshinweis bei Autositzen/Kinderwagen, Hinweis „kein Kauf über uns, nicht vorab überweisen“.
- Familien helfen Familien `/hilfe` (M16): „Ich brauche Hilfe“/„Ich kann helfen“ nach Thema und Gegend, ausdrücklich Erfahrung statt Fachberatung, Fremdbetreuung wird nicht vermittelt, bei Krisenwörtern offizielle Notruf- und Krisennummern, Antwort als Kontaktanfrage mit Bezug, erledigt/wieder öffnen, Ablauf 30 Tage.
- Lebenslagen-Kompass `/kompass` (M15): Schwangerschaft, Geburt, Kita-Start, Schule, Trennung, Geld knapp – Schritte und offizielle Links mit Quelle (Familienportal des BMFSFJ, geprüft 19.10.2026), Beratungsstellen = verifizierte Einrichtungen der Gegend, Wissen und Gruppen zum Thema, Krisennummern bei sensiblen Lagen. Nichts von der Auswahl wird gespeichert. Pflege unter Verwaltung → Lebenslagen.
- Einladungen `/einladungen`, `/e/…` (M21): z. B. Kindergeburtstag mit geheimem Link (erneuern, abschalten), Antworten auch ohne Konto, Adresse erst nach Zusage, Höchstzahl, Antwortfrist, Gästeliste nur für die Gastgeberin, Änderungen/Absage mit Mitteilung an Gäste mit Konto, verschlüsselter Gäste-Chat, automatische Löschung 30 Tage nach dem Termin, Ideen aus Familienkarte und Veranstaltungen der eigenen Gegend.
- Event-Chat zu „Wer kommt mit?“ (M12, offen aus Abschnitt 5): je Termin-Tag, nur Teilnehmende/Veranstalter, gelöscht einen Tag nach dem Termin.
- Kontaktanfragen zeigen den Bezug (Anzeige/Hilfe-Eintrag). Startseite, Profil und Verwaltung mit neuen Einstiegen. Datenexport und Kontolöschung umfassen Anzeigen (samt Bildern), Suchaufträge, Hilfe-Einträge, Einladungen und Antworten. Moderation kennt Anzeigen, Hilfe-Einträge und Einladungen.
- Korrektur: Seiten konnten keine eigene `Referrer-Policy` setzen (wurde immer überschrieben).
**Warum** Bauabschnitt 6 laut ROADMAP; Grundsätze D-051 bis D-055.
**Module** M09, M12 (Event-Chat), M15, M16, M21, M24 (Moderation, Kompass-Redaktion) · **DB-Migration** ja – `0008_alltag.sql` (Anzeigen, Suchaufträge, Hilfe-Einträge, Kontaktanfragen mit Bezug, Lebenslagen + erste Inhalte, Einladungen + Antworten, Event-Chats, Merken von Anzeigen, Push-Schalter Marktplatz, Recht compass.edit)
**Offen (vorgesehen, nicht gestrichen)** Marktplatz-Ebene auf der Familienkarte (M10), Regeln für gewerbliche Anbieter (M09), weitere/regionale Kompass-Inhalte aus geprüften Quellen, Budget-Filter (M12).
**Tests** svelte-check 0 Fehler; 177 Unit/DB-Tests (neu 3 Unit (Fremdbetreuung/Krise erkennen, Preise) und 10 DB (Anzeige-Pflichtangaben/grober Ort/Dubletten/Sicherheit, Prüfung bei Telefonnummer, Suche/Umkreis/Blockieren, Anfrage mit Bezug → Kontakt, Status/Ablauf/Verlängern/Suchauftrag, Hilfe ohne Fremdbetreuung + Krisenhinweis, Kompass-Rechte/Quellen, Einladung ohne Konto/Adresse nach Zusage/Höchstzahl/Link erneuern/abschalten, Löschung nach 30 Tagen, Kontolöschung)); Rauchtest 244 Prüfungen mit echtem Synapse (neu u. a. Anzeige → Anfrage → Annahme, Suchauftrag, Hilfe, Kompass, Einladung ohne Konto, Gäste-Chat nur nach Zusage, Event-Chat nur mit Teilnahme); Bildschirmfotos mobil/desktop hell/dunkel; Build

## 2026-10-19 · Abschnitt 5: Veranstaltungen, Einrichtungen, freie Plätze, Hinweise, Merkliste, Familienradar

**Was**
- Veranstaltungen `/veranstaltungen` (M12): Liste nach Tagen, Monatskalender, Karte; Filter Zeitraum (heute, Wochenende, 7/30/90 Tage), Region, Art, Alter, kostenlos, drinnen/draußen, FreiKarte, Suche – alles auch ohne JavaScript. Detailseite mit Herkunft, Zeit, Ort, Alter, Kosten, Ermäßigung, Zugänglichkeit, Kapazität, Anmeldeschluss/-link, Quelle und Aktualität, weitere Termine der Reihe, Hinweg, Teilen, Kalenderdatei, Melden.
- Termine eintragen/bearbeiten: als verifizierte Einrichtung, Redaktion oder Mitglied. Wiederholung (wöchentlich, 14-täglich, monatlich am Tag/Wochentag, täglich, bis Datum), Einzeltag oder ganze Reihe absagen (bleibt als „abgesagt“ sichtbar, Betroffene werden benachrichtigt, Absage erscheint als Hinweis), Absage zurücknehmen, entfernen. Sichtbarkeit öffentlich/im Netzwerk/privat per Link; Mitglieder höchstens „im Netzwerk“, keine FreiKarte-Angabe; Telefonnummern u. Ä. → Prüfung.
- „Interessiert“/„Ich komme“ (unverbindlich, keine Buchung), „Wer kommt mit?“ nur mit Zustimmung. „Was machen wir heute/morgen?“: Termine plus passende Orte der Familienkarte nach Region oder Standort, Alter, drinnen/draußen, kostenlos.
- Einrichtungen `/einrichtungen` (M22): Antrag, Prüfung unter Verwaltung → Einrichtungen (Begründung Pflicht, Prüfangaben danach gelöscht), öffentliches Profil mit Angeboten, Terminen, Hinweisen, Folgen (Einrichtung sieht nur grobe Zahl), Verwaltungsbereich mit Team (Verwaltung/Redaktion über Familien-ID, letzte Verwaltung geschützt), Profil, Angebote, Hinweise, Termine, eigener Kalender (ICS) mit täglichem Abruf über die Datenzentrale. Pausieren durch die Verwaltung.
- Freie Plätze & Kurse `/angebote` (M17): Verfügbarkeit nur mit Bestätigung für 3/7/14/30 Tage, sonst „Verfügbarkeit unbekannt“; Stand und Gültigkeit immer sichtbar; Erinnerung an das Team nach Ablauf; neu frei → Hinweis „Neu“.
- Hinweise & Fristen `/hinweise` (M20): Art und Herkunft (amtlich nur mit Quelle, Anbieter, Redaktion, ungeprüft) sichtbar, Region nach oben/unten, Ortshinweise der Karte integriert, Merken und Erinnern an Fristen. Redaktion unter Verwaltung → Hinweise; „wichtig“ = Push ohne Inhalt nur bei Opt-in.
- Merkliste `/profil/merkliste` (M18): Termine, Angebote, Hinweise; Erinnerungen 1 Std. bis 1 Woche vor Beginn/Frist (Mitteilung + Push, abschaltbar); persönlicher Kalender-Abo-Link (einmal angezeigt, erneuer-/abschaltbar).
- Familienradar `/radar` (M05): bis 5 private Profile, Vorschau der nächsten 30 Tage mit „neu“-Markierung, pausieren/löschen; Zusammenfassung wöchentlich (Mo) oder täglich per E-Mail und/oder Push, nur Neues, mit Quellen/Fristen/Links, neutraler Betreff; gefolgte Einrichtungen zählen mit.
- Benachrichtigungen: neue Schalter „Erinnerungen“ und „dringende Hinweise“. Startseite: Entdecken-Einstiege, Bauabschnitt-Kacheln aktualisiert. Profil: Merkliste, Radar, Meine Einrichtungen.
- Datenexport und Kontolöschung umfassen Radar, Merkliste, Kalender-Link, Teilnahmen, Folgen, Teams und eigene Termine. Moderation kennt Termine, Angebote, Einrichtungen.
- Korrektur: Dringende Hinweise erreichten Radar-Profile mit Stadtteil nicht, wenn der Hinweis für die ganze Stadt galt.
**Warum** Bauabschnitt 5 laut ROADMAP; Grundsätze D-042 bis D-050.
**Module** M05, M12, M17, M18, M20, M22, M24 (Prüfung, Hinweise, Meldungen), M23 (ICS-Quellen) · **DB-Migration** ja – `0007_angebote.sql` (Einrichtungen, Team, Folgende, Termine, Teilnahme, Angebote, Hinweise, Merkliste, Kalender-Links, Radar-Profile/-Versand, Rechte orgs.verify/notices.edit/events.edit)
**Offen (vorgesehen, nicht gestrichen)** Event-Chat zu „Wer kommt mit?“, Abo einzelner Orte/Termine im Radar, Hinweise von Mitgliedern außerhalb der Karte, Übernahme importierter Einrichtungseinträge, Budget-Filter über „kostenlos“ hinaus, abweichende Einzeltermine aus ICS (RECURRENCE-ID).
**Tests** svelte-check 0 Fehler; 164 Unit/DB-Tests (neu 13 Unit: Ortszeit/Zeitumstellung, Wiederholungen, ICS hin/zurück; 13 DB: Antrag/Prüfung/Team/Folgen, Sichtbarkeit Mitglied/öffentlich/privat/blockiert, Reihe mit Einzelabsage + Benachrichtigung, „Wer kommt mit?“, Gültigkeit freier Plätze + Erinnerung, Hinweis-Rechte/Regionen, Erinnerung + Kalender-Link, Radar-Auswahl/Dubletten/Fälligkeit, ICS-Import mit Sperren/Archiv/Pause, Export/Löschung); Rauchtest 209 Prüfungen mit echtem Synapse (neu u. a. Antrag → Verifizierung, Termin als Einrichtung, Liste/Kalender/Karte, .ics, Mitgliedstermin nicht öffentlich, Merkliste + Kalender-Link, Absage + Benachrichtigung, Angebot unbekannt → frei mit Gültigkeit, Redaktionshinweis im Stadtteil, Radar, ICS-Abruf der Einrichtung); Bildschirmfotos mobil/desktop hell/dunkel; Build

## 2026-10-19 · Abschnitt 4: Ende-zu-Ende-verschlüsselter Chat, Push, Treffen per QR, Live-Standort

**Was**
- Eigener Chat-Server (Matrix/Synapse 1.162.0) im Stack: ohne Föderation, ohne Registrierung, ohne Passwörter, ohne Online-Status, ohne Nutzersuche. Die App schreibt Konfiguration, Regelmodul und Signaturschlüssel beim Start selbst (Geheimnisse aus `APP_SECRET` abgeleitet) und legt die Datenbank `synapse` an. Synapse startet bei geänderter Konfiguration von selbst neu. Erreichbar nur über die App (`/_matrix/client`, `/_matrix/media`) – keine Plesk-Änderung.
- Anmeldung am Chat automatisch über das bestehende Konto (kurzlebiges Token). Chat-Kennung zufällig, nicht aus Familien-ID ableitbar. Anzeigename nur, wenn er für Mitglieder sichtbar ist.
- Regeln serverseitig (Regelmodul fragt die App): Einladungen nur an bestätigte Kontakte, Direktchat nur für die zwei, Blockieren stoppt Nachrichten, Beitritt ohne Einladung nur per Treffen-Ticket, Moderations-Einschränkung gilt in Gruppen/Treffen, Sperre für alles. Bei Störung wird abgelehnt.
- Nachrichten (M02): Direktchat und Gruppen, Text mit klickbaren Links, Bilder (im Browser verkleinert, ohne GPS), Dateien bis 20 MB, Sprachnachrichten, Löschen, Stummschalten, Einladungen, Verlassen. Alles im Browser Ende-zu-Ende-verschlüsselt (Matrix Rust-Krypto als WebAssembly); der Server speichert nur Chiffrat (im Rauchtest geprüft).
- Erstnachricht ehrlich: Hat das Gegenüber den Chat noch nie geöffnet, gibt es keine Schlüssel – das Eingabefeld wartet, das Gegenüber bekommt automatisch einen Hinweis; Direktchat-Einladungen von Kontakten werden automatisch angenommen.
- Gerätewechsel: Wiederherstellungsschlüssel (einmal angezeigt: kopieren, als Datei, drucken), neues Gerät freischalten und frühere Nachrichten aus der verschlüsselten Schlüsselsicherung lesen, bei Verlust neu einrichten (bestätigt durch die App statt Passwort). Geräteliste mit Abmelden. Seite „Geräte und Schlüssel“.
- Push (PWA): Service Worker, eigenes Push-Gateway ohne Inhalt („Neue Nachricht“), Ruhezeiten, Chat/Community getrennt schaltbar, Test-Push, iPhone-Installationshilfe, App-Symbole (PNG, maskable). Lesebestätigungen und Tippanzeige standardmäßig aus.
- Treffen per QR (M06): temporärer verschlüsselter Raum (2 Std. bis 7 Tage), QR-Code/Link, Beitritt nur angemeldet mit Ticket, nach Ablauf Raum samt Nachrichten vom Server gelöscht, „dauerhaft als Gruppe behalten“, „beenden“. Treffpunkt-Pin (eigener Standort oder Karte) mit Hinweg-Auswahl. Live-Standort 15/30/60 Min., sichtbar aktiv, sofort stoppbar, nur verschlüsselt im Raum.
- Melden aus dem Chat: Die meldende Person gibt die Nachricht (optional bis 5 vorherige) ausdrücklich frei; Absender und Zeitpunkt bestätigt der Server. Moderation zeigt den Fall ehrlich (Wortlaut nicht prüfbar) und erlaubt nur freigeben/verwarnen/einschränken/sperren/eskalieren.
- Verwaltung: Systemzustand zeigt Chat-Server mit technischen Kennzahlen (keine Inhalte).
- Kontolöschung legt das Chat-Konto still (Synapse „erase“), löscht Push-Abos und Einstellungen; Datenexport erklärt, warum Chatinhalte nicht exportierbar sind.
- Sicherung: Chat-Datenbank täglich (14 Tage), Chat-Medien (verschlüsselt) letzte 3 Stände.
- CI: Rauchtest mit echtem Synapse; neuer Stack-Test startet vor jedem Ausrollen die echten Container (Web-Image, Synapse-Image, PostGIS) und prüft Anmeldung, Verschlüsselung, Regelmodul ↔ App, gesperrte Admin-Schnittstelle.
- Korrekturen: `Permissions-Policy` erlaubte Standort/Mikrofon/Kamera nicht einmal für die eigene Seite („Mein Standort“ auf der Karte ging dadurch nicht) – jetzt `self`. Kontolöschung schlug fehl, wenn jemand Community-Antworten geschrieben hatte (leerer Text verletzte Prüfregel) – behoben und getestet.
**Warum** Bauabschnitt 4 laut ROADMAP; Verschlüsselungsarchitektur endgültig festgelegt (D-034 bis D-041).
**Module** M02 (ohne Anrufe), M06, M24, Querschnitt (PWA, Push, Datenschutz) · **DB-Migration** ja – `0006_chat.sql` (Chat-Konten, Räume, Treffen-Tickets, Push-Abos, Benachrichtigungseinstellungen, Beweisfeld für Chat-Meldungen)
**Tests** svelte-check 0 Fehler, 138 Unit/DB-Tests (neu: Darstellung/XSS, Ruhezeiten, Synapse-Konfiguration, Token; DB: Regeln Einladen/Beitreten/Senden, Push-Gateway, Einstellungen, VAPID, Löschung), 173 E2E-Prüfungen mit echtem Synapse (u. a. E2EE-Nachricht, Klartext nicht in der Server-DB, Push ohne Inhalt, Ruhezeit, Gerätewechsel mit Wiederherstellungsschlüssel, Zurücksetzen nur mit Bestätigung, Treffen-Ticket, Ablauf + Löschung, Blockieren, Melden, Kontolöschung), Browsertest in Chromium (zwei Personen chatten, Bild, Treffpunkt, Treffen per QR), Bildschirmfotos mobil/desktop hell/dunkel, Build

## 2026-10-18 · Abschnitt 3: Community, Gruppen, Moderation, Wissen, Ortsbewertungen

**Was**
- Community `/community` (nur für Mitglieder; Gäste sehen einen Hinweis): Beiträge nach Thema (9 Themen, u. a. Erziehung, Kinderarzt, Betreuung, Alleinerziehende, Produkte, lokale Hilfe) und/oder Region. Persönlicher Feed „Für dich“ aus Abos (Regionen schließen Stadtteile ein, Themen, Gruppen), dazu Neu, Gelöst & Tipps, Lesezeichen, Volltextsuche, Schlagworte.
- Beitragsarten Frage, Beitrag, Tipp, Link, Umfrage. Antworten, „hilfreich“, Lösung markieren, Lesezeichen, Bearbeiten/Löschen, Bilder (bis 4), Kennzeichnungen (z. B. Werbung/Erfahrung).
- Editor mit Werkzeugleiste und Vorschau, sichere Formatierung (kein HTML). Teilen aus dem Handy-Menü (PWA share_target) öffnet „Beitrag schreiben“ mit Link.
- Linkkarten (M07): Titel/Beschreibung/Bild serverseitig geholt, gegen interne Adressen geschützt (DNS-Prüfung, feste IP, Weiterleitungen geprüft). YouTube (nocookie) und Vimeo erst nach Klick; Instagram/TikTok/Facebook als Karte mit Herkunft; ehrlicher Fallback, wenn nichts lesbar ist.
- Gruppen (M04): offen, mit Beitrittsanfrage, geschützt. Geschützt: Aufnahmefragen, Pseudonym je Gruppe; Nichtmitglieder sehen weder Beiträge noch Mitgliederzahl/-liste; die Gruppenmoderation sieht Pseudonym und Antworten, nicht Profil oder Familien-ID. Antworten werden nach der Entscheidung gelöscht. Globale Moderation ist für geschützte Gruppen nicht automatisch zuständig.
- Moderation (M24) `/admin/moderation`: Warteschlange mit Vorschau, Priorität, Filter, Kennzahlen; Fall übernehmen, Notiz, Entscheidung mit Pflichtbegründung (freigeben, kennzeichnen, ausblenden, entfernen, wiederherstellen, schließen, archivieren, anheften, verschieben, verwarnen, zeitweise einschränken, sperren nur Betreiber, eskalieren). Betroffene erhalten die Begründung als Mitteilung und können einmal Einspruch einlegen. Zuständigkeit nach Region (inkl. Unterregionen), Thema oder Gruppe.
- Automatische Vormarkierung: Telefonnummern, E-Mail, IBAN, Drohungen → zurückgehalten bis zur Prüfung; Beleidigung, Betrug, Kurzlinks, Spam → nur markiert. Nie endgültig.
- Wissen (M19) `/community/wissen`, Pflege unter `/admin/wissen`: geprüfte Einträge mit Quellen und Prüfdatum, öffentlich oder nur Mitglieder. Übernahme aus einem Beitrag nur aus offenen Bereichen und erst nach Zustimmung der Autorin/des Autors.
- Orte (M11/M13): Sternebewertung mit Text (eine je Person, änderbar), Ortsfotos erst nach Freigabe durch Moderation, Melden von Bewertungen/Fotos.
- Mitteilungen `/profil/mitteilungen` mit Zähler im Kopf.
- Bilder werden neu kodiert (WebP), Metadaten inkl. GPS entfernt, nur nach Zugriffsprüfung ausgeliefert. Volume `media`, tägliche Sicherung als Archiv (letzte 3).
- Kontolöschung entfernt Beiträge/Antworten (Text), Bewertungen, Mitgliedschaften, Abos, Mitteilungen und Bilder; Datenexport enthält die Community-Daten.
**Warum** Bauabschnitt 3 laut ROADMAP (M03, M04, M07, M19, M24); Bewertungen/Fotos nach D-025 erst mit Moderation.
**Module** M03, M04, M07, M11, M13, M19, M24, Querschnitt · **DB-Migration** ja – `0005_community.sql` (Themen, Gruppen, Mitgliedschaften, Beiträge, Antworten, Umfragen, Lesezeichen, Abos, Medien, Ortsbewertungen, Moderationsfälle, Einschränkungen, Mitteilungen, Wissen, neue Rechte)
**Tests** svelte-check 0 Fehler, 119 Unit/DB-Tests (neu: Formatierung/XSS, Vormarkierung, SSRF-Schutz, Anbieter-Erkennung; DB: Feed/Abos mit Unterregionen, Zurückhalten + Freigabe, regionale Zuständigkeit, Antworten/Lösung/Mitteilung, Umfrage, geschützte Gruppe mit Pseudonym und Zuständigkeit, Entfernen/Einspruch/Wiederherstellen, Einschränkung, Wissen mit Zustimmung, Ortsfoto ohne Metadaten, Kontolöschung), 129 E2E-Prüfungen (neu: Beitrag, Zurückhalten, Antwort, Suche, Meldung → Moderation → Mitteilung, Gruppenantrag mit Pseudonym, Ortsbewertung, Rechte), Bildschirmfotos mobil/desktop hell/dunkel, Build

## 2026-10-18 · Karte: Luftbild, Navigation, verständliche Abruffehler

**Was**
- Umschalter Karte/Luftbild (gemerkt je Gerät). Luftbild Niedersachsen: LGLN DOP20 (CC BY 4.0), über eigenen Server ausgeliefert und zwischengespeichert (max. 6 GB). Bremen: kein freies Luftbild – Hinweis auf der Karte; optional Esri World Imagery mit eigenem Schlüssel unter Verwaltung → Einstellungen (verschlüsselt, vor dem Speichern geprüft).
- „Hinweg“ öffnet Auswahl: Google Maps, Apple Karten, Waze, OpenStreetMap, andere Karten-App (geo:). Übergeben wird nur das Ziel. Zuletzt gewählte App steht oben.
- Abrufe: Netzwerkfehler mit Ursache (DNS, Zertifikat, Zeitüberschreitung …) statt „fetch failed“, 3 Wiederholungen. Stadtteile melden einen Fehler, solange Stadtgrenzen fehlen, und laufen nach erfolgreichem VG250-Abruf automatisch erneut.
**Warum** Rückmeldung Jan: VG250 „fetch failed“ auf dem Server, Kartentyp-Umschalter und Übergabe an Navigations-Apps fehlten. VG250 aus Node 24 Alpine im CI erreichbar → Ursache liegt im Servernetz oder war vorübergehend; die neue Meldung zeigt sie.
**Module** M10, M11, M23, M24 · **DB-Migration** nein
**Tests** svelte-check 0 Fehler, 92 Unit/DB-Tests (neu: Luftbildgebiet, Leerkachel, Zwischenspeicher, Navigationslinks), Rauchtest (neu: Luftbildkachel, Leerkachel, Esri-Schlüssel-Ablehnung), Bildschirmfotos

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
