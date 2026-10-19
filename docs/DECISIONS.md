# DECISIONS

Grundsatzentscheidungen. Neue oben anhängen, alte nicht löschen – bei Änderung neuen Eintrag mit Verweis.

## D-001 · Docker-Compose-Stack statt direkter Plesk-Installation (18.10.2026)
PostGIS, Hintergrunddienste, Chat-/TURN-Server und reproduzierbare Updates lassen sich in Containern sauber betreiben. Plesk übernimmt nur Domain, TLS und Reverse Proxy. Alternative (Plesk-Node.js + Plesk-DB) verworfen: kein PostGIS-Komfort, schwächere Update-Kontrolle.

## D-002 · Vollautomatische Updates über Portainer-GitOps und Branch `deploy` (18.10.2026)
Push auf `main` → Actions testet und baut → schreibt Compose mit neuem Image-Tag als einzelnen Commit in den Branch `deploy` → Portainer prüft `deploy` alle 5 Minuten und rollt aus. Warum eigener Branch: Doku-Commits auf `main` lösen keinen Neustart aus; jedes Update ist ein eindeutiger Image-Tag; Rückrollen = älteren Tag in `deploy` setzen. `update.sh` nur als Notfallweg.

## D-003 · GitHub-Speicher sparen (18.10.2026)
Kein Build-Cache bei GitHub, keine Artefakte, `provenance/sbom` aus (keine Zusatz-Manifeste). Nach jedem Lauf: alte Image-Versionen löschen (3 behalten), alte Läufe löschen (10 behalten), Caches leeren. Repo ist öffentlich → Paket öffentlich → kein Speicherkontingent nötig.

## D-004 · Technik: SvelteKit (Node) + PostgreSQL/PostGIS, ohne ORM (18.10.2026)
Ein modularer Monolith für SSR-Oberfläche und API; wenig Abhängigkeiten, schnell auf Mobilgeräten. SQL direkt (`postgres`-Client) mit nummerierten SQL-Migrationen – transparent und ohne Generator. Stabile Hauptversionen gepinnt (Kit 2, Svelte 5, Vite 7).

## D-005 · Sicherheit der Anmeldung (18.10.2026)
Passwörter mit scrypt (Node-eigen, keine native Zusatzbibliothek). TOTP für alle Verwaltungsrollen Pflicht. Sitzungstoken nur als SHA-256 in der DB. TOTP-Geheimnisse AES-256-GCM-verschlüsselt mit aus `APP_SECRET` abgeleitetem Schlüssel. Passkeys folgen in Abschnitt 1.

## D-006 · Rechte-Grundregeln (18.10.2026)
Recht = Rolle × Geltungsbereich × Aktion. Regionen vererben nur nach unten. Geschützte Gruppen (`protected_group.*`) werden nie über global/Region/Thema geöffnet, nur über eine ausdrückliche Gruppen-Zuweisung oder die Betreiberrolle. Rollenvergabe vorerst nur mit globalem Recht `roles.assign`. Die letzte Betreiberrolle kann nicht entzogen werden.

## D-007 · Navigation: fünf Hauptziele (18.10.2026)
Entdecken · Karte · Community · Nachrichten · Profil. Veranstaltungen, Marktplatz, Hilfe und Lebenslagen sind Einstiege in „Entdecken“ und Ebenen der Karte – keine eigenen Hauptpunkte. Verwaltung für Berechtigte am Desktop in der Leiste, mobil über Profil.

## D-008 · Chat Ende-zu-Ende-verschlüsselt über eigenen Matrix-Server – FESTGELEGT mit D-034 (19.10.2026)
Eigene Synapse-Instanz nur für Kinder Deutschlands (nicht die vorhandene auf dem Server), eigene Oberfläche. Moderation privater Chats nur über gemeldete, vom Meldenden freigegebene Inhalte. Wird mit Abschnitt 4 endgültig festgelegt. Jan hat nicht widersprochen.

## D-009 · TURN auf demselben Server – ANNAHME (18.10.2026)
UDP 10000 und 40000–40100 sind bereits belegt (Jitsi, MiroTalk). TURN bekommt einen eigenen freien Bereich, Festlegung in Abschnitt 7.

## D-010 · E-Mail über den Plesk-Mailserver – ANNAHME (18.10.2026, Einstellort geändert durch D-019)
Absender z. B. `noreply@` der späteren Domain. SMTP-Zugang nur als Portainer-Umgebungsvariable.

## D-011 · Designrichtung „Wimpel & Watt“ (18.10.2026)
Kühles Nordsee-Grau-Grün, tiefes Seegrün als Schrift, Tonnengelb als einziger Signalakzent; Schriften Bricolage Grotesque (Überschriften) und Atkinson Hyperlegible Next (Text, gut lesbar), selbst gehostet. Markenzeichen: der Wimpel (Bezug zum Kinderwagenwimpel mit QR-Kontakt).

## D-013 · Neue Gestaltung „Wimpelkette“ – ersetzt die Farbwelt aus D-011 (18.10.2026)
Rückmeldung Jan: erste Fassung zu leer und blass. Neu: Tiefsee-Navy als Schrift und Nachtgrund, Wimpelfarben Tonnengelb, Leuchtturmrot (Roter Sand), Wattgrün, Himmelblau – in beiden Modi gleich wie bedrucktes Material. Startseite mit Wimpelkette (einzige inszenierte Bewegung, respektiert reduzierte Bewegung), Kinderwagen-Illustration, Familien-ID als Wimpel-Etikett mit echtem QR-Code, Modul-Postkarten mit ehrlichem Bauabschnitt, schematischer Karte der Startregion, „Was wir nicht machen“. Desktop: Kopfleiste statt Seitenleiste; mobil: Kopfleiste + Tab-Leiste. Schriften bleiben (Bricolage jetzt mit schmaler Laufweite für Überschriften). Alle Illustrationen sind eigenes SVG, keine fremden Bilder.

## D-012 · Regionen nach amtlichem Regionalschlüssel (18.10.2026)
Schlüssel = ARS/AGS (Land 2-stellig, Kreis 5-stellig, Gemeinde 8/12-stellig), Wurzel `de`. Bremen-Stadt `04011` und Bremerhaven `04012` sind kreisfreie Städte im Land Bremen `04` – damit sind Land, Stadt und Bremerhaven klar getrennt (M05). Vollständiger Bestand und Geometrien nur aus amtlicher Quelle per Import, nicht von Hand.

## D-014 · Familien-ID: 8 Zufallszeichen + Prüfzeichen (18.10.2026)
Crockford-Base32 (ohne I, L, O, U), angezeigt als `XXX-XXX-XXX`. 32⁸ ≈ 10¹² Möglichkeiten, nicht fortlaufend, Prüfzeichen fängt Tippfehler ab. Eingabe tolerant (Groß/klein, Leerzeichen, O→0, I/L→1). Durchprobieren: Ratenbegrenzung pro Konto und IP. Die ID ist unabhängig von interner Konto-ID und QR-Token.

## D-015 · Sichtbarkeit je Feld, Beziehung extern < Mitglied < Kontakt < selbst (18.10.2026)
Jedes Profilfeld hat eine Stufe alle/Mitglieder/Kontakte/niemand. Vorgabe „zurückhaltend“: Externe sehen nur die ID, Mitglieder den Namen, Kontakte den Rest; Altersgruppen der Kinder nie öffentlich. Blockierte sehen gar nichts. Die Stufe „Gruppen“ folgt mit M04.

## D-016 · E-Mail-Bestätigung Pflicht, keine Adress-Preisgabe (18.10.2026)
Ohne bestätigte Adresse keine Anmeldung, keine Auffindbarkeit. Registrierung und „Passwort vergessen“ antworten immer gleich; ist die Adresse schon registriert, bekommt deren Inhaber eine Hinweis-Mail. Token einmalig, zweckgebunden, gehasht gespeichert. Ohne SMTP bleibt die Registrierung geschlossen.

## D-017 · Passkey gilt als zweiter Faktor (18.10.2026)
Ein Passkey (WebAuthn, Nutzerprüfung verlangt) vereint Besitz und Biometrie/PIN; eine Passkey-Anmeldung braucht daher keinen TOTP-Code und erfüllt die 2FA-Pflicht für die Verwaltung.

## D-018 · Kontolöschung anonymisiert, Löschliste außerhalb der DB (18.10.2026)
Persönliche Daten werden gelöscht, der Konto-Datensatz bleibt anonymisiert für Protokoll-Verweise. Jede Löschung wird zusätzlich in `/backups/deletions.log` vermerkt; die App wendet diese Liste beim Start erneut an. So kehren gelöschte Konten auch nach Wiederherstellung einer älteren Sicherung nicht zurück.

## D-019 · Betriebseinstellungen in der Verwaltung, Geheimnisse verschlüsselt (18.10.2026)
Wunsch Jan: Einstellungen im Backend statt in Portainer. Einstellungen liegen in `settings` (in Sicherungen enthalten), Geheimnisse dort nur AES-256-GCM-verschlüsselt mit einem aus `APP_SECRET` abgeleiteten Schlüssel; Anzeige nur „gespeichert ja/nein“. Recht `settings.manage`, jede Änderung im Protokoll ohne Geheimwert. Portainer-Variablen bleiben Rückfall. Ausnahme bleiben Werte, ohne die die App nicht startet oder die die Verschlüsselung selbst tragen: `APP_URL`, `APP_SECRET`, Datenbank-Zugang – die bleiben in Portainer.

## D-020 · Datenquellen der Karte (18.10.2026, ergänzt D-012)
Am 18.10.2026 per CI-Prüflauf echt geprüft. Orte: OpenStreetMap über Overpass (ODbL; Bremen 816, Niedersachsen 14 746 Spielplätze, 278/3 076 Toiletten), mit drei Ausweichservern und wachsender Wartezeit, da der Hauptserver zeitweise überlastet ist. Regionen: BKG VG250 per WFS als GeoJSON (amtlich, dl-de/by-2-0, Länder/Kreise/Gemeinden für 03 und 04). Bremer Stadtteile: keine offene amtliche Geometrie als Dienst gefunden – Übergangsweise OSM `admin_level=10` (23 Bremen, 9 Bremerhaven), Quelle sichtbar gekennzeichnet; amtliche Quelle bleibt Prüfkandidat. Namensnennung an Karte, Ortsseite und `/karte/quellen`. Hinweis ODbL: Mischung mit Mitgliederdaten ist eine abgeleitete Datenbank – Mitgliederbeiträge bleiben getrennt erkennbar, Export auf Anfrage; rechtliche Bewertung durch Betreiber.

## D-021 · Eigene Kartenkacheln statt Kartendienst (18.10.2026)
Ausschnitt aus dem täglichen Protomaps-Build per `pmtiles extract` (nur benötigte Bereiche per HTTP-Range), Bremen + Niedersachsen bis Zoom 15 ≈ 1,5 GB (Zoom 14 ≈ 0,7 GB), monatlich erneuert. Auslieferung durch die App (`/kacheln/basis.pmtiles`, Range), Schriften/Symbole im Image. Kein Kartenaufruf erzeugt Anfragen an Dritte; keine API-Schlüssel, keine Kosten. Stil: Protomaps-Ebenen mit eigenen Farben der Wimpelkette, hell/dunkel nach Einstellung.

## D-022 · Importregeln (18.10.2026)
Jede Quelle: Abruf → Abgleich per Prüfsumme → neu/geändert/entfernt. Automatische Übernahme nur, wenn höchstens 15 % (einstellbar) des Bestands verschwinden würden, sonst Vorschau zur Freigabe. Verschwundenes wird archiviert, nie gelöscht; Wiederauftauchen reaktiviert. Redaktionell geänderte Felder (auch einzelne Merkmale) werden gesperrt und nie überschrieben. Dubletten (gleiche Art ≤ 30 m) werden nur vorgeschlagen; Zusammenführen ist eine Redaktionsentscheidung, danach pflegt nur die älteste Quelle die Angaben. Fehler: Wiederholung nach 1, 2, 4 … Stunden bis zum Regelrhythmus.

## D-023 · Zeitplan im Web-Container, kein n8n/Valkey für Abschnitt 2 (18.10.2026)
Ein Abruf gleichzeitig, abgesichert über eine Datenbanksperre; nach Neustart werden hängende Läufe beendet. Spart einen Dienst und hält alles in Portainer sichtbar. n8n bleibt optional für spätere Quellen (M23 erlaubt das ausdrücklich), Valkey kommt mit Abschnitt 4/5.

## D-024 · Merkmale dreiwertig, Hinweise nach Herkunft (18.10.2026)
Ausstattung ist ja / nein / unbekannt – fehlende Angabe wird nie als „nein“ gezeigt. Meldungen „defekt“/„gesperrt“ erscheinen sofort als „Hinweis eines Mitglieds – unbestätigt“ (30 Tage, ohne Freitext); die Redaktion bestätigt („Redaktion“) oder kennzeichnet „amtlich“ mit Quellenlink. Freitext von Meldungen sieht nur die Redaktion.

## D-025 · Bewertungen und Fotos erst mit Moderation (18.10.2026)
M11/M13 verlangen Fotos und Erfahrungen. Sie kommen mit Abschnitt 3 (Moderatoren-Cockpit, Meldungen, Bildprüfung), damit keine Kinderfotos oder Beleidigungen ungeprüft erscheinen. Bis dahin steht ehrlich „Noch keine Erfahrungen“.

## D-026 · Luftbild (18.10.2026)
Geprüft: Niedersachsen LGLN DOP20 per WMS offen (CC BY 4.0, „LGLN (Jahr)“), deckt Bremen nicht ab. Bremen DOP (Landesamt GeoInformation) nur gegen Gebühr, BKG-DOP nur für Berechtigte. Daher: LGLN als Standard, optional Esri World Imagery mit Schlüssel des Betreibers. Beides läuft über unseren Server (Besucher-IP bleibt bei uns), LGLN-Kacheln werden zwischengespeichert, Esri-Kacheln nicht dauerhaft. Darstellung: Vektorkarte darunter, Luftbild ab Zoom 10, Beschriftung obenauf.

## D-027 · Navigation über externe Apps (18.10.2026)
Keine eigene Routenberechnung für Autos/ÖPNV. „Hinweg“ übergibt nur das Ziel an Google Maps, Apple Karten, Waze, OpenStreetMap oder eine beliebige Karten-App (geo:). Hinweis im Menü, dass dort die Regeln des Anbieters gelten.

## D-028 · Community nur für Mitglieder (18.10.2026)
Beiträge, Antworten und Gruppen sind nur angemeldet lesbar. Öffentlich bleiben Karte, Orte mit Bewertungen und als „öffentlich“ markierte Wissenseinträge. Kein Indexieren durch Suchmaschinen.

## D-029 · Automatische Markierung ist nie ein Urteil (18.10.2026)
Einfache Regeln markieren Telefonnummern, E-Mail, IBAN, Drohungen (zurückgehalten bis zur Prüfung) sowie Beleidigung, Betrug, Kurzlinks, Spam (nur markiert). Entscheiden tut immer ein Mensch mit Begründung; Betroffene erhalten sie und können einmal Einspruch einlegen. Sperren nur durch den Betreiber.

## D-030 · Pseudonyme in geschützten Gruppen (18.10.2026)
Pseudonym je Gruppe, eindeutig in der Gruppe. Auch die Gruppenmoderation sieht nicht Profil oder Familien-ID; nur der Betreiber kann über die Datenbank zuordnen (für Sperren/Behördenanfragen). Aufnahmeantworten werden nach der Entscheidung gelöscht. Globale Moderation ist ohne ausdrückliche Gruppenzuweisung nicht zuständig. Keine absolute Sicherheit gegen eingeschleuste Personen – das steht so in der Gruppe.

## D-031 · Linkkarten und Einbettungen (18.10.2026)
Der Server holt Titel/Bild einer Seite einmalig (nur öffentliche Adressen, Standardports, max. 3 Weiterleitungen, je geprüft, 1 MB). Fremde Player laden erst nach Klick (YouTube über youtube-nocookie, Vimeo); andere Plattformen nur als Karte mit Link. Keine Downloads fremder Videos.

## D-032 · Bilder (18.10.2026)
Alle hochgeladenen Bilder werden mit sharp neu kodiert (WebP, max. 2000 px), Metadaten inkl. GPS entfernt, Originale nicht gespeichert. Auslieferung nur nach Zugriffsprüfung (Gruppe/Beitragsstatus). Ortsfotos erscheinen erst nach Freigabe, Hochladende bestätigen „keine Personen erkennbar“.

## D-033 · Wissen nur mit Zustimmung (18.10.2026)
Aus einem Beitrag entsteht ein Wissenseintrag nur als Entwurf; veröffentlicht wird erst nach Zustimmung der Autorin/des Autors. Beiträge aus Gruppen werden nie übernommen. Veröffentlichung braucht mindestens eine Quelle, das Prüfdatum wird angezeigt.

## D-034 · Chat: eigener Synapse, Ende-zu-Ende-verschlüsselt, ohne Föderation (19.10.2026)
Synapse im Stack (nur internes Netz), erreichbar ausschließlich über die App (Proxy für `/_matrix/client` und `/_matrix/media`; Admin-Schnittstelle nie). Keine Föderation, keine Registrierung, keine Passwörter: Anmeldung nur mit kurzlebigem JWT der App. Verschlüsselung im Browser (Matrix Rust-Krypto). Der Betreiber kann Inhalte nicht lesen; die Datenbank enthält nur Chiffrat. Plattformregeln setzt ein Regelmodul im Chat-Server durch, das die App fragt (fail closed). Alternative „serverseitig verschlüsselt“ verworfen: Betreiber hätte Lesezugriff, widerspricht M02 („kein pauschaler Admin-Lesezugriff“) und dem Schutzbedarf geschützter Gruppen.

## D-035 · Feste Chat-Serverkennung (19.10.2026)
`server_name` = `kinder-deutschlands`, unabhängig von der Domain. Ein Domainwechsel (APP_URL) zerstört so keine Chats. Chat-Kennungen sind zufällig (`@k…`), nicht aus Familien- oder Konto-ID ableitbar.

## D-036 · Moderation im Chat (19.10.2026)
Melden nur mit ausdrücklicher Freigabe des Wortlauts durch die meldende Person (optional 5 Nachrichten Zusammenhang); Absender und Zeitpunkt bestätigt der Server, der Wortlaut ist technisch nicht prüfbar – so wird er angezeigt. Verschlüsselte Nachrichten können nicht „entfernt“ werden; möglich sind freigeben, verwarnen, einschränken, sperren (Betreiber), eskalieren. Eine Einschränkung gilt in Gruppen und Treffen, nicht im Direktchat mit bestätigten Kontakten (dort hilft Blockieren). Sperren meldet alle Chat-Geräte ab.

## D-037 · Push ohne Inhalt (19.10.2026)
Eigenes Push-Gateway in der App; der Chat-Server sendet nur Ereigniskennungen („event_id_only“). Hinweis lautet immer „Neue Nachricht“/„Neue Mitteilung“ – kein Absender, kein Text, kein Thema auf dem Sperrbildschirm. Ruhezeiten serverseitig. VAPID-Schlüssel automatisch erzeugt, verschlüsselt gespeichert. Lesebestätigungen und Tippanzeige standardmäßig aus, Online-Status gibt es nicht.

## D-038 · Gerätewechsel und Wiederherstellung (19.10.2026)
Wiederherstellungsschlüssel (Matrix Secret Storage + Schlüsselsicherung), wird einmal angezeigt. Ohne ihn sind frühere Nachrichten auf neuen Geräten nicht lesbar – das steht so in der Oberfläche, auch dass niemand sie wiederherstellen kann. „Neu einrichten“ bei Verlust bestätigt die App (signiertes Kurzzeit-Token statt Passwort, geprüft im Regelmodul). Geräte abmelden über die App.

## D-039 · Treffen: Lösch- und Aufbewahrungsregel (19.10.2026)
Treffen-Räume laufen 2 Stunden bis 7 Tage. Nach Ablauf löscht der Server den Raum mit allen Nachrichten (Synapse „purge“); auf Geräten verschwinden sie beim nächsten Laden. Wer später beitritt, sieht nur Nachrichten ab Beitritt. Beitritt nur angemeldet, per QR-Link mit Ticket (10 Min.), höchstens 50 Personen. Raumname und Ablaufzeit kennt der Server, Inhalte und Treffpunkt nicht. „Dauerhaft behalten“ macht eine Gruppe daraus, QR-Beitritt endet.

## D-040 · Live-Standort nur im Vordergrund (19.10.2026)
Web-Apps dürfen im Hintergrund nicht orten. Live-Standort läuft nur, solange die Seite offen ist, endet nach 15/30/60 Min. oder sofort per „Stoppen“, und geht nur verschlüsselt an die Mitglieder des Raums. Keine Admin-Karte, keine Speicherung in der App-Datenbank.

## D-041 · Erste Nachricht an Personen ohne Chat-Gerät (19.10.2026)
Ende-zu-Ende-Verschlüsselung braucht Schlüssel des Empfängergeräts. Hat das Gegenüber den Chat noch nie geöffnet, wartet das Eingabefeld (statt unlesbar zu senden) und das Gegenüber bekommt einen Hinweis. Direktchat-Einladungen bestätigter Kontakte nimmt der Client automatisch an, damit Schlüssel sofort verfügbar sind. In Gruppen wird angezeigt, wer neue Nachrichten erst nach dem ersten Öffnen lesen kann.

## D-042 · Termine: Herkunft und „öffentlich“ (19.10.2026)
Jeder Termin zeigt seine Herkunft: verifizierte Einrichtung, Redaktion, aus einer Quelle übernommen oder „von einem Mitglied – nicht geprüft“. Drei Sichtbarkeiten: **öffentlich** (auch ohne Konto im Internet), **im Netzwerk** (nur angemeldete Mitglieder), **privat** (nur mit Link). Öffentlich dürfen nur Einrichtungen, Redaktion und übernommene Quellen veröffentlichen; Mitgliedstermine sind höchstens „im Netzwerk“. FreiKarte nur, wenn Einrichtung/Redaktion es bestätigt. Blockierte Personen sehen ihre Mitgliedstermine gegenseitig nicht. Telefonnummern u. Ä. halten Mitgliedstermine zur Prüfung zurück (wie Community).

## D-043 · Wiederkehrende Termine (19.10.2026)
Gespeichert wird eine Serie (Beginn + Regel nach iCalendar, Teilmenge: täglich/wöchentlich/monatlich, Abstand, Wochentage, n-ter Wochentag, bis/Anzahl) und Einzelabsagen als Datum. Berechnet wird in deutscher Ortszeit, damit 10 Uhr auch nach der Zeitumstellung 10 Uhr bleibt. Abgesagte Tage bleiben als „abgesagt“ sichtbar; wer gemerkt oder zugesagt hat, wird benachrichtigt, und es entsteht ein Hinweis „Absage“. Nicht abbildbare Regeln aus Importen bleiben beim Bearbeiten unverändert („wie bisher“).

## D-044 · „Wer kommt mit?“ (19.10.2026)
„Interessiert“/„Ich komme“ ist unverbindlich und ausdrücklich keine Anmeldung beim Anbieter. Namen erscheinen nur bei „Ich komme“ mit eigener Zustimmung („mich zeigen“), sonst nur Zahlen. Event-Chat dazu folgt (vorgesehen, nutzt die Treffen-Räume aus Abschnitt 4).

## D-045 · Freie Plätze nur mit Gültigkeit (19.10.2026)
Einrichtungen bestätigen die Verfügbarkeit für 3, 7, 14 oder 30 Tage. Danach – und ohne Bestätigung – steht dort „Verfügbarkeit unbekannt“, nie „frei“. Angezeigt werden immer Stand und Gültigkeit. Nach Ablauf bittet die App das Team einmal um erneute Bestätigung. Neu frei gewordene Plätze erzeugen einen Hinweis „Neu“ (fürs Radar), keinen Sofort-Push.

## D-046 · Verifizierte Einrichtungen (19.10.2026)
Verifizierung bestätigt nur die Zuordnung der Person zur Organisation (Prüfung über einen unabhängigen Weg, Begründung Pflicht), nicht die Qualität der Angebote – so steht es auch in der Oberfläche. Die Prüfangaben werden nach der Entscheidung gelöscht. Rollen im Team: Verwaltung (Team, Profil) und Redaktion (Inhalte); Personen kommen über ihre Familien-ID dazu; die letzte Verwaltung kann nicht gehen. Folgen ist privat: die Einrichtung sieht nur eine grobe Zahl (unter 10, 10–49, 50–199, 200+). Pausierte Einrichtungen verschwinden samt Terminen/Angeboten, ihr Kalenderabruf ruht.

## D-047 · Regionale Hinweise (19.10.2026)
Hinweise haben eine Art (neu, aktualisiert, Absage, Frist, Sperrung, Leistung, Information) und eine sichtbare Herkunft: amtlich bestätigt (nur mit Link zur amtlichen Quelle), Anbieterinformation, Redaktion, ungeprüfter Mitgliederhinweis (bisher nur bei Orten der Familienkarte). Ein Hinweis für die Stadt gilt auch in ihren Stadtteilen und umgekehrt sieht man Hinweise der Stadtteile beim Blick auf die Stadt. Nur die Redaktion kann „wichtig“ setzen; das schickt einen Push ohne Inhalt und nur an Personen, die „dringende Hinweise“ selbst eingeschaltet haben und deren Radar die Region umfasst.

## D-048 · Merkliste und Kalender-Link statt Familienkalender (19.10.2026)
Gespeichert wird nur, was man selbst merkt; Erinnerungen nur, wenn man sie am Eintrag einstellt (1 Std. bis 1 Woche vorher, bei Fristen vor der Frist). Kalender: Einzeltermin als .ics-Datei oder ein persönlicher Abo-Link mit allen gemerkten Terminen und Fristen. Der Link ist ein Geheimnis: gespeichert wird nur sein Hash, er wird einmal angezeigt und lässt sich erneuern oder abschalten.

## D-049 · Familienradar (19.10.2026)
Bis zu 5 private Profile (Regionen inkl. Unterregionen, Themen, Alter, Arten), pausier- und löschbar, mit Vorschau. Übersicht im Portal immer; E-Mail und Push nur, wenn gewählt (wöchentlich montags oder täglich, jeweils ab 7 Uhr). Nur Neues seit der letzten Zusammenfassung (Fassungsvergleich, keine Dubletten), mit Quelle, Datum, Frist und Link; leere Zusammenfassungen werden nicht verschickt. Betreff „Dein Familienradar“, Push „Dein Familienradar ist da“ – keine Themen auf dem Sperrbildschirm. Gefolgte Einrichtungen kommen unabhängig von Region und Thema dazu. Abonnieren einzelner Orte/Termine: vorgesehen (bis dahin über Merken).

## D-050 · Kalender von Einrichtungen übernehmen (19.10.2026)
Nur der eigene, öffentliche Kalender (ICS) einer verifizierten Einrichtung – sie trägt die Adresse selbst ein und bestätigt damit das Nutzungsrecht. Abruf täglich über die Datenzentrale, gegen interne Adressen geschützt, höchstens 3 MB. Abgleich über die Kennung des Kalendereintrags; von der Einrichtung in der App geänderte Felder werden gesperrt und nicht überschrieben; was aus dem Kalender verschwindet und noch nicht vorbei ist, wird archiviert, nicht gelöscht. Abweichungen einzelner Serientermine (RECURRENCE-ID) werden noch nicht übernommen.

## D-051 · Marktplatz (19.10.2026)
Nur für angemeldete Mitglieder und vorerst nur private Anbieter (gewerbliche Angebote brauchen eigene Regeln – Impressumspflicht, Gewährleistung – und sind bis dahin ausgeschlossen). Kein Bezahl-, Versand- oder Treuhandsystem; die Seite sagt das deutlich und warnt vor Vorkasse. Ort nur als Gegend: gespeichert wird der Mittelpunkt der gewählten Region, nie eine Adresse; Übergabe vereinbaren die Beteiligten im Chat. Kontakt: „Anfrage“ ist eine Kontaktanfrage mit Bezug zur Anzeige (ohne Telefonnummern), nach Annahme verschlüsselter Direktchat – so gelten die Chat-Regeln aus D-034 unverändert. Gegen Massenanzeigen: höchstens 30 aktive, 15 neue pro Tag, keine Doppelten; Laufzeit 30 Tage, verlängerbar. Autositze/Babyschalen und Kinderwagen: Anbietende bestätigen Zustand/Unfallfreiheit/Vollständigkeit, Interessierte sehen einen Sicherheitshinweis. Suchaufträge melden neue Treffer als Mitteilung; Push nur mit eigenem Schalter.

## D-052 · Familien helfen Familien (19.10.2026)
Erfahrung von Eltern, keine Fachberatung – steht auf jeder Seite, mit Verweis auf verifizierte Beratungsstellen und den Kompass. Fremdbetreuung von Kindern (Babysitten, Aufpassen, Leihoma …) wird hier nicht vermittelt; solche Einträge werden mit Hinweis auf geprüfte Wege (Kindertagespflege über das Jugendamt, Familienzentren) abgelehnt. Wörter, die auf eine akute Krise hindeuten, blenden die offiziellen Notruf- und Krisennummern ein (Quelle: Familienportal des BMFSFJ); der Treffer wird nicht gespeichert. Unser Chat ist kein Notfalldienst.

## D-053 · Lebenslagen-Kompass (19.10.2026)
Inhalte nur aus offiziellen, verlinkten Quellen mit Quelle und Prüfdatum, gepflegt von der Redaktion (Recht `compass.edit`); Start mit dem Familienportal des Bundes. Die Auswahl der Besucher wird nicht gespeichert (kein Profil, keine Auswertung); Abgehakte Schritte werden nirgends gespeichert (auch nicht im Browser); die Liste lässt sich drucken. Sensible Lagen (Trennung, Geld knapp) zeigen die Krisennummern. Beratung in der Nähe = verifizierte Einrichtungen (D-046), Gruppen nur für Mitglieder.

## D-054 · Private Einladungen (19.10.2026)
Zugang nur über einen geheimen Link (gespeichert als Hash; verschlüsselte Kopie, damit die Gastgeberin ihn erneut teilen kann), erneuer- und abschaltbar, kein Referrer, nicht indexierbar. Gäste antworten ohne Konto; ihr Schlüssel zum Ändern liegt nur als Cookie in ihrem Browser. Adresse auf Wunsch erst nach Zusage. Die Gästeliste sieht nur die Gastgeberin; Namen der anderen Zusagen nur, wenn sie das erlaubt, und nur für Zusagende. Keine Nachnamen, Geburtsdaten oder Kinderfotos nötig. Alles wird 30 Tage nach dem Termin gelöscht. Gäste-Chat: verschlüsselt, Beitritt per Ticket nur mit Konto und Zusage, Raum wird 2 Tage nach dem Termin vom Server gelöscht.

## D-055 · Event-Chat (19.10.2026)
Zu „Wer kommt mit?“ gibt es je Termin-Tag einen verschlüsselten Chat (wie Treffen, D-039): anlegen und beitreten nur mit „Ich komme“/„Interessiert“ für diesen Tag oder als Veranstalter; gelöscht einen Tag nach dem Termin. Blockierte Personen erhalten kein Ticket für Chats der jeweils anderen.

