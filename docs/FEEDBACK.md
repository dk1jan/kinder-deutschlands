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
| – | – | – | (noch leer) | – | – |

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
