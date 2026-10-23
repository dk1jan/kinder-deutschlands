# CHANGELOG

Neueste Einträge oben. Format: Datum · was · warum · Module · DB-Migration.

## 2026-10-23 · Rückmeldung an Melder/Einsender, Chat-Schlüssel „frühere Version“ (F-036, F-017, D-082)

**Was**
- F-036: Nach „Erledigt“/„Ablehnen“ einer Orts-Meldung und nach „Freigeben“/„Ablehnen“ eines Ortsvorschlags bekommt das Mitglied eine Mitteilung in der Glocke („Zu deiner Meldung „…“: Danke für deine Meldung – wir haben sie bearbeitet.“, Link zum Ort, wenn er sichtbar ist). Verwaltung → Daten → Prüffälle: drei getrennte, beschriftete Felder – öffentlicher Hinweis am Ort (nur bei Defekt/Gesperrt), interne Notiz, Nachricht an den Melder/Einsender (vorausgefüllt mit dem Dank, frei änderbar, 200 Zeichen). Zuvor ging der eine Text je nach Art intern oder öffentlich, ohne dass man es sah, und der Melder erfuhr nichts.
- F-017: Sicherung aus der Zeit vor D-066 (Wiederherstellungsschlüssel, keine Passwort-Angabe) hat jetzt einen eigenen Zustand „Chat-Sicherung aus einer früheren Version“ (Schlüssel eingeben oder neu beginnen) statt fälschlich „Passwort geändert“. Die rote Meldung „Das Passwort passt nicht“ erscheint nicht mehr, wenn es nach der Eingabe auf einer anderen Karte weitergeht, und verschwindet beim Kartenwechsel.
**Warum** Jan: Mitglieder aktivieren und loben; Chat-Hinweis war verwirrend.
**Module** M24 (Datenzentrale/Prüffälle), M11/M13 (Meldungen und Vorschläge zu Orten), M02 (Chat-Schlüssel) · **DB-Migration** nein (`place_reports.user_id` gab es schon)
**Tests** svelte-check 0 Fehler; Build; 252 Tests grün, 3 übersprungen (neu: DB-Test Melder-Mitteilung mit Standarddank, eigenem Text, Abgelehnt, interne Notiz/öffentlicher Hinweis nicht beim Melder; Vorschlag → Mitteilung; Unit-Tests der Schlüssel-Entscheidung) gegen PostgreSQL 16/PostGIS 3.4. **Nicht gelaufen:** Rauchtest mit Synapse (läuft in der CI vor dem Ausrollen), Browsertest `chatkey-check.py`; die neue Maske und die Karte „frühere Version“ wurden nicht im Browser angesehen.

## 2026-10-23 · Kartenpunkte der Ebenen antippbar (F-035)

**Was** Punkte der Zusatzebenen (Einrichtungen, Termine, Marktplatz, Hilfe) lassen sich auf der Karte antippen – es öffnet sich die Karte mit Name, Art und „Ansehen“; Mauszeiger wird zur Hand. Der Klick war nie angeschlossen (nur über die Liste erreichbar); Kinderwagenrouten waren nicht betroffen.
**Warum** Jan: Symbol der Jugendfarm sichtbar, aber nicht anklickbar.
**Module** M10 Familienkarte · **DB-Migration** nein
**Tests** svelte-check, Build; neuer Browsertest `scripts/karte-klick-check.py` (Computer + Handy, Antippen zeigt „Smoke-Jugendfarm“); Bildschirmfoto angesehen.

## 2026-10-23 · Einrichtungen auf der Familienkarte (F-034)

**Was** Neue Kartenebene **Einrichtungen**: alle geprüften Einrichtungen mit Standort (Familienzentren, Vereine, Kitas, Beratungsstellen …) als eigenes Symbol (Haus, rotbraun), Antippen zeigt Name, Art, Adresse und führt zur Einrichtungsseite; auch in der Liste „im Ausschnitt“. Die Ebene ist für alle sichtbar und standardmäßig eingeschaltet (wer seine Ebenen schon selbst gewählt hat, behält seine Auswahl – dann unter „Ebenen“ zuschalten). Anträge (noch nicht geprüft) erscheinen nicht.
**Warum** Jan: Kinder- und Jugendfarm Bremen angelegt, auf der Karte aber nur der OSM-Spielplatz auf dem Gelände sichtbar – Einrichtungen hatten bisher keine Kartenebene.
**Module** M10 Familienkarte, M12 Einrichtungen · **DB-Migration** nein
**Tests** svelte-check, Build; Rauchtest bestanden (neu: Ebene liefert die geprüfte Einrichtung mit Link, Anträge nicht); Bildschirmfoto der Karte angesehen.

## 2026-10-23 · Einrichtung anlegen: Verwaltung direkt, verständlicher Fehler (F-033)

**Was**
- Wer Einrichtungen prüfen darf (Verwaltung), legt sie jetzt **direkt** an: keine Prüfangaben, kein Häkchen, sofort sichtbar, man ist als Verwalter der Einrichtung eingetragen (Protokoll „org.created_verified“). Mitglieder stellen weiter einen Antrag.
- Antrag für Mitglieder: Das Feld „Wie können wir das prüfen?“ sagt jetzt „Mindestens 10 Zeichen“ und der Browser prüft das vor dem Absenden; „Deine Funktion“ mindestens 3 Zeichen; das Häkchen „Ich darf für diese Einrichtung handeln“ bleibt nach einem Fehler gesetzt.
- Telefon-, Datums- und Zeitfelder haben jetzt dieselbe Gestaltung wie die übrigen Eingabefelder (Telefon war ein kleines Rohfeld).
**Warum** Jan: „ich bekomme immer den Fehler, egal was ich mache“ – Prüfangabe „admin“ (5 Zeichen) war zu kurz, das stand nirgends, und das Häkchen ging nach jedem Fehler verloren.
**Module** M12 Einrichtungen · **DB-Migration** nein
**Tests** svelte-check, Build, Unit/DB-Tests; Rauchtest bestanden (neu: Verwaltung legt Einrichtung direkt an → verifiziert; zu kurze Prüfangabe → Hinweis, Häkchen bleibt).

## 2026-10-23 · 502-Fehler behoben: zu große Antwortköpfe (F-032)

**Was** Die App schickt keine „Link“-Kopfzeile mehr (Liste aller vorzuladenden Skripte, bis ~3 KB). Dieselben Angaben stehen weiterhin als `<link rel="modulepreload">` im HTML-Kopf – Ladezeit unverändert. Antwortköpfe jetzt ~0,9 KB statt ~3,8 KB.
**Warum** Jan: 502 beim Einrichtungs-Antrag und beim Öffnen eines neuen Beitrags. nginx-Log (Plesk `proxy_error_log`): beide Male „upstream sent too big header“ – Link-Kopfzeile + CSP + Sitzungs-Cookie über dem 4-KB-Kopfpuffer von nginx. Kein Absturz der App (Logs, Neustarts 0). Die Vermutung „Ausrollen/Overture-Lauf“ aus F-030 war falsch.
- **Dubletten:** Beim Zusammenführen entstehen keine Verweisketten mehr (drei Orte am selben Punkt ergaben je nach Reihenfolge A → B → C); bestehende Ketten aus dem ersten automatischen Lauf biegt `0016_verweisketten.sql` einmalig auf den endgültigen Ort um. Gefunden, weil der Dubletten-Test in CI je nach Reihenfolge wackelte – Test erzwingt jetzt genau diese Reihenfolge (ohne Korrektur rot, mit grün).
**Module** Querschnitt (Server-Hook), M23/M24 Dubletten · **DB-Migration** ja (`0016_verweisketten.sql`, nur Verweise umbiegen)
**Tests** svelte-check, Build; Nachstellung mit langem Beitrag (Kopf 3.817 → 871 Bytes); 251 Unit/DB-Tests; Migration an künstlicher Kette geprüft; Rauchtest bestanden (neu: Antwortköpfe einer Beitragsseite mit Anmeldung < 2 KB, keine Link-Kopfzeile).

## 2026-10-23 · Startseite: Datenübersicht statt Karte (F-031)

**Was** Der Block „N Familienorte in ganz Deutschland“ steht nicht mehr oben unter dem Kopf. Der ganze Abschnitt „Zuerst der Norden“ (schematische Norddeutschland-Karte und Text) ist entfernt; an seiner Stelle steht jetzt die Datenübersicht in voller Breite.
**Warum** Jan: oben entfernen, unten Karte und Text „Zuerst der Norden“ entfernen, dort die Übersicht hin.
**Module** Startseite · **DB-Migration** nein
**Tests** svelte-check, Build, Bildschirmfoto angesehen; Rauchtest-Prüfung der Startseiten-Übersicht unverändert gültig (läuft in CI).

## 2026-10-23 · Beitrag „Ganz Deutschland“, Oben anheften, „Nachricht schreiben“, Overture im eigenen Prozess (F-030, D-080)

**Was**
- **Community:** Beiträge brauchen kein Thema und keine Region mehr – „Ganz Deutschland“ bzw. das Bundesland reicht (vorher Fehler „Bitte ein Thema, eine Region oder eine Gruppe wählen“).
- **Oben anheften:** Moderation/Verwaltung hat am Beitrag einen eigenen Knopf „Oben anheften“ / „Nicht mehr oben anheften“ (vorher versteckt im Moderations-Menü mit Pflicht-Begründung an die Verfasserin). Keine Mitteilung, nur Protokoll. Angeheftete Beiträge stehen jetzt in jedem Feed ganz oben (vorher nur in Themen/Regionen/Gruppen); angeheftete Beiträge für ganz Deutschland erscheinen auch im Landes-Feed oben. Beim Weiterblättern kommen sie nicht doppelt.
- **Kontaktkarte/QR/ID-Suche:** „Ihr seid verbunden. Nachrichten schreiben könnt ihr ab Bauabschnitt 4.“ ersetzt durch „Ihr seid verbunden.“ + Knopf **Nachricht schreiben** (Chats und Anrufe gibt es längst). Weitere veraltete Bauabschnitt-Hinweise unter Nachrichten entfernt.
- **Overture-Abruf in eigenem Prozess** (`scripts/overture-read.mjs`): Entpacken/Zerlegen der Parquet-Daten lief bisher im Web-Prozess und konnte die App während des Abrufs (erster Lauf 23.10., 10:02–10:07 Uhr, 406 neue Orte) ausbremsen. Jetzt liefert ein Kindprozess nur Kandidaten, die Regeln laufen wie bisher in der App.
**Warum** Jan: Beitrag für Deutschland ließ sich nicht absenden; kein Anheften-Knopf; „Bauabschnitt 4“ beim Schreiben; 502 beim Anlegen einer Einrichtung. Logs: kein Absturz, kein Speicherproblem, Container um 10:21 Uhr durch das Update neu gestartet – 502 vermutlich während des Ausrollens oder während des Overture-Laufs; Einrichtungs-Antrag selbst im Rauchtest fehlerfrei. Server-Log außerdem: 6.891 Dubletten automatisch zusammengeführt, 808 offen.
**Module** M07 Community, M24 Moderation, M01/M02 Kontakte, M23 Datenversorgung · **DB-Migration** nein
**Tests** svelte-check; 251 Unit/DB-Tests (Community-Test angepasst: Beitrag ohne Thema erlaubt; Overture-DB-Test läuft jetzt über den Kindprozess gegen den nachgebauten AWS-Speicher); Rauchtest bestanden (neu: Beitrag „Ganz Deutschland“ ohne Thema, Moderation sieht „Oben anheften“, Mitglied darf nicht anheften, Angehefteter Beitrag ganz oben im Landes-Feed).

## 2026-10-23 · Dubletten automatisch, Datenübersicht auf der Startseite, GPS-Routen raus, nur „Familie“ (F-029, D-079)

**Was**
- **Dubletten selbst zusammenführen:** Eindeutige Fälle erledigt die App jetzt ohne Klick – direkt nach jedem Abruf und einmal täglich (also auch die 12.722 vorhandenen, kurz nach dem Ausrollen). Eindeutig = beide aus Importen (nichts von Mitgliedern/Redaktion Bestätigtes), gleiche Art, ≤ 30 m, und Namen passen: beide ohne Namen, gleich/ähnlich benannt, oder einer ohne Namen bei ≤ 15 m. Behalten wird der Ort mit mehr Angaben (Name, Fläche, Merkmale), sonst der ältere. Verschieden benannte Orte und bereits als „verschieden“ entschiedene Paare bleiben zur Prüfung. Nichts wird gelöscht (Status „zusammengeführt“, Verweis), Protokolleintrag „automatisch“.
- Beim Zusammenführen (auch von Hand) ziehen jetzt auch Bewertungen, Bilder, Beiträge, Einrichtungen, Termine, Angebote, Hinweise und Einladungen mit um (vorher nur Quellen, Merkliste, Meldungen, Hinweise).
- **Startseite:** neue Übersicht „N Familienorte in ganz Deutschland.“ mit Spielplätzen, Toiletten/Wickel-/Stillorten, Indoorspielplätzen, Ausflugsorten/Bädern, Bibliotheken/Familienzentren/-cafés – echte Zählung (10 Min. zwischengespeichert), Quellen und Stand des letzten Abgleichs, Links zu Karte und Datenquellen.
- **Kinderwagenrouten:** GPS-Aufzeichnung wieder entfernt (F-027 zurückgenommen), nur noch Einzeichnen wie vorher. Satz im Datenschutz-Entwurf entfernt. Die Kartenkorrektur aus F-027 (Mini-Karte zeigt Linie und Punkte) bleibt.
- **Familie statt „Partnerschaft & Familie“:** Seite, Kachel, QR-/Kontaktkarten-Link und Sichtbarkeitsfeld heißen nur noch „Familie“, keine Auswahl mehr. Bestehende Verbindungen „Partnerschaft“ werden als „Familie“ angezeigt (keine DB-Änderung).
**Warum** Jan: 5–10 Dubletten nachgesehen, „sind immer die selben … kannst du die nicht selber prüfen?“; „GPS wieder raus, das ist Müll“; „auf der Startseite eine kleine Übersicht, wie viele Daten wir aktuell haben“; „Partnerschaft & Familie – Familie reicht, sonst fragt man sich, was ist was“.
**Module** M23/M24 Daten (Dubletten), Startseite, M14 Kinderwagenrouten, M01 Profil/Familie · **DB-Migration** nein
**Tests** svelte-check; 251 Unit/DB-Tests (neu `dubletten.db.test.ts`: drei Toiletten am selben Punkt → eine bleibt, die mit Wickeltisch; verschieden benannte Spielplätze bleiben; ohne Namen 5 m zusammen, 25 m nicht; von Mitgliedern bestätigt nie automatisch; „verschieden“ bleibt; Bewertung und Merkliste ziehen um; Protokoll; zweiter Lauf ändert nichts; GPS-Tests entfernt); Lastprobe 12.000 Zusammenführungen in 76 s; Rauchtest bestanden (neu: Startseiten-Übersicht, Route ohne GPS, Familie ohne Partnerschaft); Barrierefreiheit ohne schwere Verstöße; Bildschirmfotos angesehen.

## 2026-10-23 · Overture als zweite Ortsquelle, Datenzentrale ohne Knopfdruck (F-028, D-078)

**Was**
- **Neue Quelle Overture Maps Places** (ganz Deutschland, wöchentlich geprüft, Overture erscheint etwa monatlich): Firmeneinträge u. a. von Meta und Microsoft, keine OSM-Daten – genau die kommerziellen Indoorspielplätze, die OSM fehlen (Stichprobe Bremen: Leo's Abenteuerpark, Bremer Abenteuerland, Erlebniswelt Kiddo, Spiel Coolisse, JUMP House, Indoorspielplatz Neustadt). Übernommen werden nur **Indoorspielplätze/Trampolinhallen, Kindermuseen, Kinderbauernhöfe**; Zoos, Spielplätze, Bäder nicht (OSM besser, Overture dort teils falsch verortet).
- **Strenge Regeln**, weil die Overture-Kategorien unzuverlässig sind: Zuverlässigkeit ab 0,8 (eindeutiger Name „Indoorspielplatz“ o. ä. ab 0,7); bei „Freizeitpark“/„Kinderfreizeit“ muss der Name ein Kinderwort enthalten; Vereine, Märkte/Volksfeste, Spielhallen (Glücksspiel), Spielplätze draußen, Unterkünfte, IKEA-Småland u. a. fliegen über den Namen raus; nur geöffnete Orte in Deutschland.
- **Nichts doppelt:** Gibt es den Ort schon (OSM, Mitglieder, Redaktion) – gleiche Art bis 60 m oder ähnlicher Name bis 200 m –, wird er nicht angelegt. Quellenangabe an jedem Ort und auf „Datenquellen“.
- **Abruf ohne Zusatzprogramm:** Die Parquet-Dateien liegen öffentlich bei AWS; gelesen werden per HTTP-Teilabruf nur die Zeilengruppen, die Deutschland berühren, und nur die nötigen Spalten (Bibliothek `hyparquet`, reines JavaScript). Ergebnis je Overture-Ausgabe zwischengespeichert (`/data/tiles/overture/`, wenige MB) – der wöchentliche Lauf lädt nur bei neuer Ausgabe.
- **„Gibt es nicht mehr“** bei einem Ort, der nur aus Overture stammt → sofort ausgeblendet bis zur Prüfung (wer gemeldet hat, sieht den Ort weiter mit Hinweis). Redaktion „abgelehnt“ → wieder sichtbar; „erledigt“ → archiviert und gesperrt, der nächste Abruf holt ihn nicht zurück. OSM-Orte bleiben wie bisher sichtbar. Ausgeblendete Orte zählen nicht als „Vorschläge von Mitgliedern“.
- **Datenzentrale vereinfacht:** oben ein Satz „Alles läuft automatisch. Du musst nichts abrufen.“ (bzw. „Bei einer Quelle hakt es – wird automatisch erneut versucht“), Orte sichtbar, letzter Abgleich, was gerade läuft, was noch nie lief („startet von selbst“). Die Quellentabelle mit „Jetzt abrufen“/„Pausieren“ ist unter „Quellen und Abrufe – Technik“ eingeklappt (klappt bei Fehler/Freigabe selbst auf). Der Zeitplan nimmt noch nie gelaufene Quellen zuerst.
- „Ort fehlt? Vorschlagen“ auf der Karte gab es schon – bleibt der Weg für Lücken.
**Warum** Jan: Leo's Abenteuerpark fehlt; „warum muss ich das abrufen … gibt es nicht eine bessere Lösung“. spielplatztreff.de verbietet Crawler (Nutzungsbedingungen 4.3), mamilade.de hat keine Lizenz – beide nicht genutzt, Jan wollte keine Anfrage. Overture-Stichprobe von Jan auf dem Server (DuckDB) bestätigt Treffer und Grenzen.
**Module** M23 Datenversorgung, M24 Datenzentrale, M10 Karte/Orte (Meldung) · **DB-Migration** ja (`0015_overture.sql`: neue Quelle)
**Tests** svelte-check; 254 Unit/DB-Tests (neu `overture.unit.test.ts`: 20 Unsinn-Fälle aus Jans Stichprobe weg, alle echten Treffer drin, geschlossen/Ausland/Paris weg, Adresse/Webseite, Namensvergleich, nur Deutschland-Zeilengruppen gelesen, HTTP-Teilabruf, neueste Ausgabe; neu `overture.db.test.ts`: kompletter Lauf gegen lokalen Nachbau des AWS-Speichers – 8 Orte, „Abenteuerland“ aus OSM nicht doppelt, Meldung blendet aus, abgelehnt/erledigt, nächster Lauf aus Zwischenspeicher ohne Download und ohne Wiederbelebung, OSM-Ort bleibt sichtbar); Rauchtest bestanden (neu: Zustand auf einen Blick); Barrierefreiheit (neu mit Datenzentrale) ohne schwere Verstöße; Bildschirmfoto angesehen. Testdatei `tests/fixtures/overture-places.parquet` aus `scripts/overture-fixture.py`. **Nicht getestet:** echter Abruf bei AWS (aus der Arbeitsumgebung gesperrt) – Dauer und Anzahl für ganz Deutschland erst nach dem ersten Lauf auf dem Server bekannt.

## 2026-10-22 · Kinderwagenroute per GPS aufzeichnen (F-027, D-077)

**Was**
- „Route einreichen“ hat zwei Wege: **Einzeichnen** (wie bisher) oder **Per GPS aufzeichnen**. Aufzeichnung mit Start, Pause/Weiter, Beenden, Verwerfen; Anzeige von Zeit, Kilometern, GPS-Genauigkeit und der Linie auf der Karte; Bildschirm bleibt an (Wake Lock). War die Seite im Hintergrund, wird die Lücke angezeigt.
- **Prüfschritt:** Karte mit „Start“ und „Ziel“, Regler „Anfang kürzen“ / „Ende kürzen“ (Standard **50 m**, 0–200 m), Länge aktualisiert sich sofort; „Im Einzeichnen weiter bearbeiten“ übernimmt die Linie zum Ergänzen.
- **Schutz:** Aufzeichnung nur auf dem Gerät bis zum Absenden; ungenaue Punkte (> 35 m) und Zittern (< 5 m) verworfen; erst glätten, dann entlang des Wegs kürzen (sonst wären 50 m wegen GPS-Zickzack in Wahrheit weniger); gespeichert nur die vereinfachte Linie (≤ 480 Punkte), keine Uhrzeiten, kein Tempo. Bestätigung „öffentliche Orte“ und Redaktionsprüfung bleiben. Datenschutz-Entwurf ergänzt.
- **Fehler unterwegs gefunden und behoben:** Die neue Seite stürzte beim Laden auf dem Server ab (Aufräumfunktion griff auf `document` zu) – deshalb prüft der Rauchtest die Seite jetzt; Mini-Karten mit Linie und Punkten zeigen jetzt beides (vorher konnte das Ziel aus dem Bild rutschen); kurze GPS-Aussetzer melden keinen Fehler mehr.
**Warum** Jan: „kann man das nicht auch über GPS aufzeichnen“; Enden kürzen: „150 m schon sehr viel … 10 m?“ → 50 m Standard, einstellbar.
**Module** M14 Kinderwagenrouten, M10 Karte (Mini-Karte), Querschnitt (Datenschutz-Entwurf) · **DB-Migration** nein
**Tests** svelte-check; 244 Unit/DB-Tests (neu `record.unit.test.ts`: Länge/Abstand, Kürzen 50/0/200 m, zu kurz, Vereinfachen mit Ecken, 8-km-Schlangenlinie mit GPS-Zittern ≤ 480 Punkte bei < 5 % Längenfehler, neuer Start nicht näher an der Haustür, GPS-Filter); Rauchtest 332 Prüfungen (neu: Seite lädt mit beiden Wegen); **neuer Browsertest `scripts/route-gps-check.py`** (simulierter 600-m-Spaziergang: Hinweis, Pause mit Abstecher, laufende Anzeige, Regler 50/0 m, Einreichen, in der Datenbank Start/Ende exakt 50 m vom echten Anfang/Ende, 500 m Länge, Abstecher nicht drin, keine Zeitspalten, Verwerfen, ungenaues GPS verworfen – 12 Prüfungen); Barrierefreiheit ohne schwere Verstöße; Bildschirmfotos angesehen. **Nicht getestet:** echtes Handy draußen (GPS-Qualität, Wake Lock je Browser).

## 2026-10-22 · Live-Standort im Chat überarbeitet (F-025)

**Was**
- Keine Karte mehr über dem Chatverlauf. „N live“ in der Kopfzeile öffnet eine **Vollbild-Karte**: Namen direkt an den Punkten („Du“, „Dora“), Personen als Knöpfe unten mit Restzeit (antippen → hinfahren), „Alle zeigen“, Plus/Minus-Knöpfe auch am Handy, Verschieben mit einem Finger, Zoomen mit zwei Fingern; Esc/✕ schließt.
- **Fehler behoben:** Die Karte sprang bei jeder Aktualisierung (sekündlich) zurück auf die Live-Positionen – Verschieben und Zoomen war dadurch unmöglich (vermutlich auch Ursache der grauen, nicht geladenen Fläche). Der Ausschnitt wird jetzt nur angepasst, wenn Personen dazukommen/gehen oder auf „Alle zeigen“.
- Hinweis beim eigenen Teilen einzeilig: „● Du teilst live · noch 30 Min. [Stoppen]“ (Erklärung „nur solange die Seite offen ist“ im Titel/für Screenreader). Eigene Restzeit überall gleich (aus dem laufenden Teilen), Restzeit gerundet statt aufgerundet („31 Min.“ direkt nach dem Start behoben).
**Warum** Jan (Handy-Screenshot): Seite überladen, Karte nicht bedienbar, bei mehreren Personen sieht man nichts.
**Module** M06 Chat/Treffen, M03 Karte (Mini-Karte) · **DB-Migration** nein
**Tests** svelte-check; Unit-Tests Restzeit; Rauchtest; **neuer Browsertest `scripts/live-check.py`** (2 Chromium-Handys, echter Chat-Server, künstliche Standorte: 15 Prüfungen – Hinweis einzeilig mit 30 Min., „2 live“, Verlauf bleibt groß, Vollbild, Namen, Plus-Knopf zoomt, Verschieben, kein Zurückspringen nach 4 s Live-Aktualisierung, Name antippen fährt hin, Esc/Schließen, Stoppen → „1 live“); Bildschirmfotos angesehen. **Nicht getestet:** Zwei-Finger-Zoom auf echtem Handy (im Test nicht nachstellbar).

## 2026-10-22 · Wimpel zum Ausdrucken neu gestaltet (F-024)

**Was** Der gedruckte Wimpel ist neu aufgebaut: längeres Dreieck (600 × 900), alles im breiten oberen Teil (vorher ragten Familien-ID und Text über die Schrägen), dunkles Kopfband mit Marke und zwei Lochpunkten für die Schnur, „Hallo!“ groß, Familien-ID als dunkles Feld über dem QR-Code, QR ca. 6 cm breit in weißem Feld, Schnittlinie mit Abstand außen. Genau eine A4-Seite (172 mm breit, Hinweis nur am Bildschirm), Farben werden mitgedruckt. QR jetzt als eingebettetes SVG statt `foreignObject` (druckt in allen Browsern).
**Warum** Jan: „Wimpel drucken ist Mist … Code und Schrift passen nicht in den Wimpel … das muss schick werden.“
**Module** M01 Familien-ID/QR · **DB-Migration** nein
**Tests** svelte-check; Rauchtest 331 Prüfungen (neu: Druckseite mit QR, Familien-ID, ohne foreignObject); Bildschirmfoto und PDF (Druckansicht, 1 Seite A4) angesehen; QR mit OpenCV aus Bildschirmbild, Druck-PDF (150 dpi) und verkleinerter Fassung erfolgreich gelesen. **Nicht getestet:** echter Drucker/Laminiergerät.

## 2026-10-21 · Community nach „Ganz Deutschland“ und Bundesland, Einladung je Beitrag (F-023, D-076)

**Was**
- Community oben mit zwei Bereichen: **[eigenes Bundesland]** (Standard, aus der Wohnregion im Profil) und **Ganz Deutschland**; Ansichten (Für dich, Neu, Gelöst, Gemerkt), Themen und Suche gelten jeweils im gewählten Bereich. Ohne Wohnregion: nur „Ganz Deutschland“ mit Hinweis aufs Profil.
- Beim Schreiben: **„Wer soll das lesen?“** – „Nur [Land]“ (vorausgewählt) oder „Ganz Deutschland“; gewählte Region muss im eigenen Land liegen. Landes-Beiträge sind für alle anderen unsichtbar (Feed, Suche, direkter Link, Antworten, Merken, Bilder).
- **Einladen:** Unter einem Landes-Beitrag „Familien-ID … Einladen“. Die Person bekommt eine Mitteilung und kann genau diesen Beitrag lesen und beantworten; er erscheint bei ihr im Bereich „Ganz Deutschland“ mit „Eingeladen · Bremen“. Höchstens 20 Einladungen am Tag; Blockierungen verhindern die Einladung (gleiche Meldung wie „unbekannt“). Die Verfasserin sieht, wer eingeladen ist und von wem, und kann zurücknehmen.
- **Bundesland wechseln** höchstens einmal in 30 Tagen (Profil → Wohnregion); innerhalb des Landes jederzeit.
- Marke „Nur Bremen“ / „Eingeladen · Bremen“ an Beitragskarte und Beitrag. Datenschutz-Entwurf ergänzt. Nebenbei behoben: Bilder-Feld der Schreibseite ohne Beschriftung für Screenreader (axe, kritisch).
**Warum** Jan: lokale Themen besprechen, die „eine aus Bayern nicht lesen muss“, aber Einzelne gezielt einladen können.
**Module** M03 Regionale Community, M02 Profil, Querschnitt (Datenschutz-Entwurf, Barrierefreiheit) · **DB-Migration** ja (`0014_community_land.sql`: `posts.land_code`, `post_invites`, `user_profiles.land_changed_at`, Funktion `kd_land_of`)
**Tests** svelte-check 0 Fehler; 239 Unit/DB-Tests (neu `community-land.db.test.ts`, 8 Tests: Land aus Stadtteil, Lesen nur gleiches Land, ohne Wohnregion/falsche Region abgelehnt, Antworten/Merken gesperrt, Feeds je Bereich, Suche findet Fremdes nicht, Einladung mit Mitteilung + Antworten + nur dieser Beitrag, Regeln schon lesbar/unbekannt/blockiert/Deutschland-Beitrag/nicht lesbar/Tageslimit, Zurücknehmen, Landwechsel 1×/Monat, alte Beiträge sichtbar); Rauchtest 330 Prüfungen; Bildschirmfotos Computer + Handy (Community, Schreiben, Beitrag mit Einladen) angesehen und Marke korrigiert; Barrierefreiheit `a11y-check.py` (jetzt mit Schreibseite): keine schweren Verstöße; Build. **Nicht getestet:** mit echten Mitgliedern auf dem Server.

## 2026-10-21 · Korrektur: Web-Container 6 GB Arbeitsspeicher für osmium (F-022)

**Was** Download des Auszugs klappte (4,87 GB, Prüfsumme ok), aber `osmium tags-filter` wurde zweimal vom Speicherlimit des Containers beendet (`Memory cgroup out of memory: Killed process … (osmium)` bei ~2 GB; Server: 31 GB, 14 GB frei). `mem_limit` des Web-Containers 2 GB → 6 GB (Node bleibt bei 1,5 GB). Fehlermeldung bei vom System beendeten Programmen jetzt verständlich („abgebrochen (SIGKILL – vermutlich zu wenig Arbeitsspeicher im Container)“ statt „Fehlercode null“).
**Warum** Live-Befund per SSH (dmesg, Laufprotokoll).
**Module** M23, M24 Betrieb · **DB-Migration** nein
**Tests** svelte-check, Unit-Tests Auszug/Orte, CI-Stack-Test. **Nicht getestet:** tatsächlicher Speicherbedarf von osmium für ganz Deutschland – zeigt der nächste Lauf.

## 2026-10-21 · Korrektur: OSM-Auszug mit Prüfsumme des datierten Stands (F-022)

**Was** Erster Lauf auf dem Server scheiterte mit „download.geofabrik.de: HTTP 404“: Geofabrik bietet für `germany-latest.osm.pbf` keine `.md5` an, nur für datierte Stände (`germany-261019.osm.pbf.md5`). Jetzt: erst `latest.md5` versuchen, sonst den neuesten datierten Stand der letzten 14 Tage samt Prüfsumme laden.
**Warum** Live-Fehler in Verwaltung → Daten (Screenshot Jan).
**Module** M23 · **DB-Migration** nein
**Tests** 2 neue Tests (Geofabrik-Verhalten nachgestellt: latest ohne .md5 → datierter Stand von vor 2 Tagen; nichts gefunden → Fehlermeldung), alle 231 Tests, Build. **Nicht getestet:** echte Geofabrik-Datei (aus der Arbeitsumgebung gesperrt).

## 2026-10-21 · Orte aus dem Deutschland-Auszug statt Overpass (F-022, D-075) + Indoorspielplätze breiter (F-021)

**Was**
- **F-022:** Die Orte-Quellen holen OpenStreetMap-Daten jetzt aus dem Deutschland-Auszug von Geofabrik: wöchentlich laden (~4,5 GB, MD5-Prüfung, Platzprüfung ≥ 12 GB frei, alte Datei bleibt bei Fehlern stehen), einmal mit `osmium tags-filter` alle benötigten Merkmale filtern, als GeoJSON-Zeilen exportieren; jede Quelle liest daraus nur ihre Auswahl (dieselben Regeln wie die Overpass-Abfragen). Overpass nur noch Rückfall; Schalter `OSM_SOURCE`. osmium wird im Docker-Build aus dem Quellcode gebaut (Commits fest geprüft); Stack-Test prüft osmium im Container.
- **F-021 Weg 1:** Indoorspielplätze zusätzlich als Spielplatz mit `indoor=yes`, Trampolinhallen (`leisure=trampoline_park`) und über typische Namen (Indoorspielplatz, Spielparadies, Kinderland, Tobeland, Kinderwelt, Spielscheune …) – nur an Freizeit-/Ausflugsobjekten, nie an Kitas, Schulen, Geschäften oder Haltestellen. Solche Spielplätze erscheinen nicht mehr zusätzlich als Außenspielplatz.
**Warum** Overpass am 21.10. überlastet („for automated or high-volume use, run a local Overpass API instance“), Zeitüberschreitungen bei Spielplätzen/Toiletten; Jan: „grade indoor haben wir noch nix“.
**Module** M23 Datenversorgung, M24 Betrieb · **DB-Migration** nein
**Tests** svelte-check 0 Fehler; 229 Unit/DB-Tests (neu `osmfile.unit.test.ts`: Mini-Auszug mit echtem osmium über lokalen HTTP-Server mit MD5 – ein Download für alle Quellen, jede Quelle genau ihre Orte, Spielplatzfläche mit Spielgerät, Relation mit Mittelpunkt, veraltete Datei neu, falsche Prüfsumme bricht ab und lässt alte Datei stehen; Auswahlregeln Indoor inkl. Ausschlüsse; Umwandlung Knoten/Weg/Relation); Rauchtest 330 Prüfungen (Overpass-Weg); CI installiert osmium für die Tests; Build. **Nicht getestet:** Docker-Build von osmium (lokal nicht erlaubt, läuft in der CI), echter 4,5-GB-Auszug und Laufzeit auf dem Server.

## 2026-10-21 · Mehr Kartendaten: neue Ortsarten aus OpenStreetMap (F-018, D-074)

**Was**
- Neue Quellen für ganz Deutschland (je 16 Länder, wöchentlich, gestaffelt 15–45 Min nach dem Ausrollen): **Familiencafés** (Cafés, Restaurants, Eiscafés mit Spielecke – `kids_area`), **Stillmöglichkeiten** (`baby_feeding` yes/room), **Bibliotheken** (`amenity=library`, ohne Hochschul-/Instituts-/Archivbibliotheken), **Familienzentren** (`community_centre=family_centre`).
- „Zoos, Freizeitparks, Bäder“ holt zusätzlich **Minigolf** und **Kletterhallen** (als Ausflugsort mit Art); Kletterhallen landen nicht mehr fälschlich bei Bädern.
- Neue Arten **Bibliothek** und **Familienzentrum** mit eigenem Kartensymbol (Buch, Haus mit Herz) und Filter auf der Karte; Filter „Familiencafés“ heißt jetzt „Cafés & Stillen“. Neue Merkmale: Spielecke, Hochstuhl, eigener Stillraum (dreiwertig, „unbekannt“ bleibt ehrlich unbekannt).
- Google Maps verworfen (Nutzungsbedingungen, REQUIREMENTS, Quelle/Lizenz je Ort).
**Warum** Jan: „wir brauchen jetzt Daten für die Karte“.
**Module** M23 Datenversorgung, M03 Karte · **DB-Migration** ja (`0013_ortsarten.sql`: Ortsarten erweitert, 4 Quellen, Name der Ausflugsquelle)
**Tests** svelte-check 0 Fehler; 224 Unit/DB-Tests (neu: Abfragen und Übersetzung für Familiencafé, Stillen, Bibliothek inkl. Ausschluss Hochschule/Institut, Familienzentrum, Minigolf/Kletterhalle/Schwimmhalle; Quellenkatalog 13); Rauchtest 330 Prüfungen (neu: Kartenfilter, 4 Quellen mit 16 Ländern, Ortsseite einer Bibliothek); Symbole gerendert und angesehen; Build. **Nicht getestet:** echte Overpass-Abfragen (aus der Arbeitsumgebung nicht erreichbar) – Anzahl und Qualität zeigt der erste Lauf auf dem Server.

## 2026-10-21 · Übernahme großer Abrufe in Sekunden statt Stunden (F-019) + IPv4-Rückfall bei DNS (F-020)

**Was**
- **F-019:** Der Spielplatz-Abruf für ganz Deutschland (119.887 gelesen, 104.040 neu) hing live über 7,5 Stunden in der Dublettenprüfung und blockierte alle anderen Abrufe. Ursache: der Abstandsvergleich in Metern (`geography`) nutzt den Kartenindex nicht → jeder neue Ort gegen alle. Jetzt: erst grober Vorfilter über den Index (0,0005°, deckt 30 m in ganz Deutschland ab), dann genaue Prüfung in Metern; vor Regionen-Zuordnung und Dublettenprüfung wird bei mehr als 1.000 neuen Orten die Statistik aufgefrischt (sonst wählt die Datenbank innerhalb der Übernahme einen schlechten Plan); neue Orte werden in Paketen zu 1.000 angelegt statt mit zwei Anweisungen je Ort. Ergebnis gleich (Dubletten bis 30 m, Flächen, Herkunft), Ablauf weiter in einer Transaktion.
- **F-020:** VG250 seit 19.10. nicht abrufbar: Der Namensserver antwortet für `sgx.geodatenzentrum.de` auf die IPv6-Anfrage mit SERVFAIL, im Container scheitert dadurch die ganze Auflösung (`EAI_AGAIN`), obwohl die IPv4-Adresse da ist. Abrufe (VG250, Kachel-Builds, Overpass) versuchen es dann sofort noch einmal nur über IPv4.
**Warum** Live-Befund in der Datenzentrale (Spielplätze „läuft“, Bestand 15.039 trotz 104.040 neuen; VG250 „DNS vorübergehend nicht erreichbar“), Diagnose per SSH mit Jan.
**Module** M23 Datenversorgung · **DB-Migration** nein
**Tests** svelte-check 0 Fehler; 219 Unit/DB-Tests (neu `import-mass.db.test.ts`: 6.005 Orte inkl. Fläche, 3 Dubletten erkannt, 1 knapp außerhalb nicht, Felder vollständig, zweiter Lauf ohne Änderung; Abfrageplan nutzt `places_location_idx`; neu `net.unit.test.ts`: IPv4-Abruf mit Status/Kopfzeilen/POST/Fehlern, Rückfall nur bei `EAI_AGAIN`, ohne Wartezeit); Messung 110.000 Orte: Abgleich 1 s, Zwischenspeicher 2,6 s, Übernahme 15 s (alte Dublettenprüfung: 600 Orte gegen 6.000 bereits 7,2 s); Rauchtest 327 Prüfungen; Build. **Nicht getestet:** echter BKG-Server und echte OSM-Daten (Flächen sind aufwendiger als Punkte) – zeigt der nächste Lauf auf dem Server.

## 2026-10-20 · Menü mit Gruppen, Startseite mit Kopf zuerst (F-016, D-073)

**Was**
- **Menü am Computer:** Entdecken ▾ · Karte · Community ▾ · Nachrichten · Wissen ▾. Klick auf „Entdecken“ = Startseite, auf „Community“ = Community-Seite; Pfeil daneben oder Maus darüber klappt die Bereiche auf (Symbol, Name, eine Zeile Text). Kein Punkt „Startseite“. „Wissen“ klappt nur auf. Esc schließt und gibt den Fokus zurück, Klick daneben schließt, Klick auf einen Eintrag schließt. Aktive Gruppe mit Wimpel markiert.
- **Menü am Handy:** Leiste Entdecken · Karte · Community · Nachrichten · **Menü**. „Menü“ öffnet ein Blatt von unten mit allen Gruppen, Konto und Rechtstexten; schließt mit Esc, ✕, Tippen daneben oder Wischen nach unten. Ohne JavaScript führt es zur Seite `/mehr` (jetzt nach Gruppen).
- **Startseite:** große Kacheln oben entfernt; für alle zuerst der Kopf „Eltern finden Eltern.“, darunter wie bisher, dann **„Was es hier alles gibt“** mit den Kacheln nach Gruppen. Gäste: Mitgliederbereiche mit Schloss bzw. „mit Anmeldung“, Link zur Anmeldung.
- Bereichsliste bleibt an einer Stelle (`lib/areas.ts`, jetzt mit Gruppe); Menü, Handy-Blatt, `/mehr` und Übersicht lesen daraus.
**Warum** Jan: „die großen Kacheln … haben da nichts zu suchen … alles ins Menü“; Startseite soll zuerst den Kopf zeigen.
**Module** Querschnitt (Navigation/Oberfläche, Barrierefreiheit) · **DB-Migration** nein
**Tests** svelte-check 0 Fehler; 211 Unit/DB-Tests (neu `areas.unit.test.ts`: Gruppen vollständig, kein Punkt „Startseite“, Zuordnung der Pfade, Anmeldelinks); Rauchtest 327 Prüfungen mit echtem Synapse und LiveKit (neu: drei Aufklapper, Kopf vor Übersicht für Gast und Mitglied, Handy-Blatt, `/mehr` nach Gruppen); **neuer Browsertest `scripts/menu-check.py`** (30 Prüfungen, Chromium 1280 px und 390 px: Pfeil, Tastatur, Esc + Fokus, Maus darüber/weg, Klick daneben, Wissen, Navigation, Handy-Blatt öffnen/schließen auf vier Wegen inkl. Wischen, Schloss für Gäste, ohne JavaScript) – dabei zwei Fehler gefunden und behoben (Klick nach Darüberfahren klappte sofort wieder zu; Blatt öffnete 29 px heruntergescrollt, Wischen griff nicht); Barrierefreiheit `a11y-check.py` jetzt auch mit offenem Menü/Blatt: keine schweren Verstöße; Bildschirmfotos geprüft; Build. **Nicht getestet:** echtes Handy (Wischen mit dem Finger, nur simuliert), Screenreader.

## 2026-10-20 · Gruppenanrufe „wie Zoom“ (D-072) + Volumes beschreibbar

**Was**
- **Gruppenanrufe** in Gruppen und Treffen: Knöpfe „Gruppenanruf (Ton/Video)“ im Kopf der Unterhaltung; läuft einer, zeigt der Chat „Gruppenanruf läuft · N dabei · Beitreten / Mit Video“, im Verlauf steht „… hat einen Gruppenanruf gestartet“ (verschlüsselt, löst die normale Benachrichtigung aus). Anruf-Fenster mit Kacheln aller Teilnehmenden, gelbem Rahmen für Sprechende, Stumm-Anzeige, Stumm/Kamera/Kamera wechseln/Bildschirm teilen (Computer), Verkleinern (Chat bleibt nutzbar, Ton läuft weiter), Auflegen. Bis 25 Personen.
- **Medienserver LiveKit** (neuer Container `livekit`, v1.13.7) – Bild und Ton zusätzlich Ende-zu-Ende-verschlüsselt. Schlüssel entsteht im Browser der startenden Person und geht nur per Olm an Geräte von Mitgliedern, die gerade im Anruf sind (mit Nachfrage, falls er nicht ankommt). App stellt Beitritts-Token nur für Mitglieder mit eigenem, angemeldetem Gerät aus (`/api/anruf`), nicht für eingeschränkte Konten, nicht im Direktchat (dort bleibt der 1:1-Anruf). Signalweg über die App (`/livekit/rtc`, eigener Start `scripts/server.mjs`), Verwaltung des Medienservers nur intern. Treffen beendet → Anruf beendet. Datenschutz-Entwurf um Gruppenanrufe ergänzt.
- **Umzug-Skript repariert:** `umzug.sh export` brach ab, sobald die letzte Umgebungsvariable des Containers nicht zur Schlüsselliste gehörte (Schleife endete mit Status 1 unter `set -e`/`pipefail`). Filter jetzt per `grep`. Gefunden vom Stack-Test (CI, „Umzug: Export“).
- **Neuer Dienst `init`:** macht die Volumes `media` und `backups` beim Start für die App beschreibbar. Gefunden durch den Stack-Test des Sammel-Updates (schlug fehl, weil ein neu angelegtes Volume je nach Startreihenfolge nur für root beschreibbar war → Bild-Uploads/Sicherung vor Migration wären gescheitert).
**Warum** Jan: „Gruppenanrufe ja wie z.b. zoom“; Stack-Test-Fehler vom Sammel-Update.
**Module** M02, M24 (Betrieb), Querschnitt (Datenschutz-Entwurf) · **DB-Migration** nein
**Tests** svelte-check 0 Fehler; 207 Unit/DB-Tests (neu: LiveKit-Konfiguration, öffentliche Adresse, Token/Raumname); Rauchtest 322 Prüfungen mit echtem Synapse **und echtem LiveKit** (neu: Token nur für Mitglieder/eigenes Gerät, kein Direktchat, gleicher Anruf für zweites Mitglied, Token über `/livekit/rtc` angenommen, verfälschtes abgelehnt, Verwaltung nicht erreichbar); **Browsertest `groupcall-check.py`** mit drei Browsern: Gruppe anlegen, Video-Anruf starten, Beitreten per Hinweis, alle drei Kacheln, entschlüsseltes Bild und hörbarer Ton bei allen, Medienserver meldet alle Spuren verschlüsselt, Stumm-Anzeige, Verkleinern, Verlassen und erneut Beitreten – 4 Läufe hintereinander bestanden (vorher Zustellung des Schlüssels im ausgelasteten Testrechner teils > 25 s: Wartezeit jetzt 60 s mit Nachfrage alle paar Sekunden); 1:1-Anruftest; Barrierefreiheit; Build. Stack-Test (CI) prüft Container, Volumes, Signalweg. **Nicht getestet:** echte Handys über Mobilfunk/TURN (nur auf dem Server möglich), Bildschirm teilen (im Testbrowser nicht automatisierbar).

## 2026-10-20 · Sammel-Update F-001 bis F-015 + Stadtteile Niedersachsen

**Was**
- **F-001/F-002 Navigation (D-069):** Leiste Entdecken · Karte · Community · Nachrichten · **Mehr**; „Profil“ entfällt (oben bleibt „Mein Konto“). „Mehr“ (`/mehr`) zeigt alle Bereiche als Kacheln plus Konto/Rechtstexte. Entdecken zeigt die Bereiche als große Kacheln – für Mitglieder ganz oben, für Gäste unter der Einleitung (Mitgliederbereiche führen zur Anmeldung).
- **F-003 Glocke:** zählt neue Mitteilungen **und** Unterhaltungen mit ungelesenen Nachrichten (nur Anzahl, aus dem Gerät; stumm geschaltete zählen nicht). Zähler zusätzlich am Reiter „Nachrichten“, Hinweis mit Link in den Mitteilungen.
- **F-004 Chat-Schlüssel aus dem Passwort (D-066):** kein Wiederherstellungscode mehr. Anmeldung mit Passwort → im Browser wird ein Geheimnis abgeleitet → der Chat richtet die verschlüsselte Sicherung damit ein bzw. entsperrt neue Geräte selbst. Passkey/ohne JavaScript: einmal Passwort im Chat eingeben. Passwort ändern unter Sicherheit: Sicherung wird neu verpackt. Passwort zurückgesetzt: das nächste freigeschaltete Gerät verpackt neu; ist keins online, „vorheriges Passwort“ eingeben oder „Neu beginnen“. Alter Wiederherstellungsschlüssel bleibt als Übergang nutzbar. Abmelden löscht das Geheimnis im Browser. Passwortregel zusätzlich: offensichtliche Muster abgelehnt. Chat-Kennung als Salz über `/api/chat/salz` (auch im 2FA-Zwischenschritt).
- **F-005 Ortsseite:** Kasten „Mitmachen“ oben (Bewerten, Foto hochladen, Infos ergänzen – öffnen das jeweilige Formular), „Quelle und Aktualität“ ganz unten; neue Meldeart „Ich kann etwas ergänzen“.
- **F-006 E-Mail für niemanden sichtbar (D-060):** Verwaltung (Nutzer, Rechte, Protokoll, Freigaben, Einrichtungsanträge, Kopfzeile), zweite Freigabe und Partnerlink-Prüfvermerk zeigen nur die Familien-ID; alte Vermerke per Migration umgestellt. Mitglied sieht die eigene Adresse unter Sicherheit und ändert sie selbst (Passwort + Bestätigungslink an die neue Adresse, Hinweis an die alte; ob eine Adresse vergeben ist, wird nicht verraten).
- **F-007 Nachricht der Verwaltung:** Verwaltung → Nutzer „Nachricht an ein Mitglied“ über die Familien-ID und im Moderationsfall „Nachricht an die Person“ – als Mitteilung in der Glocke, ohne E-Mail; Protokoll mit Länge, nicht Text.
- **F-008 Partnerschaft & Familie (D-070):** `/profil/familie` – verbinden per Familien-ID (auch aus der gescannten Kontaktkarte), beidseitig bestätigt, lösbar. Sichtbarkeit als neues Profilfeld „Verbindung Partnerschaft/Familie“ (jede Person selbst; gezeigt nur, wenn beide es erlauben). Kontaktkarte zeigt „Gehört zusammen mit“; wer mit beiden Kontakt hat, kann „Gemeinsam schreiben“ (Gruppe vorausgewählt).
- **F-011 Luftbild ganz Deutschland:** Gebiet auf DE erweitert (Esri-Schlüssel vorhanden, Abrufgrenze je Adresse bleibt).
- **F-013 VG250/DNS:** Abrufe wiederholen bei DNS-Aussetzern zwei Mal zusätzlich mit längerer Pause.
- **F-014 Umzug:** `deploy/umzug.sh export|import` – Datenbank, Chat-Datenbank, Bilder, Chat-Medien, Geheimnisse; legt den Stack auf dem neuen Server per Portainer-API an (wenn Token vorhanden). Anleitung in DEPLOYMENT.md. Im Stack-Test (CI) mit echtem Export → Änderung → Import geprüft.
- **F-015 Orte ganz Deutschland:** Spielplätze, Toiletten, Wickeln, Indoor, Ausflüge für alle 16 Länder (Pause zwischen den Ländern, ein Fehler bricht den Lauf ab); VG250 lädt alle Länder, damit Orte Gemeinden zugeordnet werden.
- **Stadtteile Niedersachsen:** neue Quelle „Stadt- und Ortsteile Niedersachsen“ (OSM admin_level 10, Zuordnung über die amtliche Gemeindegrenze); läuft automatisch nach VG250.
- **Mehrsprachigkeit:** nicht umgesetzt – Entscheidung Jan (D-071).
**Warum** Sammel-Update aus `docs/FEEDBACK.md` (Jan: „Sammel-Update ja“, Entscheidungen zu F-001, F-008, F-011, F-015 am 20.10.), Stadtteile Niedersachsen auf Wunsch Jan.
**Module** M01, M02, M04, M10, M11, M13, M23, M24, Querschnitt (Navigation, Betrieb) · **DB-Migration** ja – `0012_sammel.sql` (Meldeart ergaenzung, E-Mail-Wechsel-Token, family_links, Vermerke ohne E-Mail, Orte/VG250 DE, Quelle Stadtteile NI)
**Tests** svelte-check 0 Fehler; 202 Unit/DB-Tests (neu u. a. Luftbild DE, Stadtteile NI Zuordnung, Familie verbinden + Sichtbarkeit, Nachricht der Verwaltung, Familien-ID statt E-Mail); Rauchtest 313 Prüfungen mit echtem Synapse (neu: Navigation/Mehr/Kacheln, keine E-Mail in 9 Verwaltungsseiten, Nachricht an Familien-ID, eigene Adresse + Wechsel mit Bestätigung, Ortsseite Reihenfolge + Ergänzung, Familie verbinden, Chat-Salz im 2FA-Schritt); **Browsertest `chatkey-check.py` (D-066-Machbarkeit) bestanden:** Einrichtung ohne Code, neues Gerät liest frühere Nachricht, Passwortwechsel, Passkey-Fall mit einmaliger Passwortabfrage, Zurücksetzen mit vorherigem Passwort, Neu beginnen; Anruftest; Barrierefreiheit (axe) ohne schwere Verstöße; Bildschirmfotos; Build. **Nicht getestet:** Umzugsskript auf echtem Server (nur im CI-Stack), Orte-/VG250-Abruf für ganz Deutschland gegen die echten Dienste (läuft auf dem Server automatisch).

## 2026-10-20 · Abschnitt 8.3: Impressum/Datenschutz pflegbar, Barrierefreiheit automatisch geprüft, Geräteliste getestet

**Was**
- Rechtstexte (Querschnitt): Verwaltung → Rechtstexte (Recht `settings.manage`) mit Impressum-Feldern (Pflicht: Name, Anschrift, E-Mail), Hoster/Serverstandort, Aufsichtsbehörde und Bestätigung „rechtlich geprüft“ (gespeichert mit Datum und Familien-ID, nie E-Mail). Öffentliche Seiten `/impressum` und `/datenschutz`. Die Datenschutzerklärung startet als **Entwurf, der aus den tatsächlichen Funktionen erzeugt wird** (Konto, Profil-Sichtbarkeit, Community, Chat/Anrufe E2EE inkl. Hinweis auf IP-Sichtbarkeit bei direkten Anrufen, Push ohne Inhalt, Standort nur im Browser, eigene Kacheln/Luftbild-Proxy/Linkvorschau, Protokolle mit gehashter IP, Löschfristen, Sicherungen 14 Tage, Rechte); fehlende Betreiberangaben stehen sichtbar als „fehlt“. Wahlweise eigener Text (einfaches Format, keine HTML-Eingabe). Solange nicht bestätigt, zeigen beide Seiten öffentlich „Entwurf“; jede inhaltliche Änderung hebt die Bestätigung auf.
- Fußzeile auf allen Seiten (außer Karte und Unterhaltung): Impressum, Datenschutz, Partnerlinks, Datenquellen.
- Barrierefreiheit: neues Prüfskript `scripts/a11y-check.py` (axe-core 4.10.3, WCAG 2.1 A/AA) über 38 Seitenaufrufe – ohne Anmeldung, als Mitglied, Verwaltung; hell/dunkel; 390 px/1280 px. Gefundene schwere Verstöße behoben: Kontraste (Beitragsart-Etiketten im Dunkelmodus, abgesagte Termine, Marktplatz-Status, Routen-Warnung), seitlich scrollbare Tabellen per Tastatur erreichbar (Statistik + 11 Verwaltungstabellen). Ergebnis: keine schweren Verstöße.
- Dunkelmodus „System“: Akzentflächen (aktive Filter, Umschalter, Kartenknöpfe, Avatare) nutzen jetzt Farbtokens und stimmen auch, wenn das Gerät dunkel ist und kein Modus gewählt wurde (vorher nur bei ausdrücklich gewähltem Dunkelmodus).
- Geräteliste (Querschnitt): erstmals automatisch getestet – Gerät einzeln abmelden, „alle anderen abmelden“, eigenes Gerät bleibt angemeldet.
**Warum** Offene Punkte aus STATUS (Abschnitt 8); Rechtstexte brauchen ein Gerüst, damit der Betreiber nur noch Angaben ergänzen und prüfen lassen muss. Grundsatz D-067.
**Module** Querschnitt (Recht, Barrierefreiheit, Sitzungen), M24 · **DB-Migration** nein (Einstellung `legal` in `settings`)
**Tests** svelte-check 0 Fehler; 199 Unit/DB-Tests (neu 1 DB: Rechtstexte Entwurf/Pflichtangaben/E-Mail-Format/Prüfung mit Familien-ID/Aufhebung bei Änderung/eigener Text); Rauchtest 286 Prüfungen mit echtem Synapse (neu: Datenschutz-Entwurf mit Fehlstellen, Impressum ohne Angaben, Fußzeile, Speichern + geprüft, Änderung hebt Prüfung auf, Geräteliste einzeln/alle); Barrierefreiheit `a11y-check.py`: 0 schwere Verstöße; Browsertest `call-check.py`; Bildschirmfotos; Build

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
