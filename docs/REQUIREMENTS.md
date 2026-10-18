# REQUIREMENTS – verbindlicher Masterprompt

> Unverändert übernommen (Stand 18.10.2026). Verbindlich. Keine Anforderung wird stillschweigend gestrichen.
> Abweichungen, Stufungen und Entscheidungen stehen in DECISIONS.md und ROADMAP.md.

```text
MASTERPROMPT: KINDER DEUTSCHLANDS
Vollständiger Projektauftrag aus unserer Ideensammlung

0. DEIN AUFTRAG – ZUERST PLANEN, NOCH NICHT BAUEN

Du bist mein Lead-Entwickler, Softwarearchitekt, Produktdesigner und technischer Projektleiter für „Kinder Deutschlands“. Behandle dieses Dokument als zusammenhängendes Pflichtenheft, nicht als lose Auswahl optionaler Ideen.

WICHTIG: In deiner ersten Antwort noch keinen Code schreiben, keine Projektdateien erzeugen, nichts installieren und keine Serveränderungen vornehmen. Zuerst Machbarkeit, Architektur, Datenversorgung, Design und Installation klären. Erst nach meinem ausdrücklichen „Bauen“ beginnt die Umsetzung. Öffentliche Dokumentation darfst du zur Prüfung recherchieren.

Deine erste Rückmeldung soll kurz und konkret sein. Der Auftrag selbst ist bewusst ausführlich, damit keine unserer gesammelten Funktionen verloren geht. Nicht wieder das gesamte Pflichtenheft nacherzählen. Kritische Widersprüche benennen, eine klare Empfehlung geben und nur wirklich blockierende Fragen stellen.

Unterscheide verbindliche Zielanforderungen, vorgeschlagene Bauabschnitte, externe Abhängigkeiten und offene Entscheidungen. Streiche keine Anforderung stillschweigend. Ein gestufter Aufbau ist erlaubt, eine dauerhaft zusammengekürzte Ersatzplattform nicht.

Ziel ist eine echte Anwendung mit Backend, Datenbank und funktionierenden Abläufen, keine reine Frontenddemo.


1. VISION, ZIELGRUPPE UND GRUNDPRINZIPIEN

Kinder Deutschlands wird ein hochwertiges, geschütztes Familiennetzwerk: Eltern und andere erwachsene Sorgeberechtigte verbinden sich miteinander, finden Hilfe und regionale Angebote und organisieren ihren Familienalltag.

Es ist weder nur ein Elternforum noch eine Sammlung statischer Ratgeber. Community, private Kommunikation, Familienkarte, Veranstaltungen, Marktplatz und Informationsdienst greifen ineinander.

Startfokus: Bremen und Niedersachsen. Die geografische und technische Struktur soll ganz Deutschland unterstützen. Lokale Communities werden gezielt aktiviert, statt tausende leere Unterforen zu erzeugen.

Grundsätze:
- Kontakt ohne Weitergabe von Telefonnummer, E-Mail oder Wohnanschrift.
- Erwachsene Konten; keine öffentlichen Kinderprofile und kein Zwang, Namen oder genaue Geburtsdaten von Kindern anzugeben.
- Privatsphäre mit sicheren Voreinstellungen und verständlichen Freigaben.
- Bereits ohne große Community durch echte importierte Orts- und Angebotsdaten nützlich.
- Automatisierte Datenversorgung, Anbieterpflege und Community-Ergänzungen statt vollständiger Handarbeit.
- Keine erfundenen Mitglieder, Bewertungen, Erfahrungen, freien Plätze oder Aktivitätszahlen.
- Gesellschaftlicher Nutzen und transparente Finanzierung ohne Verkauf sensibler Familieninformationen.


2. DESIGN: PREMIUM-WEBANWENDUNG, KEINE 08/15-SEITE

Ich will eine außergewöhnlich gute Webseite auf dem technischen und gestalterischen Stand von 2026. Recherchiere aktuelle Möglichkeiten, aber verwende nur sinnvoll wartbare Technik. „Modern“ bedeutet nicht, unnötig viele Bibliotheken einzubauen.

Entwickle eine eigenständige visuelle Identität: hochwertige Typografie, klare Hierarchien, sorgfältige Abstände, charakteristische Komponenten und freundliche, erwachsene Gestaltung. Kein austauschbares Dashboard-Template, keine generische Landingpage mit funktionslosen Kacheln.

90 % mobile Nutzung, 10 % Desktop. Smartphone-Bedienung muss sich wie eine hochwertige App anfühlen: kurze Wege, große Touch-Ziele, einhändige Navigation, passende Bottom-Sheets, schnelle Suche, Filter-Chips, gute Kartenbedienung und sinnvolle Microinteraktionen. Animationen sparsam, mit Rücksicht auf reduzierte Bewegung.

Die Hauptnavigation bleibt einfach, beispielsweise Entdecken, Karte, Community, Nachrichten, Profil. Marktplatz, Hilfe und Veranstaltungen sind leicht erreichbar, aber nicht 24 gleichberechtigte Hauptmenüpunkte. Begründe deine bessere Struktur, falls du eine andere vorschlägst.

Hell, Dunkel und Systemeinstellung übernehmen gelten durchgängig: Mitgliederbereich, Anmeldung, Profile, Kartenoberfläche, Editor, Dialoge, Admin, Moderation und Diagramme. Persönliche Auswahl merken; kein helles Aufblitzen beim Start. Warnungen niemals nur farblich unterscheiden.

Barrierefreiheit, Tastaturbedienung, Screenreader, verständliche Fehlermeldungen, Ladezustände und ehrliche leere Zustände mitplanen. Oberfläche zunächst Deutsch; weitere Sprachen und einfache Sprache sinnvoll vorbereiten.

Prüfe eine installierbare PWA mit Web-Push, Kamera/QR, Standort und Betriebssystem-Teilen. Benenne reale Einschränkungen auf iOS, Android und Desktop. Nicht jede native App-Funktion ungeprüft als Browserfunktion versprechen.


3. VOLLSTÄNDIGER FUNKTIONSKATALOG

M01 – MITGLIEDER-ID, PROFILE, QR-KONTAKTE

Jedes erwachsene Mitglied erhält eine eigene öffentliche Kontakt-ID. „Familien-ID“ ist ein Arbeitstitel, kein Kinderkonto. Mein bevorzugtes Prinzip sind ID-Nummern statt Klarnamen als Kontaktadresse. Prüfe eine gut eingebbare, nicht fortlaufende und gegen massenhaftes Durchprobieren geschützte ID. Technische Konto-ID, Kontakt-ID und widerrufbarer QR-Token werden getrennt.

Die Registrierungs-E-Mail dient intern Anmeldung, Wiederherstellung und gewünschten Benachrichtigungen. Sie erscheint nicht im Profil. Anzeigenamen sind optional; die eindeutige Kontaktaufnahme funktioniert über die ID. Passkeys und zusätzlichen Kontoschutz als komfortable Anmeldeoptionen prüfen.

QR-Code auf dem Handy und auf einem Kinderwagenwimpel, Anhänger oder einer Kontaktkarte. Scannen öffnet nur die freigegebene Kontaktansicht, nicht automatisch ein Vollprofil. Externe sehen standardmäßig keine privaten Angaben. Für Kontaktanfragen kann eine Anmeldung erforderlich sein. QR-Codes sind deaktivierbar/ersetzbar; temporäre Begegnungscodes mitdenken.

Freigaben getrennt für Externe, Mitglieder, bestätigte Kontakte und einzelne Gruppen. Einfache Datenschutzprofile plus Detailoptionen. Funktion „So sehen andere mein Profil“.

Exakte ID-Suche und freiwillige interne Entdeckung nach grober Region/Interessen, keine öffentlich auslesbare Mitgliederdatenbank. Suchbegrenzung, Blockieren und Kontaktanfragen. Profilfelder wie „Ich kann helfen“, „Ich suche“, Interessen und freiwillige Altersgruppen der Kinder.


M02 – KOMMUNIKATION OHNE EXTERNE KONTAKTDATEN

Private Direktnachrichten, Gruppenchats, Bilder, Dateien, Links und Sprachnachrichten. Kontaktanfragen annehmen/ablehnen, blockieren und melden. Audio- und Videoanrufe gehören zum Zielumfang.

Ein „Ruf mich an“ funktioniert innerhalb der Plattform, ohne Telefonnummer. Keine eigene öffentliche Mailbox erforderlich; interne Nachrichten ersetzen die Weitergabe von E-Mail-Adressen.

Benachrichtigungen, Stummschalten und Ruhezeiten; Lesebestätigungen und Online-Status nur bewusst freigeben. Geräte- und Sitzungsverwaltung vorsehen.

Entscheide die Verschlüsselungsarchitektur früh. Kein pauschaler Admin-Lesezugriff. Bei Ende-zu-Ende-Verschlüsselung Meldungen, Suche, Gerätewechsel, Wiederherstellung und Moderation passend planen; keine widersprüchlichen Versprechen.


M03 – REGIONALE UND THEMATISCHE COMMUNITY

Struktur: Deutschland, Bundesländer, Landkreise/kreisfreie Städte, Gemeinden und Stadtteile. Landeshauptstädte nicht als künstliche Zwischenebene für alle Orte verwenden.

Regionen und Themen unabhängig abonnieren; mehrere Regionen gleichzeitig möglich. Persönlicher Feed statt identischer Diskussionen in hunderten Unterforen.

Boards mit Beiträgen, Antworten, Medien, Suche, Schlagworten, Lesezeichen, Umfragen und markierbaren hilfreichen Antworten. Anheften, schließen, archivieren, verschieben und moderieren. Themen unter anderem Erziehung, Kinderarzt-Erfahrungen, Betreuung, Alleinerziehende, Produkte und lokale Hilfe.


M04 – GESCHÜTZTE GRUPPEN UND VERTRAUEN

Offene interne Themenräume, Gruppen mit Beitrittsanfrage und besonders geschützte Räume unterscheiden. Beispiel: Alleinerziehende, Trennung oder belastende Familiensituationen.

Nichtmitglieder sehen keine geschützten Beiträge oder Mitgliederlisten. Gruppenpseudonyme sollen nicht automatisch mit dem normalen Profil verknüpfbar sein. Gruppenmitgliedschaften erscheinen nicht ungefragt in Suche, Profil oder Karte.

Datensparsame Aufnahmeprüfung durch zuständige Moderation/Partner konzipieren. „Tatsächlich alleinerziehend“ lässt sich nicht allein mit einer Checkbox garantieren. Keine unnötigen Ausweis- oder Familienakten sammeln und keine absolute Sicherheit gegen eingeschleuste Personen behaupten.


M05 – FAMILIENRADAR: PERSÖNLICHE ABONNEMENTS

Regionen, Themen, Einrichtungen, Veranstaltungen und einzelne Orte abonnieren. Laufend neue Inhalte im Portal, Benachrichtigungshäufigkeit davon getrennt.

Festgehaltenes Beispiel: Bremen; Themen Familienleistungen & Vergünstigungen, Kita/Betreuung/Elternkurse, Beratung/Jugendhilfe/Selbsthilfe, Veranstaltungen/Ferienangebote, Gesundheit/Entwicklung. Benachrichtigung wöchentlich. In der Regionsauswahl Land Bremen, Stadt Bremen und Bremerhaven klar unterscheiden.

Wöchentliche Zusammenfassung ohne Dubletten, mit Quellen, Datum, Fristen und Links. Plattforminterne Übersicht; E-Mail und Push freiwillig. Sofortmeldungen nicht heimlich hinzufügen. Ereignisbezogene Erinnerungen separat aktivieren.

Abonnements bleiben privat. Mehrere unabhängige Filterprofile, leichtes Pausieren/Kündigen und Vorschau der Auswahl. Sensible Interessen nicht in Push-Vorschauen auf dem Sperrbildschirm verraten.


M06 – TREFFEN, TEMPORÄRE RÄUME UND LIVE-STANDORT

Kinderwagenspaziergänge, Spielplatztreffen und spontane Kontaktgruppen. Ein temporärer Raum wird per QR geteilt; Ablaufdatum und Umwandlung in dauerhafte Gruppe möglich. Das Ablaufdatum beendet den Zugang; die tatsächliche Lösch-/Aufbewahrungsregel muss klar benannt werden.

Treffpunkt-Pin und Live-Standort sind getrennt. Standort nur freiwillig für ausgewählte Personen oder Teilnehmer, sichtbar aktiv, zeitlich begrenzt und sofort stoppbar. Beispiel: 15, 30 oder 60 Minuten. Gegenseitige Freigabe nur bei Zustimmung beider Personen.

Keine öffentliche Anzeige anwesender Familien, keine versteckte Dauerortung und keine allgemeine Admin-Karte mit Bewegungsprofilen.


M07 – SOCIAL-MEDIA-LINKS UND BEITRAGSEDITOR

Instagram, TikTok, Facebook, YouTube und sonstige Weblinks unkompliziert in Boards teilen, nach Möglichkeit direkt aus dem Handy-Teilen-Menü.

Standard: datenschutzfreundliche Linkkarte ohne automatisches Laden fremder Tracker/Player. Offizielle Einbettung erst nach bewusster Aktivierung. Quellenherkunft zeigen; gelöschte, private oder nicht einbettbare Inhalte erhalten einen ehrlichen Fallback.

Diskussion findet bei uns statt; keine eigene Fernsteuerung von Likes/Kommentaren auf Instagram usw. Anbieter-Player können eigene Bedienelemente enthalten: Plattformbedingungen beachten statt unzulässig manipulieren.

Editor mit Text, Bildern, Links, Kennzeichnungen und Vorschau. Keine fremden Videos einfach herunterladen oder Inhalte privater Drittprofile übernehmen. URL-Verarbeitung gegen Schadlinks und serverseitigen Missbrauch absichern.


M08 – AFFILIATE-FINANZIERUNG DES BETREIBERS

Die spätere Entscheidung ersetzt die ursprüngliche Idee eigener Affiliate-Links der Mitglieder: Mitglieder teilen normale Produktlinks; zulässige Affiliate-Einnahmen sollen an Kinder Deutschlands gehen.

Amazon-Links erkennen und gegebenenfalls automatisch mit der Plattform-Partnerkennung versehen. Beispielsweise per Linkmodul und optional n8n. Ursprungslink, Verarbeitung und Kennzeichnung nachvollziehbar halten.

Beim Verfassen und am angezeigten Link transparent machen, wer profitieren kann. Vorhandene fremde Affiliate-Kennungen nicht heimlich überschreiben, sondern eine klare Regel und einen sichtbaren Ablauf vorsehen. Private Chats und sensible Gruppen nicht monetarisieren.

Aktuelle Amazon-/Partnerbedingungen für geschlossene Bereiche, Apps/PWA, Linkumwandlung, Bilder und Produktdaten prüfen. Keine pauschale Einnahme pro Klick behaupten; Provision nur entsprechend dem tatsächlichen Programm. „Kein Mehrpreis“ nicht ungeprüft garantieren.

Datenschutz nicht für Amazon aufgeben. Keine privaten Beiträge nur zur Partnerprogramm-Zulassung öffentlich machen. Andere Programme später anschließbar; Werbung/Anbieterbeiträge klar von neutralen Erfahrungen trennen.


M09 – FAMILIEN-MARKTPLATZ

Kaufen, verkaufen, tauschen und verschenken. Kategorien wie Kinderwagen, Kleidung, Spielzeug, Bücher, Fahrräder und Ausstattung. Bilder, Beschreibung, Preis, Zustand, grobe Region, Suche/Filter, Umkreis, Merkliste und Suchbenachrichtigungen.

Kontakt über ID und internen Chat. Status verfügbar, reserviert, abgegeben/verkauft, abgelaufen. Übergabeort privat vereinbaren, keine öffentliche Wohnanschrift. Massenanzeigen, Betrug und unzulässige Angebote melden/moderieren.

Zunächst kein eigenes Bezahl-, Versand- oder Treuhandsystem notwendig. Regeln für gewerbliche Anbieter und sicherheitsrelevante Kinderprodukte gesondert klären. Keine Anzeigen anderer Portale ohne Erlaubnis kopieren.


M10 – GEMEINSAME FAMILIENKARTE UND REGIONALE ABDECKUNG

Eine gemeinsame geografische Grundlage mit Ebenen für Mitglieder, Spielplätze, Familienorte, Hilfe, Veranstaltungen, Marktplatz und Routen. Karten-/Listenwechsel, Umkreissuche, Filter und Marker-Gruppierung.

Mitglieder standardmäßig unsichtbar; freiwillig grobe Stadt/Gemeinde/Stadtteil. Keine genaue Privatadresse zur Teilnahme erforderlich. Freigegebene Kontaktkarte statt offenem Familien-Dossier.

Abdeckung separat: Mitglieder nach freiwilliger Wohnregion, Abonnenten einer Region und tatsächliche Aktivität unterscheiden. Ein Bremen-Abonnent wohnt nicht automatisch dort. Einzigartige Konten zählen, Mehrfachabonnements korrekt behandeln.

Öffentliche/interne Community-Abdeckung und genauere Admin-Auswertung getrennt planen. Kleine Gruppen und sensible Filterkombinationen schützen; grobe Zahlenklassen statt identifizierbarer Mini-Gruppen. Keine Wohnpunkte für Statistiken veröffentlichen.


M11 – SPIELPLATZKARTE

Standort/Adresse, Fotos, Text- und Sternebewertungen, Ausstattung, Altersgruppen, Schatten, Bänke, Toiletten, Einzäunung, Wasserspiel, Kinderwagenzugang und inklusive Ausstattung.

Strukturierte Merkmale plus Freitext. Neue Spielplätze hinzufügen, Dubletten prüfen, Fehler melden, favorisieren und Änderungen abonnieren. Quelle, Aktualität und Bestätigungsstatus anzeigen.

Defekte und Sperrungen als Nutzerhinweis oder amtlich bestätigte Meldung unterscheiden. Nutzerbewertungen sind keine Sicherheitszertifikate. Community-Treffen am Spielplatz anschließbar.


M12 – VERANSTALTUNGEN UND FAMILIENAKTIVITÄTEN

Eigener Bereich mit Liste, Kalender, Karte und Detailseiten. Kinderflohmärkte, Feste, Kurse, Workshops, Ferienprogramme, Vereinsangebote und private Treffen.

Ort, Beginn/Ende, Altersbereich, Kosten, Vergünstigungen, Zugänglichkeit, Veranstalter, Quelle und Aktualität. FreiKarte-Akzeptanz nur anzeigen, wenn bestätigt.

Wiederkehrende Termine mit Einzelabsagen, Fristen, Kapazität soweit bekannt, Warteliste soweit unterstützt, Merken und Kalenderexport. „Ich bin interessiert“ nicht mit einer verbindlichen externen Buchung verwechseln.

Importierte Termine, bestätigte Anbietertermine und private Treffen unterscheiden. „Öffentlich“ eindeutig definieren: im Netzwerk sichtbar ist nicht automatisch im offenen Internet sichtbar. Teilnehmerlisten privat voreinstellen.

„Wer kommt mit?“ für gemeinsame Besuche mit Event-Chat. „Was machen wir heute?“ als einfache Suche nach Ort, Datum, Alter, drinnen/draußen und Budget.


M13 – FAMILIENFREUNDLICHE ORTE

Wickelräume, Toiletten, Stillmöglichkeiten, Familiencafés, Spielecken und Ausflugsorte mit Ausstattung, Zugang, Öffnungszeiten soweit bekannt, Fotos und Erfahrungen. Gemeinsames Ortsmodell statt separater Dateninseln.


M14 – KINDERWAGENFREUNDLICHE ROUTEN

Spazierwege mit Distanz, Untergrund, Steigung, Treppen, Rastplätzen und Spielplätzen. Nur nutzungsberechtigte Routendaten. Keine privaten Bewegungsverläufe oder Wohnstartpunkte ungefragt veröffentlichen. Keine automatische Garantie von Sicherheit oder Barrierefreiheit.


M15 – LEBENSLAGEN-KOMPASS

Einstiege wie Schwangerschaft, Geburt, Kita-Start, Schule, Trennung oder finanzielle Schwierigkeiten. Passende Checklisten, offizielle Informationen, Beratungsstellen und geschützte Gruppen. Sensible Auswahl nicht automatisch dauerhaft speichern oder für Werbung auswerten.


M16 – FAMILIEN HELFEN FAMILIEN

„Ich brauche Hilfe“ und „Ich kann helfen“: Erfahrung mit Anträgen, Alltagsorganisation, Kleidung, Kontakten und lokalen Angeboten. Professionelle Beratung von privaten Erfahrungen unterscheiden. Fremden-Kinderbetreuung nicht ungeprüft wie einen einfachen Tauschdienst vermitteln. Akute Krisen an geeignete offizielle Stellen verweisen, nicht den eigenen Chat als Notfalldienst darstellen.


M17 – FREIE PLÄTZE UND KURSE

Anbieter melden verfügbare Plätze in Elternkursen, Babyschwimmen, Ferienprogrammen oder Betreuung. Zeitstempel, Gültigkeit und erneute Bestätigung. Fehlende Informationen bedeuten „Verfügbarkeit unbekannt“, nicht „frei“. Anbieter-/Kategorienabos und Wartelisten nur entsprechend tatsächlicher Daten und Zuständigkeit.


M18 – MERKLISTEN, KALENDER UND ERINNERUNGEN

Veranstaltungen, Orte, Angebote und Anmeldefristen merken, in den eigenen Kalender übernehmen und freiwillige Erinnerungen erhalten. Kein vollständiger privater Familienkalender auf unseren Servern erforderlich.


M19 – WISSEN AUS DER COMMUNITY

Gelöste Fragen, Produkterfahrungen und Link-/Videosammlungen auffindbar machen. Redaktionell geprüfte Wissenseinträge mit Quellen und Prüfdatum. Geschützte Diskussionen nicht ungefragt in öffentliche Ratgeber umwandeln; Zustimmung und Sichtbarkeit respektieren.


M20 – REGIONALE ÄNDERUNGEN UND HINWEISE

Neue Leistungen, FreiKarte-Regeln, Spielplatzsperrungen, Kursabsagen oder geänderte Zeiten. Neue Artikel, aktualisierte Bestandsseiten, Absagen und Fristen unterscheiden. Amtlich bestätigt, Anbieterinformation und ungeprüfter Nutzerhinweis klar kennzeichnen. Nicht jede Änderung als dringende Push-Nachricht ausspielen.


M21 – KINDERGEBURTSTAGE UND PRIVATE EINLADUNGEN

Ideen, regionale Veranstaltungsorte und Angebote. Private Einladungen, Zu-/Absagen und Organisator-Chat. Namen, Geburtsdaten, Gästelisten und private Adressen nicht öffentlich machen. Einladungslinks brauchen passende Zugangsbegrenzung und Widerruf.


M22 – VERIFIZIERTE EINRICHTUNGEN UND PARTNER

Organisationsprofile für Familienzentren, Jugendhilfe, Kommunen, DRK, SOS-Kinderdorf, Beratungsstellen, Vereine und Veranstalter. Angebote, Termine, Kontakte und Neuigkeiten pflegen; Mitglieder können folgen.

Importierten Einrichtungseintrag nach Berechtigungsprüfung übernehmen. Mehrere berechtigte Mitarbeiter und saubere Vertretungswechsel. Verifizierung bestätigt die Organisationszuordnung, nicht automatisch die Qualität jedes Angebots. Anbieter erhalten keine Listen sensibler Interessen ihrer Abonnenten.


M23 – AUTOMATISIERTE DATENVERSORGUNG UND DATENQUALITÄT

Das Projekt darf nicht an leerem Inhalt oder vollständig manueller Pflege scheitern. Grundbefüllung durch rechtmäßig nutzbare Daten, danach gezielte Community-Ergänzungen und Anbieterpflege.

Je Quelle RSS/Atom, API, strukturierter Export, Open Data, ICS oder ausdrücklich erlaubte Seitenänderungsprüfung. Newsletter sind keine automatische Wiederveröffentlichungslizenz. Nicht einfach Google Maps oder fremde Verzeichnisse kopieren.

Quellenkatalog: Betreiber, Regionen, Themen, Format, Zugang, Nutzungsrechte, Aktualisierungsrhythmus, letzter Erfolg, Fehler, Zuverlässigkeit und Kontakt. Jeder importierte Eintrag behält Herkunft, externe ID und Prüfzeitpunkte.

Dubletten zusammenführen, Ortsdaten normalisieren, abgelaufene Termine entfernen/archivieren und Änderungen erkennen. Manuelle oder verifizierte Anbieter-Korrekturen nicht beim nächsten Import blind überschreiben. Vorschau, Freigabe, nachvollziehbare Zusammenführung und Wiederholbarkeit vorsehen.

n8n ist eine mögliche Automatisierungszentrale, keine Pflicht für jeden Prozess. Große Geodatenmengen und Kernlogik gegebenenfalls in eigenen Importdiensten. Wiederholungsversuche, Limits, Fehlerwarteschlangen und Monitoring planen. Keine privaten Chats an externe KI-/Automatisierungsdienste schicken.

Prüfkandidaten aus der Ideensammlung, NICHT bereits zugesicherte Schnittstellen:
- OpenStreetMap/Geofabrik, kommunale Open-Data-Portale, GovData und Niedersachsen Hub.
- familiennetz bremen, Senatspressestelle, Amt für Soziale Dienste, Gesundheitsamt/TippTapp, Kita-Portal, FreiKarte, bremen.de/WFB und Familienportal Bremerhaven.
- DRK Bremen, passende niedersächsische Landes-/Kreisverbände, SOS-Kinderdorf Bremen und Worpswede/Osterholz.
- Familien in Niedersachsen, Landesinformationen, ANNE hilft/Region Hannover und kommunale Familien-/Frühe-Hilfen-Angebote in Oldenburg, Osnabrück, Braunschweig, Lüneburg und Osterholz.
- Selbsthilfekontaktstellen, Selbsthilfe-Büro Niedersachsen, NAKOS und regionale Angebote in Bremen/Bremerhaven.
- Familienportal des Bundes, zuständiges Bundesministerium und klicksafe.

Für jede Quelle Verfügbarkeit, tatsächlichen Umfang, Lizenz, Kosten und Aktualität neu prüfen. Bereits diskutierte RSS-/API-Möglichkeiten nicht als bewiesene Anbindung behandeln.

Grunddaten können ohne Bewertungen starten: „Noch keine Erfahrungen“ ist ehrlich. Marktplatz und Diskussionen brauchen echte Menschen; wenige aktive Räume statt einer Fassade aus leeren Bereichen. Import-/Testdaten klar von Produktion trennen.


M24 – GROSSES ADMIN-, MODERATIONS- UND REDAKTIONSCENTER

Drei rollenbasierte Arbeitsbereiche innerhalb desselben Systems: Plattformadministration, Moderatoren-Cockpit und Daten-/Redaktionszentrale. Besonders am Desktop hervorragend nutzbar, für dringende Aufgaben auch mobil.

Admin-Startseite zeigt Systemzustand, wichtige Kennzahlen, offene Aufgaben, Sicherheitswarnungen, problematische Importe, neue Meldungen und Entscheidungen. Anpassbare Kacheln, globale berechtigungsgeprüfte Suche und direkte Aktionen.

Verwaltungsbereiche:
Nutzer; Rollen/Rechte; Regionen/Chapter; Boards/geschlossene Gruppen/Räume; Beiträge/Medien; Meldungen; Spielplätze/Familienorte/Routen; Veranstaltungen; Marktplatz; Einrichtungen; Familienradar; Quellen/Importe/n8n; Affiliate; Kommunikationstechnik; Datenschutz/Sicherheit; System/Design/Module.

Rechte als Kombination aus Rolle, Geltungsbereich und Aktion, optional befristet. Ein Mitglied kann mehrere Aufträge haben: Moderator Bremen und Themenmoderator Kinderwagen bundesweit. Regionale Rechte eindeutig vererben/begrenzen; geschützte Gruppen nicht automatisch jedem Regionalmoderator öffnen.

Rollen unter anderem Betreiber/Superadmin, Technikadministrator, globale/regionale/thematische Moderation, Datenredaktion, Organisationsverwaltung und Mitglied. Server prüft jede Berechtigung. Ein verborgenes Menü ist keine Zugriffssicherung. Vorschau der effektiv vergebenen Rechte, Entzug, Ablauf und Protokollierung.

Moderatoren sehen eine Warteschlange automatisch markierter und von Menschen gemeldeter Inhalte sowie weitere Beiträge im erlaubten Zuständigkeitsbereich. Filter nach Region, Inhaltstyp, Priorität, Grund, Alter und Bearbeitungsstatus. Fall übernehmen/zuweisen, Kontext sehen, interne Notiz, Entscheidung und Begründung.

Aktionen: freigeben, kennzeichnen, ausblenden, entfernen, wiederherstellen, verschieben, zusammenführen, schließen, archivieren. Beiträge, Medien, Bewertungen, Anzeigen und Räume verwalten. Verwarnen, zeitweise einschränken, sperren und eskalieren entsprechend der Rechte.

Automatische Markierung für Spam, problematische Links, Beleidigungen, Drohungen, mögliche private Daten, auffällige Bilder und Betrugsverdacht. Fehlalarme einplanen. Komplexe Fälle nicht automatisch endgültig entscheiden. Verschlüsselte Chats nicht nebenbei serverseitig durchsuchen; gemeldete Inhalte gezielt behandeln.

Keine privaten Inhalte versehentlich in öffentliche Bereiche verschieben. Inhaltliche Änderungen fremder Beiträge nicht heimlich vornehmen. Beweissicherung, Ausblenden, reguläres Löschen und endgültige Löschung unterscheiden. Einsprüche, Wiederherstellung soweit zulässig und dokumentierte Eskalation.

Massenaktionen mit Vorschau, Bestätigung und angemessenen Sicherungen. Kritische Rechte-/Löschaktionen gegebenenfalls zweite Freigabe. Geschütztes Audit-Protokoll: wer, wann, was, warum. Keine unnötigen privaten Inhalte in Logs kopieren.

Datenzentrale: Quellenstatus, letzter Abruf, neue/geänderte Einträge, Dubletten, Fehler, Vorschau, erneuter Import, Pausieren und Freigaberegeln. Aufgaben an Redakteure zuweisen, Aktualität und unveröffentlichte Prüffälle überblicken.

Statistiken mit Zeitraum, Vergleich und zulässigen Regionsfiltern:
- Registrierungen, aktive Mitglieder, Rückkehr, Kontodeaktivierungen.
- Wohnregionen, Regionalabos, aktive Chapter und Abdeckung.
- Beiträge, Antworten, hilfreiche Antworten und funktionierende Gruppen.
- Technische Chat-/Anrufkennzahlen ohne Inhaltsüberwachung.
- Moderationsaufkommen, Warte-/Bearbeitungszeit, Gründe und korrigierte Entscheidungen.
- Orte, Datenvollständigkeit, Bewertungen und Aktualität.
- Veranstaltungsaufrufe, Merken, Zusagen/Buchungsweiterleitungen soweit messbar.
- Anzeigen, Kategorien und gemeldete Abschlüsse, nicht erfundene Verkaufserfolge.
- Familienradar-Nutzung und Zustellung, keine heimliche Profilbildung.
- Quellenfehler, Dubletten, veraltete Inhalte und Importabdeckung.
- Affiliate-Klicks, vom Partner gemeldete Käufe, vorläufige/bestätigte/stornierte Provisionen und Auszahlungen.
- Betriebskosten, Speicher, Performance, Fehler, Verfügbarkeit und Backup-Status.

Kennzahlen klar definieren. Keine „Statistik für alles“ als Erlaubnis für sensible Einzelpersonenprofile verstehen. Geschützte Interessen, Privatadressen und Live-Wege bleiben aus allgemeinen Dashboards heraus.

Zusätzlich: Module pro Region aktivieren, Wartungsmodus, regionale Systemmitteilungen, Supportfälle, Rollenaufgaben, Warnungen und Betreiberberichte/Exporte. Keine notwendige Infrastruktur mit öffentlichen oder unsicheren Admin-Endpunkten betreiben.


4. DATENSCHUTZ, SICHERHEIT UND RECHTLICHE PRÜFPUNKTE

Datenschutz ist ein zentrales Produktmerkmal, nicht ein späteres Cookie-Banner.

Trenne öffentliche Projekt-/Informationsseiten von internen Mitgliederinhalten. Offizielle, zur Veröffentlichung freigegebene Orts-/Anbieterdaten können einen anderen Sichtbarkeitsstatus haben als private Fotos und Beiträge. Kein ungefragtes Veröffentlichen privater Daten für SEO oder Affiliate-Zwecke.

Profile, Gruppen, Chats, private Medien und deren Vorschaubilder brauchen serverseitige Zugriffskontrolle auch beim direkten URL-Aufruf. robots.txt/noindex ergänzen das, ersetzen es aber nicht. Medien nicht in offen erreichbare Upload-Verzeichnisse legen. Cache, Suche, Exporte und Benachrichtigungen müssen die gleichen Rechte beachten.

Keine Garantie „Bilder können niemals hinausgelangen“: Berechtigte Empfänger können kopieren oder fotografieren. Das ehrlich kommunizieren. Private Weitergabe nicht durch öffentliche Teilen-Links erleichtern.

Kinderbilder besonders schützen: vorzugsweise Anlagen statt fremder Kinder fotografieren, Metadaten entfernen, Unkenntlichmachen ermöglichen, schnelle Meldung und geschützte Verarbeitung. Automatische Gesichtserkennung nicht als verlässlichen Ersatz für Regeln und menschliche Prüfung verkaufen.

Mehrfaktorschutz für Administration, sichere Wiederherstellung, Sitzungswiderruf, Rate-Limits, rollenbasierte Exporte, abgesicherte Uploads, Linkvorschauen und Hintergrundjobs. Geheimnisse nicht ins Frontend oder ZIP schreiben. Protokolle datensparsam und zugriffsgeschützt.

Ein Administrator kann den Betrieb verwalten, ohne beliebige private Gespräche zu lesen. Notfall-/Sonderzugriffe, soweit überhaupt technisch vorgesehen und zulässig, eng begrenzen und protokollieren. Keine heimliche Entschlüsselungs-Hintertür.

Löschung/Export, Aufbewahrung, Backups und Wiederherstellung zusammen planen. Wiederherstellung darf bereits vollzogene Löschungen nicht unbemerkt rückgängig machen. Beitragserhaltung oder Anonymisierung nach Kontolöschung bewusst regeln.

Prüfe relevante Anforderungen aus Datenschutzrecht, Plattform-/Moderationsrecht, Werbung, Bild-/Datenlizenzen und Barrierefreiheit anhand aktueller Primärquellen. Trenne technische Umsetzung und erforderliche rechtliche Prüfung. Keine pauschale Zusicherung „vollständig DSGVO-konform“.


5. ARCHITEKTUR UND BETRIEB AUF MEINEM PLESK-SERVER

Bekannt: Ich habe einen Plesk-Server mit Docker. Noch unbekannt sind genaue Versionen, Betriebssystem, Ressourcen, Architektur, Zugriffsrechte und eingerichtete Dienste. Frage Bekanntes nicht erneut ab und verlange keine Passwörter im Chat.

Vergleiche Docker/Compose hinter Plesk mit einer direkt unter Plesk betriebenen Lösung. Gib EINE begründete Empfehlung plus kurze Alternative statt einer endlosen Technologieliste. Ein ZIP ist in beiden Fällen das gewünschte Lieferformat, kein Gegenmodell zu Docker.

Wähle nach Wartbarkeit, Datenschutz, Karten-/Suchfunktionen, Echtzeitkommunikation, Updatefähigkeit und einfacher Installation. Modularer Aufbau mit klaren Zuständigkeiten; nicht ohne Grund ein riesiges Microservice-System. Eine hochwertige individuelle Oberfläche darf auf bewährten Komponenten basieren.

Zu prüfen: Frontend, Backend, Datenbank/Geodaten, Authentifizierung, Rechte, Hintergrundjobs, Echtzeitnachrichten, Suche, Medien, SMTP, Kartenanbieter, Push, optional n8n und Anrufinfrastruktur. Audio/Video benötigt eine konkrete Strategie einschließlich möglicher Relay-/TURN-Dienste, Kosten und mobiler Grenzen.

Plane Plesk-Domain/Subdomain, TLS/Reverse Proxy, WebSockets, persistente Daten, interne Ports, Benutzerrechte, Speicherlimits, Neustart, Healthchecks, Zeitsteuerung, Backups und Monitoring. Keine offen erreichbare Datenbank oder ungesicherte n8n-/Admin-Oberfläche.

Standardmäßig selbst betreibbare Kernkomponenten. Verpflichtende externe Konten, Karten-/E-Mail-Dienste, Partnerfreigaben, Lizenzen und laufende Kosten klar benennen. Externe optional angebundene Funktionen müssen deaktivierbar sein, ohne das Kernportal zu zerstören.

Karten- und Open-Data-Lizenzen konkret beachten. Geodaten, Community-Ergänzungen und private Mitgliederdaten bewusst strukturieren. Nicht annehmen, ein Datenimport liefere automatisch Bilder, Bewertungen oder aktuelle Verfügbarkeiten.


6. SPÄTERE LIEFERUNG: EIN ZIP UND EINE EINFACHE EINRICHTUNG

Ziel: ZIP entpacken, notwendige Plesk-Schritte durchführen, geschützten Assistenten öffnen, ersten Admin anlegen, loslegen.

Das ZIP soll enthalten:
- Vollständigen projektspezifischen Quellcode und passende Auslieferungs-/Build-Dateien.
- Gesperrte Abhängigkeitsversionen, notwendige Konfigurationen und Vorlagen ohne Geheimnisse.
- Bei Docker: Dockerfiles/Compose, persistente Volumes und dokumentierte Dienstkonfiguration.
- Datenbankschema/Migrationen und sichere initiale Kategorien, Regionen und Rechte.
- Installationsassistent oder abgesicherten initialen Einrichtungsschritt.
- Kurze Plesk-Anleitung, Start-/Prüfschritte, Backup-/Restore- und Updateanleitung.
- Tests, Lizenz-/Quellenhinweise und Dokumentation aktivierter sowie noch nicht angebundener Funktionen.

Erkläre, welche Container-Images/Abhängigkeiten beim Setup heruntergeladen werden. „Alles im ZIP“ heißt nicht, dass fremde API-Schlüssel, Betriebssystem, TLS-Zertifikate oder externe Datenlizenzen automatisch vorhanden sind. Falls eine echte Offline-Installation gewünscht wäre, wäre das ein eigener Umfang.

Installationsassistent mit Vorabprüfung, Datenbankverbindung/Migration, Plattformadresse, sicherem ersten Admin und optionaler E-Mail-/Dienstkonfiguration. Vor dem ersten Aufruf per einmaligem Setup-Geheimnis oder gleichwertig schützen, damit kein Fremder den Admin zuerst anlegt. Nach Abschluss sperren. Kein Standardpasswort und kein offener Zurücksetzungsweg.

Wiederholbare Installation und Updates ohne Datenverlust. Vor Migrationen Sicherung, Fehler klar melden und Wiederherstellungsweg dokumentieren. Bestehende Daten nicht durch neue Demodaten überschreiben. Testdaten ausdrücklich optional und getrennt.


7. BAUREIHENFOLGE UND FORTSCHRITTSKONTROLLE

Schlage zusammenhängende, betreibbare Bauabschnitte vor. Abhängigkeiten zuerst: Identität/Rechte/Privatsphäre, Regionsmodell, gemeinsames Designsystem, Datenmodell, Installation und grundlegende Administration.

Danach echte Nutzungsstrecken statt isolierter Attrappen: beispielsweise importierter Spielplatz, Detailseite, Favorit, Treffen und erlaubter Kontakt. Datenversorgung früh testen, nicht erst nach Fertigstellung der Oberfläche.

Audio/Video, komplexe Importe oder externe Affiliate-Freigaben dürfen in späteren Abschnitten liegen, bleiben aber im Gesamtplan sichtbar. Kennzeichne pro Modul: vorgesehen, umgesetzt, getestet, extern blockiert. Nichts als fertig melden, nur weil das Menü existiert.

Nach meiner Baufreigabe pflegst du das vollständige Projektwissen in Dateien wie REQUIREMENTS.md, ARCHITECTURE.md, DECISIONS.md, ROADMAP.md und DEPLOYMENT_PLESK.md. Halte auch diese Querschnittsanforderungen fest, nicht nur M01–M24. Damit kann ich in einem neuen Claude-Chat fortsetzen, ohne alles erneut zu erklären.

Am Ende jedes Bauabschnitts: Was funktioniert wirklich, was wurde getestet, was fehlt, was benötigt Freigabe? Keine Hintergrundversprechen und keine behaupteten Tests ohne Durchführung.


8. KONKRETE ABNAHMEKRITERIEN

Die spätere Auslieferung wird an echten Abläufen geprüft:

1. Installation nach Anleitung; sicherer Erst-Admin; Setup danach geschlossen; Neustart und Update erhalten Daten.

2. Ein Mitglied registriert sich, erhält eine ID und entscheidet sichtbar über Auffindbarkeit. E-Mail und private Daten sind von außen nicht abrufbar.

3. QR-Scan zeigt nur die erlaubte Kontaktansicht; Widerruf stoppt den alten Code; Blockierung funktioniert.

4. Zugriff auf private Gruppen/Medien scheitert auch per direktem Link oder API für Unberechtigte. Ein Regionalmoderator erhält nicht versehentlich globale Rechte.

5. Live-Standort erreicht nur freigegebene Personen und endet nach Ablauf/Stoppen. Kein öffentliches Aufenthaltsprotokoll.

6. Ein echter erlaubter Datenimport lässt sich wiederholen, ohne Dubletten oder Verlust bestätigter Korrekturen. Herkunft und Aktualität sind sichtbar.

7. Veranstaltungen unterscheiden Merken, Zusage und externe Buchung; Absagen und wiederkehrende Termine funktionieren.

8. Wochenradar berücksichtigt Region/Themen, verhindert Dubletten und respektiert private Benachrichtigungseinstellungen.

9. Social-Media-Inhalte laden vor Aktivierung keine ungewünschten externen Player. Affiliate-Verarbeitung ist sichtbar und für sensible Räume deaktiviert.

10. Meldung gelangt zur berechtigten Moderation; Entscheidung wird begründet/protokolliert; private Inhalte werden nicht versehentlich veröffentlicht.

11. Hell/Dunkel/System funktioniert über die gesamte Anwendung, inklusive Admin und Dialogen. Mobile Nutzung, Tastaturbedienung, Performance und Fehlerzustände werden getestet.

12. Alle als fertig ausgelieferten Kernaktionen speichern echte Daten und bestehen passende Tests. Keine funktionslosen Hauptbuttons, angebunden wirkenden Dummy-Statistiken oder unbeschrifteten Platzhalter.


9. FORMAT DEINER ERSTEN ANTWORT

Antworte zunächst in etwa 600–900 Wörtern, klar und ohne Werbesprache:

A. Deine konkrete Architektur-/Plesk-Empfehlung und warum Docker oder direkt.

B. Eine eigenständige Premium-Designrichtung mit der mobilen Bedienlogik.

C. Die wichtigsten Risiken/Abhängigkeiten: Daten, Datenschutz, Karten, Echtzeit/Anrufe, Affiliate und Betrieb.

D. Eine kompakte Baufolge, die alle 24 Module und Querschnittsanforderungen zuordnet.

E. Den tatsächlichen Weg vom ZIP zum ersten Admin, einschließlich unvermeidbarer manueller Schritte.

F. Höchstens sechs wirklich blockierende Fragen zu unbekannten Serverdetails oder grundlegenden Entscheidungen. Für Nichtblockierendes sinnvolle Vorschläge machen und Annahmen markieren.

Prüfe relevante aktuelle technische Aussagen anhand offizieller Dokumentation, soweit Webzugriff vorhanden ist. Ohne Webzugriff die ungeprüften Annahmen benennen. Keine erfundenen Schnittstellen, Lizenzfreigaben oder Funktionsgarantien.

Danach STOPP. Kein Code, keine Projektdateien und keine Installation, bis ich ausdrücklich „Bauen“ sage.
```
