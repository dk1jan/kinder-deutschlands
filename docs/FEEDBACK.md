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
| F-004 | Frage | M02 Nachrichten, Chat-Einrichtung | Der Wiederherstellungsschlüssel/Schlüsselcode ist Nutzern nicht zumutbar (Jan verliert selbst bei 3–4 Testgeräten den Überblick). Verschlüsselung soll bleiben, aber ohne Code von Hand, wie bei WhatsApp/Apple/Telegram. Grundsatzentscheidung, betrifft D-008/D-034. Jan denkt nach; Optionen erarbeite ich auf Zuruf. | P1 | neu |
| F-005 | Ändern | M11 Spielplatz-Detail (vermutlich auch M13 Orte) | „Quelle, Import, Aktualität“ ganz nach unten. Oben stehen: Infos ergänzen, Fotos hochladen, bewerten – gut sichtbar, damit auch normale Mitglieder beitragen. Bewerten gibt es schon, Jan hat es übersehen → Auffindbarkeit verbessern. | P2 | neu |
| F-006 | Ändern | Verwaltung → Nutzer, M24, Datenschutz | E-Mail-Adresse darf dem Betreiber nicht angezeigt werden (Familien-ID bleibt als einziges Kennzeichen). Jan will damit werben, die E-Mail nicht zu kennen; will sie auch aus der Datenbank heraushaben. Siehe Details: Anzeige entfernen ist einfach, gar nicht speichern hat Folgen. | P1 | neu |
| F-007 | Dazu | Verwaltung → Nutzer, M24 | Vom Admin-Board aus einem Nutzer über die Familien-ID eine Nachricht schicken können (ohne E-Mail), z. B. bei Moderationsfällen. | P2 | neu |
| F-008 | Dazu | M01 Profil/QR, Kontakte | Partner/Familie verbinden: Familien-ID des Partners per QR scannen, Beziehung „Partnerschaft“ oder „Familie“ wählen, damit erkennbar ist, wer zusammengehört. Wer so ein Paar/eine Familie sieht, soll beiden gemeinsam schreiben können. | P2 | neu |
| F-009 | Frage | unklar (Diktat) | „Schlusssatz … muss weg“ – im Diktat nicht zuzuordnen. Welcher Satz, auf welcher Seite? | P3 | neu |

## Details und offene Fragen

**F-001 / F-002 (Navigation).** Ist-Zustand: fünf Ziele Entdecken · Karte · Community · Nachrichten · Profil (Kopfleiste Desktop, Tab-Leiste mobil), daneben Button „Mein Konto“ und Glocke. Ein Ziel „Profil“ fällt weg (F-002), es bleibt „Mein Konto“. Offen für F-001: Wohin kommen die Einstiege? Mögliche Wege (Vorschläge, noch nicht entschieden): (a) Kacheln auf Entdecken größer/oben als feste Leiste, (b) „Mehr“-Menü in der Tab-Leiste, (c) Unterpunkte pro Hauptziel (z. B. Veranstaltungen/Marktplatz/Hilfe unter Entdecken als Reiter). Claude legt im Sammel-Update zwei Varianten als Bildschirmfoto vor, bevor gebaut wird.

**F-003 (Glocke).** Glocke zeigt heute Mitteilungen mit Zähler. Chat-Nachrichten kommen nur im Browser an (Ende-zu-Ende, Server kennt den Inhalt nicht); der Zähler kann daher nur die Anzahl ungelesener Chats aus dem Gerät zeigen, solange der Chat auf dem Gerät eingerichtet/gestartet ist. Push bei geschlossener App bleibt wie bisher neutral und nur mit Opt-in.

**F-004 (Schlüssel).** Ist-Zustand: Ende-zu-Ende über Matrix, Wiederherstellungsschlüssel muss vom Nutzer aufbewahrt werden. Jede Lösung ohne Code ändert, wer Schlüssel verwahrt (Gerät, Nutzerpasswort/Passkey, Server). Das ist eine Datenschutz-Entscheidung und gehört mit Begründung in DECISIONS.md. Nichts wird umgesetzt, bevor Jan entschieden hat. Bis dahin bleibt der heutige Weg.

**F-006 (E-Mail).** Gesichert: Die E-Mail wird heute für Anmeldung, Bestätigung (D-016), „Passwort vergessen“ und Radar-Mails gebraucht. Folgen, wenn sie gar nicht gespeichert wird: kein Passwort-Reset per Mail, keine Radar-Mails per E-Mail, keine Hinweis-Mails (Alternativen: Passkey/Wiederherstellungscode, nur Push/In-App). Einfacher Teil: E-Mail in Verwaltung → Nutzer nicht mehr anzeigen und nicht in Export/Protokoll für Betreiber sichtbar machen; Zugriff nur technisch (Versand). Wichtig für die Werbeaussage: „Betreiber kennt die E-Mail nicht“ nur verwenden, wenn es technisch stimmt; Formulierung vor Veröffentlichung abstimmen (rechtliche Prüfung empfohlen, DSGVO/Wettbewerbsrecht). Entscheidung Jan: (1) nur ausblenden, (2) verschlüsselt/gehasht ablegen mit Einschränkungen, (3) gar nicht speichern.

**F-007 (Nachricht an Nutzer).** Vorschlag: Mitteilung im App-Postfach des Nutzers (Glocke), mit Protokolleintrag, ohne Zugriff auf private Inhalte.

**F-008 (Partner/Familie).** Vorschlag, nicht entschieden: Verbindung nur mit beidseitiger Bestätigung; Art wählbar (Partnerschaft/Familie); Sichtbarkeit je Profilfeld (D-015) bleibt bestimmend; gemeinsame Nachricht als Gruppe aus beiden Konten. Offen: Sehen Dritte die Verbindung, oder nur die Beteiligten und Kontakte?

## Testnotizen (was geprüft wurde, ohne Befund)

| Datum | Bereich | Gerät/Browser | Ergebnis |
|---|---|---|---|
| – | – | – | (noch leer) |

## Erledigt / verworfen

| ID | Ergebnis | Verweis |
|---|---|---|
| – | – | – |

## Ablauf Sammel-Update

1. Jan sammelt im Chat. Claude nummeriert fortlaufend (F-001, F-002 …) und hält die Tabelle aktuell.
2. Jan sagt „Sammel-Update bauen“. Claude fasst alle Einträge mit Status neu/bestätigt zu **einem Auftrag** zusammen: gruppiert nach Modul (M01–M24), mit Prio, betroffenen Seiten und Prüfkriterium je Punkt, plus Rückfragen zu allem Unklaren.
3. Jan bestätigt oder streicht Punkte. Danach setzt Claude alles in einem Lauf um: Code + Tests + Doku im selben Commit, CHANGELOG-Eintrag mit den F-Nummern, STATUS.md angepasst, Push auf `main`, Portainer rollt in ca. 5 Min aus.
4. Erledigte Punkte wandern nach „Erledigt“ mit Verweis auf den CHANGELOG-Eintrag; nichts gilt als erledigt ohne echten Testlauf.
