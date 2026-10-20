# FEEDBACK – Test-, Fehler- und Änderungsbereich

Sammelliste für alles, was Jan beim Testen auffällt. Wird im Chat gepflegt: Jan sagt kurz, was stört, fehlt oder weg muss – Claude trägt es hier ein (gleiche Sitzung, sofort). Am Ende wird daraus **ein** Sammel-Update (ein Auftrag, ein Commit-Satz, ein Ausrollen).

Regeln
- Jan muss nichts formulieren oder pflegen: Stichwort reicht („Button zu klein auf Karte“). Claude ergänzt Ort, Art und Priorität und fragt nur, wenn etwas wirklich unklar ist.
- Nichts wird stillschweigend gestrichen. „Entfernen“-Wünsche, die eine Anforderung aus REQUIREMENTS.md betreffen, werden hier markiert und erst nach ausdrücklicher Bestätigung umgesetzt (dann Eintrag in DECISIONS.md).
- Keine Passwörter, Tokens oder Schlüssel eintragen. Keine privaten Daten echter Mitglieder.
- Status: **neu** · **bestätigt** (Fehler nachgestellt) · **geplant** (im Sammel-Update) · **erledigt** (umgesetzt + getestet, mit Verweis auf CHANGELOG) · **verworfen** (mit Grund).
- Art: **Fehler** (geht nicht / falsch) · **Ändern** (soll anders sein) · **Entfernen** (soll weg) · **Dazu** (fehlt) · **Frage** (unklar, braucht Entscheidung).
- Priorität: **P1** blockiert Nutzung/Sicherheit · **P2** stört deutlich · **P3** Feinschliff.

## Offen

| ID | Art | Wo (Seite/Modul) | Was stört / soll sein | Prio | Status |
|---|---|---|---|---|---|
| F-001 | Ändern | Entdecken (Startseite), mobil + Desktop | Die Einstiegskacheln (Was machen wir heute, Veranstaltungen, Hinweise, Einrichtungen, Familienradar, Marktplatz, Hilfe …) sind zu unauffällig („Minipunkte“); auf dem Handy erfährt man nicht, dass sie existieren. Sollen sichtbar in die Navigation eingegliedert werden. Wie, ist offen (siehe Details). | P1 | neu |
| F-002 | Ändern | Navigation (Kopfleiste + Tab-Leiste), M01 | „Profil“ und „Mein Konto“ sind dasselbe Ziel (`/profil`). „Profil“ aus der Leiste entfernen, „Mein Konto“ bleibt. Ändert D-007 (fünf Hauptziele). | P2 | neu |
| F-003 | Dazu | Kopfleiste, Mitteilungen-Glocke („!“) | Neue Chat-Nachrichten sollen in der Glocke erscheinen, mit kleinem Zähler-Punkt bei Neuem. Nur Anzahl, nie Inhalt. | P2 | neu |
| F-004 | Ändern | M02 Nachrichten, Chat-Einrichtung | **Anforderung (Jan, 20.10.):** kein Code von Hand, auf neuem Gerät automatisch alles nutzbar, Nachrichten sollen nach Geräteverlust zurückkommen (Sicherung), auf jedem Gerät, auch parallel. Verschlüsselung bleibt. **Entschieden (D-066): Weg A**, Schlüssel aus dem Passwort ableiten, vorbehaltlich Machbarkeitstest (siehe Details). | P1 | geplant |
| F-005 | Ändern | M11 Spielplatz-Detail (vermutlich auch M13 Orte) | „Quelle, Import, Aktualität“ ganz nach unten. Oben stehen: Infos ergänzen, Fotos hochladen, bewerten – gut sichtbar, damit auch normale Mitglieder beitragen. Bewerten gibt es schon, Jan hat es übersehen → Auffindbarkeit verbessern. | P2 | neu |
| F-006 | Ändern | Verwaltung → Nutzer, Export, Protokoll, M24 | **Entschieden (D-060):** E-Mail bleibt in der Datenbank (Versand, Anmeldung, Reset) und ist für niemand einsehbar – weder Betreiber noch Verwaltung noch Redaktion noch in Export/Protokoll/Meldungen. Nur das Mitglied sieht und ändert die eigene Adresse in Mein Konto. Familien-ID bleibt das einzige Kennzeichen im Admin-Board. | P1 | geplant |
| F-007 | Dazu | Verwaltung → Nutzer, M24 | Vom Admin-Board aus einem Nutzer über die Familien-ID eine Nachricht schicken können (ohne E-Mail), z. B. bei Moderationsfällen. | P2 | neu |
| F-008 | Dazu | M01 Profil/QR, Kontakte | Partner/Familie verbinden: Familien-ID des Partners per QR scannen, Beziehung „Partnerschaft“ oder „Familie“ wählen, damit erkennbar ist, wer zusammengehört. Wer so ein Paar/eine Familie sieht, soll beiden gemeinsam schreiben können. | P2 | neu |
| F-010 | Ändern | Karte, Luftbild, Verwaltung → Einstellungen | Luftbild soll ohne Schlüssel, Anmeldung und Einrichtung laufen („OpenStreetMap-Satellit“). Recherche: OSM hat kein eigenes Satellitenbild, es gibt nur externe Quellen (siehe Details). Entscheidung Jan offen. | P2 | neu |

## Details und offene Fragen

**F-001 / F-002 (Navigation).** Ist-Zustand: fünf Ziele Entdecken · Karte · Community · Nachrichten · Profil (Kopfleiste Desktop, Tab-Leiste mobil), daneben Button „Mein Konto“ und Glocke. Ein Ziel „Profil“ fällt weg (F-002), es bleibt „Mein Konto“. Offen für F-001: Wohin kommen die Einstiege? Mögliche Wege (Vorschläge, noch nicht entschieden): (a) Kacheln auf Entdecken größer/oben als feste Leiste, (b) „Mehr“-Menü in der Tab-Leiste, (c) Unterpunkte pro Hauptziel (z. B. Veranstaltungen/Marktplatz/Hilfe unter Entdecken als Reiter). Claude legt im Sammel-Update zwei Varianten als Bildschirmfoto vor, bevor gebaut wird.

**F-003 (Glocke).** Glocke zeigt heute Mitteilungen mit Zähler. Chat-Nachrichten kommen nur im Browser an (Ende-zu-Ende, Server kennt den Inhalt nicht); der Zähler kann daher nur die Anzahl ungelesener Chats aus dem Gerät zeigen, solange der Chat auf dem Gerät eingerichtet/gestartet ist. Push bei geschlossener App bleibt wie bisher neutral und nur mit Opt-in.

**F-004 (Schlüssel).** Anforderung von Jan: Gerätewechsel und Einrichtung ohne Code; alte Nachrichten kommen nach Geräteverlust zurück; mehrere Geräte jederzeit. Gesichert (Code): Heute erzeugt `setupKeys()` einen Wiederherstellungsschlüssel, der einmal angezeigt wird; neue Geräte brauchen ihn (`unlockKeys`). Die Schlüsselsicherung auf dem Chat-Server (Matrix) gibt es schon, sie ist nur vom Code abhängig. Annahme (im Bau zu prüfen): Der Matrix-Standard erlaubt, den Sicherungsschlüssel stattdessen aus einer geheimen Zeichenfolge abzuleiten (Passphrase), die der Server nie sieht. Damit entfällt der Code. **Weg A (Vorschlag): Schlüssel aus dem Passwort ableiten.** Beim Anmelden mit Passwort wird im Browser der Sicherungsschlüssel abgeleitet und der Chat entsperrt sich selbst; Nutzer sieht nichts. Ersteinrichtung automatisch beim ersten Chat-Start. Wer sich per Passkey anmeldet, gibt auf einem neuen Gerät einmal sein Passwort für den Chat ein (kein Code). Betreiber kann nicht mitlesen. Grenzen: (1) Passwort „vergessen“ → Zurücksetzen bedeutet: alte Nachrichten sind weg, neue Verschlüsselung beginnt. (2) Passwort ändern geht, wenn man das alte kennt (Sicherung wird neu umhüllt). (3) Die Sicherung ist nur so stark wie das Passwort; ein schwaches Passwort ließe sich bei Zugriff auf die Chat-Datenbank durchprobieren – darum Mindestlänge/Qualität beim Passwort prüfen. (4) Login-Formulare funktionieren heute auch ohne JavaScript; die Ableitung braucht JavaScript im Browser. **Weg B: Treuhand-Schlüssel auf dem Server.** Der Server hält den Schlüssel und entsperrt automatisch. Einfachste Bedienung, Passwort-Reset verliert nichts. Nachteil: Der Betreiber (und jeder mit Serverzugriff) könnte Nachrichten lesen. Das widerspricht dem Versprechen „Betreiber kann nicht mitlesen“ und D-008. Nur wählen, wenn Jan das bewusst will. **Gewählt von Jan am 20.10.: Weg A.** Weg „Gerät bestätigt Gerät“ (QR) wäre nur Ergänzung, weil es ein altes Gerät braucht. Bau erst nach Entscheidung und Machbarkeitstest (zwei Geräte, Passwortwechsel, Passkey-Anmeldung, Zurücksetzen); danach Eintrag D-066 in DECISIONS.md. Der Umbau betrifft `client.svelte.ts` und die Chat-Einrichtungsseiten; keine Migration der alten Testschlüssel – Testkonten können neu starten.

**F-006 (E-Mail).** Entschieden von Jan: nur nicht sehen, nicht „nicht speichern“ (D-060). Umsetzung: Anzeige und jede Ausgabe der Adresse in Verwaltung, Export für Betreiber, Protokoll, Moderationsfälle und Suche entfernen (auch Suche nach E-Mail in Nutzerliste); Mitglied ändert die eigene Adresse in Mein Konto mit Bestätigung der neuen Adresse (D-016). Prüfkriterium: Test, dass keine Verwaltungsseite und keine Antwort der Verwaltungs-Schnittstellen die Adresse enthält. Hinweis zur Werbeaussage: „In der App und Verwaltung für niemanden sichtbar“ ist belegbar; „Wir kennen deine E-Mail nicht“ wäre nicht korrekt, solange sie in der Datenbank liegt und der Server sie für den Versand nutzt. Offen, falls gewünscht: Adresse zusätzlich verschlüsselt ablegen (Suche dann nur über Hash) – nur auf Zuruf.

**F-007 (Nachricht an Nutzer).** Vorschlag: Mitteilung im App-Postfach des Nutzers (Glocke), mit Protokolleintrag, ohne Zugriff auf private Inhalte.

**F-008 (Partner/Familie).** Vorschlag, nicht entschieden: Verbindung nur mit beidseitiger Bestätigung; Art wählbar (Partnerschaft/Familie); Sichtbarkeit je Profilfeld (D-015) bleibt bestimmend; gemeinsame Nachricht als Gruppe aus beiden Konten. Offen: Sehen Dritte die Verbindung, oder nur die Beteiligten und Kontakte?

**F-010 (Luftbild).** Gesichert: Die Esri-Eingabe steht nur in Verwaltung → Einstellungen; Mitglieder sehen keine Anmeldung. Ohne Eintrag zeigt die Karte das offene Luftbild des LGLN (nur Niedersachsen), Bremen bleibt ohne Luftbild (STATUS: Luftbild). OpenStreetMap selbst betreibt keine Satellitenkarte; der OSM-Wiki-Eintrag „Luftbilder“ nennt nur Landesdaten und Fremdquellen, für Bremen ohne Angabe. Hinweis der BKG-Seite: Ab 01.01.2027 sollen Länder-Geobasisdaten (AdV-GR 4.1) unter offener Lizenz (Datenlizenz Deutschland 2.0 oder CC BY 4.0) nutzbar werden; ob das Bremer Luftbild und einen Webdienst ohne Schlüssel einschließt, ist **nicht bestätigt**. Nicht geprüft: Esri-Bilder ohne Schlüssel einzubinden (Nutzungsbedingungen von Esri unklar, nicht empfohlen). Wege (Vorschläge): (1) Bremen bleibt bis Anfang 2027 ohne Luftbild, danach Prüfung der offenen Bremer Daten; Esri-Feld wandert eingeklappt unter „Erweitert“. (2) Esri-Schlüssel einmalig durch Jan anlegen (kostenlos laut Esri, Bedingungen vorher prüfen); Mitglieder merken nichts. (3) Esri ohne Schlüssel: nur nach Prüfung der Esri-Bedingungen.

## Testnotizen (was geprüft wurde, ohne Befund)

| Datum | Bereich | Gerät/Browser | Ergebnis |
|---|---|---|---|
| – | – | – | (noch leer) |

## Erledigt / verworfen

| ID | Ergebnis | Verweis |
|---|---|---|
| F-009 | verworfen: Jan weiß nicht mehr, was gemeint war („kann ignoriert werden“) | – |

## Ablauf Sammel-Update

1. Jan sammelt im Chat. Claude nummeriert fortlaufend (F-001, F-002 …) und hält die Tabelle aktuell.
2. Jan sagt „Sammel-Update bauen“. Claude fasst alle Einträge mit Status neu/bestätigt zu **einem Auftrag** zusammen: gruppiert nach Modul (M01–M24), mit Prio, betroffenen Seiten und Prüfkriterium je Punkt, plus Rückfragen zu allem Unklaren.
3. Jan bestätigt oder streicht Punkte. Danach setzt Claude alles in einem Lauf um: Code + Tests + Doku im selben Commit, CHANGELOG-Eintrag mit den F-Nummern, STATUS.md angepasst, Push auf `main`, Portainer rollt in ca. 5 Min aus.
4. Erledigte Punkte wandern nach „Erledigt“ mit Verweis auf den CHANGELOG-Eintrag; nichts gilt als erledigt ohne echten Testlauf.
