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

## D-056 · Anrufe und TURN (19.10.2026)
Audio-/Videoanrufe zunächst nur 1:1 im verschlüsselten Direktchat, über die Matrix-1:1-Anrufe (Signalisierung als verschlüsselte Ereignisse im Raum, Medien direkt zwischen den Geräten, DTLS-SRTP). Für Geräte hinter NAT/Mobilfunk ein eigener TURN-Server (coturn) auf demselben Server (bestätigt Annahme D-009): Zugangsdaten zeitlich begrenzt vom Chat-Server, Geheimnis aus APP_SECRET, Relay nur ins öffentliche Netz, nur UDP-Relay, Kontingente. Der TURN-Server sieht nur verschlüsselte Medien. Kein Mitschnitt, keine Anrufprotokolle bei uns (daher in der Statistik „nicht erfasst“). Gruppenanrufe brauchen einen Medienserver (LiveKit/SFU) – vorgesehen, nicht gestrichen. Grenze von Web-Apps: Klingeln nur bei geöffneter App; Web-Push kann keinen Anruf signalisieren.

## D-057 · Zweite Freigabe kritischer Aktionen (19.10.2026)
Kritisch sind: Betreiber- oder Technikrolle vergeben/entziehen und ein Konto sperren. Diese brauchen eine zweite Person mit demselben globalen Recht (nicht die antragstellende). Antrag mit Begründung, 72 Std. gültig, danach verfallen; zurückziehbar; jede Entscheidung im Protokoll. Gibt es nur eine berechtigte Person (Start mit einem Betreiber), wird die Aktion sofort ausgeführt und im Protokoll als „ohne zweite Freigabe“ vermerkt – sonst könnte sich der Betrieb selbst blockieren. Andere Rechte und Moderationsentscheidungen bleiben direkt.

## D-058 · Partnerlinks (19.10.2026)
Nur amazon.de, nur in Community-Beiträgen und Antworten außerhalb geschützter Gruppen; nie in Chats, Marktplatz, Hilfe, Einladungen. Die Kennung wird erst beim Anzeigen ergänzt, der gespeicherte Ursprungslink bleibt unverändert und nachvollziehbar. Fremde Kennungen werden nicht überschrieben, sondern als „fremder Partnerlink“ gekennzeichnet. Jeder ergänzte Link ist als „Partnerlink“ markiert (rel=sponsored) und erklärt auf `/partnerlinks`; keine Aussagen zu Provision pro Klick oder „kein Mehrpreis“. Standardmäßig aus; einschalten erst nach bestätigter Prüfung der aktuellen Amazon-Bedingungen (geschlossene Bereiche, PWA, Linkumwandlung) – Name und Datum werden gespeichert. Keine Produktbilder/-daten von Amazon.

## D-059 · Kinderwagenrouten (19.10.2026, GPS-Teil geändert durch D-077)
Routen entstehen durch Einzeichnen auf der Karte, seit D-077 auch per GPS-Aufzeichnung mit Schutzregeln (oder später Import mit geklärter Lizenz) – keine Bewegungsverläufe mit Zeiten. Wer einzeichnet, bestätigt, dass Start und Ziel öffentliche Orte sind; Mitgliederrouten werden vor der Veröffentlichung von der Redaktion (Recht `routes.edit`) geprüft. Angaben sind Erfahrungen, keine Garantie für Sicherheit oder Barrierefreiheit (steht auf jeder Route). Hindernisse erscheinen sofort als ungeprüfter Hinweis ohne Namen und öffnen einen Fall; Hinweise älter als 180 Tage verschwinden. Bei Kontolöschung werden eigene Routen gelöscht.

## D-060 · E-Mail-Adresse für niemanden einsehbar (20.10.2026)
Entscheidung Jan: Die E-Mail-Adresse bleibt in der Datenbank (Anmeldung, Bestätigung, Passwort zurücksetzen, Radar-Mails), aber keine Rolle – auch Betreiber nicht – kann sie in der App, Verwaltung, Export, Protokoll oder Moderation sehen. Nur das Mitglied sieht und ändert die eigene Adresse. Identifikation im Admin-Board nur über die Familien-ID. Präzisiert D-016. Werbeaussage nur als „für niemanden einsehbar“, nicht als „unbekannt“, solange die Adresse gespeichert ist. Umsetzung im nächsten Sammel-Update (F-006).

## D-061 · Zusatzebenen der Familienkarte (20.10.2026)
Auf der Karte erscheinen nur Dinge mit öffentlichem Ort: Termine (Sichtbarkeit wie in der Liste) und geprüfte Kinderwagenrouten. Marktplatz und Hilfe nur für angemeldete Mitglieder und nur als Anzahl je Gegend am Mittelpunkt der Region – einzelne Punkte würden eine Genauigkeit vortäuschen, die es bewusst nicht gibt (D-051). Eine Ebene „Mitglieder“ gibt es nicht: keine Personen auf der Karte, auch nicht grob. Die Auswahl der Ebenen bleibt im Browser bzw. in der Adresse, nichts wird serverseitig gespeichert.

## D-062 · Orte abonnieren (20.10.2026)
Abo = gemerkter Ort mit Schalter „Bei Änderungen benachrichtigen“. Auslöser: neuer oder bestätigter Hinweis (defekt/gesperrt), Aufhebung, neuer nicht-privater Termin an diesem Ort. Nutzerhinweise ohne Freitext (der geht nur an die Redaktion). Push nur mit dem Schalter „Radar“. Einzelne Termine braucht kein eigenes Abo: „Merken“ meldet Änderung und Absage und erinnert auf Wunsch.

## D-063 · Freigabestufe „Mitglieder meiner Gruppen“ (20.10.2026)
Neue Stufe zwischen „Mitglieder“ und „Kontakte“: sichtbar für Mitglieder, die mit mir aktiv in derselben offenen oder Beitritts-Gruppe sind (und für Kontakte). Geschützte Gruppen und Gruppen, in denen eine der Personen ein Pseudonym nutzt, zählen nie – sonst ließe sich aus einer plötzlich sichtbaren Angabe ableiten, dass jemand Mitglied einer geschützten Gruppe ist. Die Vorschau „So sehen andere mich“ zeigt die Gruppen-Sicht.

## D-064 · Aufnahme durch Partnerorganisationen (20.10.2026)
Gruppen mit Beitritt oder geschützte Gruppen können einer verifizierten Einrichtung zugeordnet werden. Deren Verwaltung (Rolle „admin“ im Einrichtungsteam, nicht „Redaktion“) entscheidet über Aufnahmeanfragen – sieht dabei nur Gruppennamen/Pseudonym und Antworten, nie Familien-ID oder Profil, keine Mitgliederliste, keine Inhalte, keine Moderation. Pausierte oder nicht verifizierte Einrichtungen verlieren das Recht sofort. Mitteilungen über neue Anfragen nennen keine Namen. Wer anfragt, sieht, dass die Partnerorganisation mitentscheidet. Jede Entscheidung im Protokoll mit „via partner“.

## D-065 · Hinweise von Mitgliedern (20.10.2026)
Mitglieder schlagen regionale Hinweise vor (Sperrung, Absage, Frist, Information, Neu – nicht „Leistung“). Vorschläge sind erst nach Freigabe durch die Redaktion mit Recht `notices.edit` für die Region sichtbar und bleiben als „Hinweis eines Mitglieds“ gekennzeichnet – Freigabe heißt plausibel und ohne private Daten, nicht amtlich bestätigt. Ablehnung nur mit Begründung, die das Mitglied erhält. Telefonnummern/E-Mail/IBAN werden abgewiesen. Höchstens 3 Vorschläge pro Tag, Laufzeit 3–30 Tage, selbst beendbar, Name wird nicht gezeigt, Löschung mit dem Konto. Hinweise zu Orten der Karte laufen weiter über „Melden“ am Ort.

## D-066 · Chat-Schlüssel aus dem Passwort ableiten, kein Code von Hand (20.10.2026)
Entscheidung Jan: Weg A. Ende-zu-Ende-Verschlüsselung bleibt; der Sicherungsschlüssel des Chats wird beim Anmelden mit Passwort im Browser aus dem Passwort abgeleitet, der Server sieht ihn nie (Betreiber kann nicht mitlesen). Kein Wiederherstellungscode mehr für Nutzer, Einrichtung automatisch beim ersten Chat-Start, alle Geräte jederzeit nutzbar. Passkey-Anmeldung: auf einem neuen Gerät einmal Passwortabfrage für den Chat. Passwort ändern: Sicherung wird neu umhüllt; Passwort zurücksetzen (vergessen): alte Nachrichten gehen verloren, neue Verschlüsselung beginnt. Verworfen: Weg B (Schlüssel auf dem Server), weil der Betreiber mitlesen könnte (widerspricht D-008). Ersetzt den Wiederherstellungsschlüssel-Ablauf aus D-034. Vorbehalt: vor dem Bau Machbarkeitstest (zwei Geräte, Passwortwechsel, Passkey, Zurücksetzen, Anmeldung mit 2FA-Zwischenschritt, Anmeldung ohne JavaScript); fällt er negativ aus, kommt Jan mit einer Alternative zurück, es wird nichts stillschweigend geändert.

## D-067 · Rechtstexte als geprüfter Entwurf (20.10.2026)
Impressum und Datenschutzerklärung pflegt der Betreiber in der Verwaltung. Claude erzeugt den Datenschutz-Entwurf nur aus dem, was die Software tatsächlich tut, und ersetzt keine Rechtsberatung. Fehlende Betreiberangaben werden nicht erfunden, sondern als „fehlt“ angezeigt. Bis der Betreiber die rechtliche Prüfung bestätigt, steht öffentlich „Entwurf“; jede inhaltliche Änderung hebt die Bestätigung auf. Gespeichert wird, wer bestätigt hat (Familien-ID, nicht E-Mail – D-060). Eingaben werden nie als HTML ausgegeben.

## D-068 · Grundkarte für ganz Deutschland, Zoom 15 (20.10.2026)
Entscheidung Jan: Die eigenen Kartenkacheln (D-021) decken ganz Deutschland bis Zoom 15 ab (Gebiet `5.8,47.2,15.1,55.1`, grobe Grenzen). Umsetzung als Einstellung in Verwaltung → Daten, nicht im Code; Platz auf dem Server geprüft (313 GB frei bei 33 % belegt). Direkter Abruf von OSM-Rasterdiensten verworfen (Nutzungsrichtlinie: ohne Zusage, kommerziell jederzeit widerrufbar, kein Vorabladen, IP an Dritte); OpenFreeMap als Alternative geprüft, aber verworfen (anderes Kartenschema, Umbau des Stils, spendenfinanziert ohne SLA). Offen: Luftbild-Gebiet (F-011), Orte-Bestand (F-015). Ablauf: erst testen, dann schnell ausrollen, danach nachbessern.

## D-069 · Navigation: vier Ziele + „Mehr“ (20.10.2026) – ersetzt D-007, abgelöst durch D-073
Entscheidung Jan (F-001/F-002): Leiste Entdecken · Karte · Community · Nachrichten · Mehr. „Profil“ entfällt als Ziel, das Konto erreicht man oben über „Mein Konto“. „Mehr“ listet alle Bereiche; Entdecken zeigt sie als große Kacheln (für Mitglieder ganz oben). Bereiche, die eine Anmeldung brauchen, führen Gäste zur Anmeldung.

## D-070 · Partnerschaft und Familie verbinden (20.10.2026)
Verbindung zwischen zwei Konten nur mit Bestätigung beider, Art „Partnerschaft“ oder „Familie“, jederzeit von einer Seite lösbar, höchstens 10. Wer sie sieht, entscheidet jede Person selbst über das Profilfeld „Verbindung Partnerschaft/Familie“ (Stufen wie bei allen Feldern, D-015/D-063); angezeigt wird sie nur, wenn beide es für die betrachtende Person erlauben, nie ohne Anmeldung, nie bei Blockierung. „Gemeinsam schreiben“ nur für Kontakte beider (Chat-Regeln wie bei Gruppen).

## D-071 · Keine Mehrsprachigkeit (20.10.2026)
Entscheidung Jan: Die Oberfläche bleibt Deutsch; weitere Sprachen werden nicht umgesetzt (REQUIREMENTS: „weitere Sprachen sinnvoll vorbereiten“ – bewusst zurückgestellt, nicht stillschweigend gestrichen). Einfache Sprache bleibt vorgesehen.

## D-072 · Gruppenanrufe über eigenen Medienserver, Ende-zu-Ende-verschlüsselt (20.10.2026)
Entscheidung Jan: Gruppenanrufe „wie Zoom“. Umsetzung mit LiveKit (Medienserver/SFU, Apache-2.0, `livekit/livekit-server:v1.13.7`) im Stack statt Verbindungen jeder mit jedem (trägt nur 3–4 Personen) und statt fremder Dienste (Jitsi/MiroTalk auf dem Server bleiben unberührt, D-009). Nur in **Gruppen und Treffen**, nur für Mitglieder (Prüfung über den Chat-Server), nicht für von der Moderation eingeschränkte Konten; Direktchats behalten den 1:1-Anruf (D-056). Höchstens 25 Personen je Anruf (`LIVEKIT_MAX_PARTICIPANTS`, 2–200).
**Verschlüsselung:** Bild und Ton zusätzlich Ende-zu-Ende-verschlüsselt (Insertable Streams, AES-GCM). Den Schlüssel erzeugt der Browser, der den Anruf startet; er geht nur per Olm (verschlüsselt an einzelne Geräte, nicht im Verlauf) an Geräte von Mitgliedern, die gerade im Anruf sind. Empfänger prüfen Absender, Gerät, Anruf und Mitgliedschaft. Medienserver und App sehen den Schlüssel nie; wer später beitritt, bekommt ihn von einem Teilnehmenden. Ein Schlüssel je Anruf (neuer Anruf = neuer Schlüssel), kein Wechsel während des Anrufs. Browser ohne diese Technik können nicht teilnehmen (Meldung statt unverschlüsselt).
**Betrieb:** Signalweg per WebSocket über die App (`/livekit/rtc`, eigener Node-Start `scripts/server.mjs`) – keine zweite Domain, keine Änderung in Plesk. Medien über **49210 UDP** (Ausweich **49210 TCP**), TURN (D-056) als Rückfall; als STUN dient der eigene TURN-Server (keine Google-Server). Öffentliche Adresse: `LIVEKIT_NODE_IP` → `TURN_EXTERNAL_IP` → DNS des `APP_URL`-Hosts. Räume legt nur die App an (Name aus HMAC, nicht die Chat-Kennung), Schlüssel aus `APP_SECRET`. Verwaltungs-Schnittstelle nur intern. Treffen beendet/abgelaufen → laufender Anruf wird beendet. Beitritts-Token gilt 60 s (steht technisch bedingt in der WebSocket-Adresse und damit ggf. im nginx-Zugriffslog). Kein Mitschnitt, keine Anrufprotokolle. Grenze: Wer die Gruppe während eines laufenden Anrufs verlässt, bleibt bis zum Auflegen verbunden.

## D-073 · Menü mit drei Gruppen, Startseite mit Kopf zuerst (20.10.2026) – ersetzt D-069
Entscheidung Jan (F-016): Die großen Kacheln oben auf Entdecken entfallen, alle Bereiche kommen ins Menü. Am Computer: **Entdecken ▾ · Karte · Community ▾ · Nachrichten · Wissen ▾**. Klick auf „Entdecken“ führt zur Startseite, Klick auf „Community“ zur Community-Seite, der Pfeil daneben (oder die Maus darüber) klappt die Bereiche auf. Es gibt keinen eigenen Punkt „Startseite“ (Entdecken = Startseite). „Wissen“ hat keine eigene Seite und klappt nur auf.
Gruppen (Liste nur in `app/src/lib/areas.ts`): **Entdecken** = Was machen wir heute?, Veranstaltungen, Kinderwagenrouten, Freie Plätze & Kurse, Einrichtungen · **Community** = Familien helfen Familien, Marktplatz, Einladungen, Treffen per QR · **Wissen** = Hinweise & Fristen, Lebenslagen-Kompass, Familienradar (Einordnung von Jan bestätigt).
Am Handy bleibt die Leiste unten: Entdecken · Karte · Community · Nachrichten · **Menü**. „Menü“ öffnet ein Blatt von unten mit allen drei Gruppen, Konto und Rechtstexten (schließt mit Esc, ✕, Tippen daneben, Wischen nach unten). Ohne JavaScript führt „Menü“ zur Seite `/mehr` (bleibt als Rückfall). Gäste sehen Mitgliederbereiche mit Schloss, der Link führt zur Anmeldung.
Startseite für Gäste und Mitglieder gleich: zuerst der Kopf „Eltern finden Eltern.“, unten die Übersicht „Was es hier alles gibt“ mit den Kacheln nach Gruppen.

## D-074 · Mehr Kartendaten nur aus offenen Quellen, neue Ortsarten (21.10.2026)
Jan wollte Daten „z. B. aus Google Maps“. Verworfen: Google erlaubt Auslesen/Speichern nicht, REQUIREMENTS verbietet das Kopieren fremder Verzeichnisse, jeder Ort braucht Quelle und Lizenz. Stattdessen OpenStreetMap (ODbL) für ganz Deutschland, Merkmale laut OSM-Wiki: Familiencafés = Cafés/Restaurants/Eiscafés mit `kids_area` yes/designated/limited (Schnellrestaurants bewusst nicht); Stillmöglichkeit = `baby_feeding` yes/room; neue Arten **Bibliothek** (`amenity=library`, Hochschul-/Instituts-/Archivbibliotheken über den Namen ausgelassen) und **Familienzentrum** (`community_centre=family_centre`); Minigolf und Kletterhallen als Ausflugsorte. Neue Merkmale: Spielecke, Hochstuhl, eigener Stillraum. Kommunale Open-Data-Portale später je Quelle mit Lizenzprüfung (D-020). Lücken füllen Mitglieder über „Ort vorschlagen“/„Ich kann etwas ergänzen“.

## D-075 · OSM-Orte aus dem Deutschland-Auszug statt Overpass (21.10.2026)
Anlass: overpass-api.de meldet „at capacity … for automated or high-volume use, run a local Overpass API instance“, Ausweichserver laufen in Zeitüberschreitungen; unsere Abrufe (ganz Deutschland, wöchentlich, 9 Orte-Quellen) sind genau solche Nutzung. Entscheidung (Jan „go“): wöchentlich `germany-latest.osm.pbf` von Geofabrik (ODbL, ~4,5 GB, MD5) auf den eigenen Server, einmal mit `osmium tags-filter` alle benötigten Merkmale herausfiltern, als GeoJSON-Zeilen exportieren, jede Quelle liest ihre Auswahl daraus (gleiche Regeln wie die Overpass-Abfragen, `matches`). Overpass bleibt Rückfall (`OSM_SOURCE=auto`). osmium (osmium-tool v1.19.1, libosmium v2.23.1, protozero v1.8.2) gibt es nicht als Alpine-Paket → im Docker-Build aus dem Quellcode, Stände über Git-Commit geprüft. Eine eigene Overpass-Instanz wurde verworfen (dauerhaft Dienst + Datenbank, deutlich mehr Platz und Pflege). Grenze: Der Auszug reicht minimal über die Landesgrenze; solche Orte bekommen keine Region.
Zusätzlich (F-021, Weg 1): Indoorspielplätze auch als Spielplatz mit `indoor=yes`, Trampolinhallen und über typische Namen (nur an Freizeit-/Ausflugsobjekten, nie an Kitas/Schulen/Geschäften); solche Spielplätze erscheinen nicht mehr doppelt als Außenspielplatz.

## D-076 · Community nach „Ganz Deutschland“ und Bundesland, Einladung je Beitrag (21.10.2026)
Entscheidung Jan (F-023): Die Community hat zwei Bereiche, **Ganz Deutschland** und das **eigene Bundesland** (aus der Wohnregion im Profil). Beim Schreiben wählt man „Nur [Land]“ (vorausgewählt) oder „Ganz Deutschland“. Beiträge „Nur [Land]“ lesen ausschließlich Mitglieder mit Wohnregion in diesem Land, die Verfasserin und **Eingeladene** – nicht im Feed, nicht in der Suche, auch nicht per direktem Link (Jan: „Nur Region + Eingeladene“, Bereich = Bundesland). Einladen darf jede Person, die den Beitrag lesen kann, per Familien-ID; die eingeladene Person liest und antwortet genau diesen Beitrag, bekommt eine Mitteilung; höchstens 20 Einladungen am Tag; Blockierungen (mit Einladender oder Verfasserin) verhindern die Einladung, ohne es zu verraten; nur die Verfasserin sieht und nimmt Einladungen zurück. Bundesland wechseln höchstens einmal in 30 Tagen (erstes Eintragen und Wechsel innerhalb des Landes frei), damit niemand durch Wechseln fremde Landes-Beiträge mitliest. Gruppen bleiben eigene Räume; Moderation sieht alles wie bisher; bestehende Beiträge gelten als „Ganz Deutschland“. Gäste sehen weiterhin keine Beiträge.

## D-077 · Kinderwagenrouten auch per GPS aufzeichnen (22.10.2026) – ändert D-059
Entscheidung Jan (F-027): Neben dem Einzeichnen kann man eine Route unterwegs per GPS aufzeichnen. Schutzregeln, weil ein aufgezeichneter Weg oft an der Haustür beginnt: Aufzeichnung nur im Browser und nur auf dem Gerät, bis man absendet (Verwerfen löscht alles); nur Punkte mit GPS-Genauigkeit ≤ 35 m und ≥ 5 m Bewegung; zuerst glätten, dann **Anfang und Ende entlang des Wegs kürzen – Standard 50 m, je Ende 0–200 m per Regler** (Jan: 150 m zu viel, 10 m liegt in der GPS-Ungenauigkeit), Vorschau mit „Start“/„Ziel“ vor dem Absenden; gespeichert wird nur die vereinfachte Linie (≤ 480 Punkte), keine Uhrzeiten, kein Tempo. Bestätigung „Start und Ziel öffentliche Orte“ und Prüfung durch die Redaktion bleiben. Bildschirm bleibt während der Aufzeichnung an (Wake Lock); im Hintergrund zeichnet der Browser nicht auf – Lücke wird angezeigt (Hintergrund nur mit eigener App, F-026).

## D-078 · Overture Maps als zweite Ortsquelle mit strengen Regeln (23.10.2026)
Anlass Jan (F-028): bekannte Indoorspielplätze fehlen (Leo's Abenteuerpark). OSM hat kommerzielle Freizeitbetriebe lückenhaft. Geprüft und verworfen: spielplatztreff.de (Nutzungsbedingungen 4.3 verbieten automatisches Auslesen ohne Zustimmung), mamilade.de (keine Lizenz, Datenbankschutz § 87b UrhG), Google (D-074); Anfragen bei den Betreibern wollte Jan nicht. Foursquare Open Places steckt zum Teil in Overture und braucht separat ein Konto. Kommunale Open-Data-Spielplatzlisten (z. B. Dortmund, dl-de/zero) später gezielt.
Entscheidung (Jan „go“): **Overture Maps Places** (Lizenz CDLA-Permissive-2.0 bzw. Apache-2.0 je Lieferant, Namensnennung „Overture Maps Foundation, overturemaps.org“ + Foursquare-Hinweis), ganz Deutschland, nur Indoorspielplätze/Trampolinhallen, Kindermuseen, Kinderbauernhöfe. Regeln aus Jans Stichprobe Bremen (23.10.): Zuverlässigkeit ≥ 0,8 (eindeutiger Indoor-Name ≥ 0,7), unscharfe Kategorien nur mit Kinderwort im Namen, Ausschlussliste (Vereine, Märkte/Volksfeste, Spielhallen, Spielplätze draußen, Unterkünfte, Småland …), nur `operating_status = open`, nur Adressen in Deutschland. Vorhandene Orte (OSM/Mitglieder) haben Vorrang, Overture-Ort wird dann nicht angelegt. Weil Firmenverzeichnisse veraltete Einträge enthalten (z. B. „Space Center Bremen“ mit 0,98), blendet eine Meldung „gibt es nicht mehr“ reine Overture-Orte sofort aus; bestätigt die Redaktion, bleibt der Ort dauerhaft archiviert (Status gesperrt). Abruf per HTTP-Teilabruf direkt aus den öffentlichen Parquet-Dateien (kein DuckDB im Container nötig), Zwischenspeicher je Ausgabe.
Zugleich: Datenzentrale zeigt den Zustand in einem Satz, Knöpfe nur noch eingeklappt unter „Technik“; noch nie gelaufene Quellen haben im Zeitplan Vorrang – niemand muss nach einem Update etwas abrufen.

## D-079 · Dubletten automatisch, GPS-Routen zurückgenommen, nur „Familie“ (23.10.2026)
Entscheidungen Jan (F-029):
- **Dubletten:** Eindeutige Paare führt die App selbst zusammen (nach jedem Abruf und täglich): nur Importe (nichts Bestätigtes), gleiche Art, ≤ 30 m, Namen beide leer/gleich/ähnlich oder einer leer bei ≤ 15 m; behalten wird der Ort mit mehr Angaben, sonst der ältere. Unklare Fälle bleiben in der Prüfung. Zusammenführen bleibt umkehrbar nachvollziehbar (Status „zusammengeführt“, Protokoll), alle Inhalte ziehen mit um.
- **GPS-Aufzeichnung** für Kinderwagenrouten wieder entfernt (Jan: „Müll“) – **D-077 aufgehoben**, D-059 gilt wieder (nur Einzeichnen).
- **Familie verbinden** kennt keine Unterscheidung mehr: neue Verbindungen sind „Familie“, alte „Partnerschaft“ wird als „Familie“ angezeigt (ändert D-070 nur in der Bezeichnung).
- **Startseite** zeigt eine Datenübersicht mit echten Zahlen (keine geschätzten oder erfundenen Werte), Quelle und Stand.

## D-080 · Thema freiwillig, Anheften ohne Begründung, Angeheftetes überall oben (23.10.2026)
Anlass Jan (F-030). Seit D-076 ist jeder Beitrag über „Ganz Deutschland“ oder das Bundesland auffindbar – Thema und Region sind daher freiwillig. Anheften ist keine Sanktion: eigener Knopf für alle, die den Beitrag moderieren dürfen, ohne Begründung und ohne Mitteilung an die Verfasserin, mit Protokolleintrag. Angeheftete Beiträge stehen in jedem Feed oben; angeheftete Beiträge für ganz Deutschland (ohne Land/Region) auch im Landes-Feed. Overture-Daten werden in einem eigenen Prozess gelesen, damit die Web-App nicht ausgebremst wird.

## D-081 · Verwaltung legt Einrichtungen ohne Prüfung an (23.10.2026)
Wer das Recht `orgs.verify` hat, prüft sonst die Anträge – ein Antrag an sich selbst ist sinnlos. Solche Personen legen Einrichtungen direkt verifiziert an und sind deren Verwalter; Mitglieder ohne dieses Recht stellen weiter einen Antrag mit Funktion und Prüfweg (Ablauf für Mitglieder unverändert). Protokolliert als `org.created_verified`.

## D-082 · Rückmeldung an Melder und Einsender per Mitteilung (23.10.2026)
Entscheidung Jan (F-036): Wer einen Ortsvorschlag oder eine Orts-Meldung einreicht, erfährt in der Glocke (Mitteilungen), dass sie bearbeitet wurde. Bei Freigabe/Erledigt **und** Ablehnung geht derselbe neutrale Dank („Danke für deine Meldung – wir haben sie bearbeitet.“ bzw. „… deinen Vorschlag …“), damit niemand durch ein „abgelehnt“ entmutigt wird. Die Redaktion kann den Text pro Fall selbst schreiben; sie hat drei getrennte Felder mit klarer Sichtbarkeit: öffentlicher Hinweis am Ort (alle, nur bei Defekt/Gesperrt mit „bestätigen“/„amtlich“), interne Notiz (nur Verwaltung), Nachricht an den Melder (nur der Melder). Der Einsender wird nur benachrichtigt, wenn sein Konto noch besteht. Moderationsfälle (Community/Chat) behalten ihren festen Dank (unverändert).

## D-083 · Produktivdomain kinder-deutschlands.de (23.10.2026)
Entscheidung Jan: Betrieb unter `https://kinder-deutschlands.de` statt der Testdomain `kinder.jan-krueger.org`; `www` leitet per 301 auf die Hauptdomain. Die Domain läuft auf demselben Plesk und Server; die Domain steckt nur in `APP_URL` (Portainer), nicht im Code (D-035: feste Chat-Serverkennung). Die alte Testdomain wurde ersatzlos gelöscht, weil es keine aktiven Nutzer gab; Mitglieder mit Links oder QR-Codes der alten Adresse hätten sonst eine Umleitung gebraucht (Ablauf in `DEPLOYMENT.md`). Folge für Nutzer: neu anmelden, Passkeys und Push neu einrichten. Mail-Absender (`noreply@kinder-deutschlands.de`) folgt später.

## D-084 · Auftritt ganz Deutschland statt Testphase Bremen (24.10.2026)
Entscheidung Jan: Kinder Deutschlands tritt ab sofort bundesweit auf – keine Hinweise auf Testbetrieb, Start in Bremen/Niedersachsen, „Schritt für Schritt“, „In Arbeit“ oder Modul-/Abschnittsnummern auf öffentlichen Seiten. Ehrlichkeit bleibt (REQUIREMENTS: nichts Erfundenes): keine erfundenen Mitgliederzahlen, keine Funktionen, die es nicht gibt; geschlossene Registrierung heißt „gerade nicht möglich“. Die Zahlenbox der Startseite zeigt nur Zahlen; die Pflicht-Namensnennung der Quellen (ODbL, Overture, BKG) bleibt an der Karte und unter „Datenquellen“. Daten: OSM (Deutschland-Auszug) und Overture für alle 16 Länder; neu die Ortsart Unterkunft (Camping ohne FKK/Gruppen/Dauercamping, DJH-Jugendherbergen, Familien-/Kinderhotels und Ferienhöfe über eindeutige Namen, Hotels mit Spielecke), Wickeln auch über `diaper`, Elterncafés über eindeutige Namen. Weiterhin kein Auslesen von Gelbe Seiten, Google & Co. (Nutzungsbedingungen, Datenbankschutz § 87b UrhG, D-074/D-078). Grundkarte ganz Deutschland wie D-068. Weit herausgezoomt zeigt die Karte Zählkreise für ganz Deutschland.

## D-085 · Forum für Moderation und Verwaltung (24.10.2026)
Entscheidung Jan: dritter Community-Bereich „Moderatoren“ zum Austausch über Meldungen, Problemfälle, Sperren. Lesen und Schreiben nur mit dem Recht `team.forum` – vergeben an alle Moderationsrollen (bundesweit, Region, Thema, geschützte Gruppe), Redaktion, Technik und Betreiber; egal für welchen Geltungsbereich. Beiträge hängen an keiner Region/Gruppe/Ort, erscheinen in keinem anderen Feed und keiner Suche, werden nie ins Wissen übernommen. Neues Thema → Mitteilung an das übrige Team. Private Daten von Mitgliedern gehören auch hier nicht hinein (Familien-ID statt E-Mail, D-060).

## D-086 · Rundnachrichten mit eigenem Recht (24.10.2026)
Entscheidung Jan (REQUIREMENTS „regionale Systemmitteilungen“): Nachrichten an alle Mitglieder oder an Regionen (Bundesland, Kreis, Stadt, Stadtteil – jeweils mit allem darunter), z. B. bei Störungen. Eigene Rolle „Rundnachrichten“ (`broadcast.send`), global oder für eine Region; Betreiber darf immer. Empfänger = Mitglieder mit Wohnregion in der Gegend; „Ganz Deutschland“ = alle. Zustellung als Mitteilung in der Glocke; Push nur an Mitglieder, die „Wichtiges sofort“ eingeschaltet haben (REQUIREMENTS: keine heimlichen Sofortmeldungen). Vorschau zeigt Empfängerzahlen unter 5 nur ungefähr; höchstens 10 je Tag und Person; Bestätigungshaken; Protokoll ohne Text.

## D-087 · Unwetterwarnungen vom DWD, Bevölkerungsschutz erst mit BBK-Vereinbarung (24.10.2026)
Jan wollte NINA/DWD-Warnungen mit Push, „Hauptsache legal“. Geprüft (24.10.2026):
- **DWD:** Warnungen liegen frei auf opendata.dwd.de (Lizenz CC BY 4.0 laut Nutzungsbedingungen des Open-Data-Servers, Stand Mai 2024). Umgesetzt: Momentaufnahme „DISTRICT_DWD_STAT“ (Kreisebene, CAP) alle 5 Minuten, Texte unverändert, Quelle und Lizenz an jeder Warnseite. Kreiszuordnung über die Warnzelle, abgesichert über die Warnfläche gegen die VG250-Kreisgrenzen.
- **Bevölkerungsschutz (MoWaS/NINA, KATWARN, BIWAPP):** Das BBK hat öffentlich erklärt, dass die Schnittstelle hinter warnung.bund.de keine MoWaS-API ist und für die Weiterverbreitung amtlicher Warnungen eine Warnmultiplikatoren-Vereinbarung mit dem BBK nötig ist; das BBK sei nicht Urheber der Meldungen. Deshalb **nicht** eingebunden. Weg: Anfrage an das Team Warnmultiplikatoren (Warnmultiplikatoren@bbk.bund.de, Jan). Bis dahin verweist die Warnseite auf NINA, Cell Broadcast, Radio und Sirenen.
- Regeln: Abo je Kreis (bis 5, Name frei, Mindeststufe 1–4, Push wählbar), Standard ab Stufe 2 mit Push. Neue Warnung → Mitteilung + Push; Aktualisierung (CAP „references“) nur bei höherer Stufe; nichts beim allerersten Abruf. Ruhezeiten gelten, außer bei Stufe 4. Keine Aussage „NINA ersetzt“ – Push kann sich verzögern, maßgeblich bleibt der DWD (wettergefahren.de).

## D-088 · Live unterwegs: Live-Standort auf der Karte für Kontakte/Mitglieder (24.10.2026)
Jan wollte (F-037) freigegebene Live-Standorte auf der Karte, damit Familien sich finden. Entschieden und umgesetzt:
- **Abweichung von D-040 nur für diese Ebene:** Der Standort liegt hier **unverschlüsselt auf dem Server** (Tabelle `live_shares`), weil Fremde ihn sehen können müssen. Die Chat-Variante (verschlüsselt, nichts in der App-Datenbank) bleibt unverändert.
- **Nie der genaue Punkt:** Der Server rundet beim Eintreffen auf die Mitte eines ca. 200-m-Rasters (0,002° × 0,003°) und speichert nur diese. Auf der Karte ein Kreis von 200 m. Der genaue Punkt wird weder gespeichert noch geloggt.
- **Stufen:** „Meine Kontakte“ und „Alle Mitglieder“ (angemeldet). „Für alle ohne Konto“ gibt es **nicht**. Teilen ist aktiv ein/aus, höchstens eine Freigabe je Mitglied.
- **Pflicht-Ablauf:** 30 oder 60 Min., beim Start festgelegt (Positionsupdates verlängern nicht). Abgelaufen/gestoppt = sofort unsichtbar (jede Abfrage prüft `expires_at`), Zeile wird minütlich gelöscht, ebenso beim Löschen des Kontos. Nur im Vordergrund (Seite offen, D-040); Hintergrund erst mit der Android-App (F-026, nicht Teil davon).
- **Anzeige:** nur Anzeigename nach Profil-Sichtbarkeit (D-015), sonst „Eine Familie“; kein Foto, keine Kinderangaben. Blockierte (in beide Richtungen), gesperrte Konten und die eigene Freigabe erscheinen nie. Stumm geschaltete Mitglieder können nicht teilen.
- **Kontakt:** Antippen → `/live/<Freigabe-Nr.>` prüft erneut die Sichtbarkeit und leitet zur normalen Kontaktanfrage mit Kurznachricht (`/nachrichten/familie`), danach verschlüsselter Chat. Die Familien-ID steht nicht in der Karten-Antwort.
- **Nicht** in Datenexport, Protokoll oder Verwaltung. Ehrlich: Ein Datenbank-Backup kann die Zeile für die Dauer der Freigabe enthalten.
- **Zu tun (Jan):** Datenschutzerklärung ergänzen (Standort der Live-Ebene, Rundung, Dauer, Löschung) und die Ebene rechtlich prüfen lassen (Empfehlung), bevor sie breit beworben wird. Ersetzt für diese Ebene die Aussage „keine Personen auf der Karte“ (D-061).

## D-089 · Feedback aus der Fußzeile, nur für Angemeldete (24.10.2026)
- **Entscheidung:** Link „Feedback“ in der Fußzeile → `/feedback` mit Auswahl **Fehler melden · Fehlerkorrektur (Inhalt ist falsch) · Allgemeines Feedback**, Freitext (5–2000 Zeichen) und der Seite, von der gemeldet wird (nur Pfad, ohne Suchparameter und Sprungmarke). Eingang in Verwaltung → Feedback (Recht `feedback.manage`: Rollen `moderator_global`, `tech_admin`, Admin über „*“).
- **Warum nur angemeldet:** Spam- und Missbrauchsschutz (10 Meldungen je Person und Tag), und Rückmeldung an die Person ist nur über die Glocke möglich. Gäste werden zur Anmeldung geleitet und kommen zurück.
- **Datenschutz:** keine Geräte-, Browser- oder IP-Daten gespeichert; Protokoll enthält nur Art und Länge, nicht den Text. Verwaltung sieht den Absender nur als Familien-ID (D-060), nie die E-Mail. Feedback ist Teil des Datenexports und wird mit dem Konto gelöscht. Die Person soll keine Passwörter oder Gesundheitsdetails schreiben (Hinweis im Formular).
- **Antwort:** „Erledigt“/„Verworfen“ schickt eine Mitteilung (ohne Push) – neutraler Dank, mit Antwort der Verwaltung, falls geschrieben (wie F-036: gleicher Ton in beiden Fällen).
- **Abgrenzung:** `docs/FEEDBACK.md` bleibt Jans Test-Sammelliste; das Mitglieder-Feedback ersetzt sie nicht. Migration 0019.

## D-090 · Profilkarte per Familien-ID aus dem Forum (24.10.2026)
- **Entscheidung:** Der Autorenname im Forum (Beitrag, Antworten, Lösung, Beitragsliste) ist ein Link auf `/m/<Familien-ID>`: dieselbe Kontaktkarte wie nach dem QR-Scan (`cardForViewer`), samt Kontaktanfrage. Nur für angemeldete Mitglieder (Gäste → Anmeldung), Abruf 120/Stunde, Anfragen 30/Stunde.
- **Schutz:** Die Karte folgt den Freigabestufen des Profils. Autorinnen mit **Gruppenpseudonym in geschützten Gruppen** sind nicht anklickbar (Familien-ID wird dort gar nicht erst ausgeliefert, D-063/M04). Gelöschte, gesperrte, blockierte (beide Richtungen) und ungültige IDs ergeben dieselbe neutrale Fehlerseite („nicht (mehr) sichtbar“). Kontaktanfrage zählt als Weg „id“ (keine neue Datenbankart).

## D-091 · Startseiten-Überschrift „Familien finden Familien.“ (24.10.2026)
- **Entscheidung (Jan):** Die Überschrift „Eltern finden Eltern.“ (D-073) wird zu „Familien finden Familien.“ – Väter, Alleinerziehende und Großeltern sind mitgemeint, passt zur Familien-ID. Der Satz „Adresse und Telefonnummer bleiben bei dir – du bestimmst, wer was sieht.“ steht jetzt im Kopfbereich. Alle übrigen Aussagen zur Startseitenstruktur aus D-073 gelten weiter.

## D-092 · NINA-Warnungen ohne BBK-Vereinbarung einbinden (25.10.2026) – ändert D-087
Jan hat nach dem Hinweis auf das Risiko (keine offizielle Schnittstelle, Weiterverbreitung laut BBK nur mit Warnmultiplikatoren-Vereinbarung; das BBK kann es untersagen, Haftung beim Betreiber) entschieden: **einbinden und sofort einschalten** („go B“). Umsetzung: Abruf über `warnung.bund.de/api31` (MoWaS, KATWARN, BIWAPP, LHP, Polizei; DWD weiter direkt), Texte unverändert, deutliche Quellenangabe „BBK, NINA/warnung.bund.de – Text der warnenden Behörde unverändert, ohne Gewähr“, Hinweis, dass bei Gefahr die Durchsagen der Behörden gelten und Cell Broadcast/Radio/Sirenen eingeschaltet bleiben sollen. Bevölkerungsschutz-Meldungen gehen an alle Abonnenten des Kreises unabhängig von der Mindeststufe. Die Anfrage beim BBK (Warnmultiplikatoren@bbk.bund.de) bleibt empfohlen; untersagt das BBK die Nutzung, wird die Quelle abgeschaltet.
Warnkarte: aktive Warnungen als Flächen (Bevölkerungsschutz immer, Wetter ab Stufe 2), antippbar, Legende mit Wort.
**Aufgehoben durch D-093 (25.10.2026):** NINA ist wieder raus; die Warnkarte bleibt für Wetterwarnungen.

## D-093 · NINA wieder entfernt, keine Anfrage beim BBK (25.10.2026) – hebt D-092 auf
Jan hat am selben Tag entschieden, NINA ganz von der Seite zu nehmen („Nina von der Seite“), statt beim BBK eine Warnmultiplikatoren-Vereinbarung anzufragen. Hintergrund: Die Schnittstelle hinter warnung.bund.de ist laut BBK keine offizielle Schnittstelle, Weiterverbreitung nur mit Vereinbarung (siehe D-087, D-092). Umsetzung: Abruf, Anzeige, Tests und Texte raus; Migration `0021_nina_entfernen.sql` löscht übernommene Meldungen und lässt nur noch den Anbieter „dwd“ zu. Bleibt: DWD-Warnungen (CC BY 4.0) und die klickbare Warnkarte (Wetter ab Stufe 2). Die Seite nennt NINA nicht mehr; der allgemeine Hinweis auf Durchsagen der Behörden, Cell Broadcast, Radio und Sirenen bleibt. Wer NINA später wieder einbinden will, braucht vorher die Vereinbarung mit dem BBK (Warnmultiplikatoren@bbk.bund.de) – dann als neue Entscheidung.

