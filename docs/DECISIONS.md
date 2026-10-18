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

## D-008 · Chat Ende-zu-Ende-verschlüsselt über eigenen Matrix-Server – ANNAHME (18.10.2026)
Eigene Synapse-Instanz nur für Kinder Deutschlands (nicht die vorhandene auf dem Server), eigene Oberfläche. Moderation privater Chats nur über gemeldete, vom Meldenden freigegebene Inhalte. Wird mit Abschnitt 4 endgültig festgelegt. Jan hat nicht widersprochen.

## D-009 · TURN auf demselben Server – ANNAHME (18.10.2026)
UDP 10000 und 40000–40100 sind bereits belegt (Jitsi, MiroTalk). TURN bekommt einen eigenen freien Bereich, Festlegung in Abschnitt 7.

## D-010 · E-Mail über den Plesk-Mailserver – ANNAHME (18.10.2026)
Absender z. B. `noreply@` der späteren Domain. SMTP-Zugang nur als Portainer-Umgebungsvariable.

## D-011 · Designrichtung „Wimpel & Watt“ (18.10.2026)
Kühles Nordsee-Grau-Grün, tiefes Seegrün als Schrift, Tonnengelb als einziger Signalakzent; Schriften Bricolage Grotesque (Überschriften) und Atkinson Hyperlegible Next (Text, gut lesbar), selbst gehostet. Markenzeichen: der Wimpel (Bezug zum Kinderwagenwimpel mit QR-Kontakt).

## D-013 · Neue Gestaltung „Wimpelkette“ – ersetzt die Farbwelt aus D-011 (18.10.2026)
Rückmeldung Jan: erste Fassung zu leer und blass. Neu: Tiefsee-Navy als Schrift und Nachtgrund, Wimpelfarben Tonnengelb, Leuchtturmrot (Roter Sand), Wattgrün, Himmelblau – in beiden Modi gleich wie bedrucktes Material. Startseite mit Wimpelkette (einzige inszenierte Bewegung, respektiert reduzierte Bewegung), Kinderwagen-Illustration, Familien-ID als Wimpel-Etikett mit echtem QR-Code, Modul-Postkarten mit ehrlichem Bauabschnitt, schematischer Karte der Startregion, „Was wir nicht machen“. Desktop: Kopfleiste statt Seitenleiste; mobil: Kopfleiste + Tab-Leiste. Schriften bleiben (Bricolage jetzt mit schmaler Laufweite für Überschriften). Alle Illustrationen sind eigenes SVG, keine fremden Bilder.

## D-012 · Regionen nach amtlichem Regionalschlüssel (18.10.2026)
Schlüssel = ARS/AGS (Land 2-stellig, Kreis 5-stellig, Gemeinde 8/12-stellig), Wurzel `de`. Bremen-Stadt `04011` und Bremerhaven `04012` sind kreisfreie Städte im Land Bremen `04` – damit sind Land, Stadt und Bremerhaven klar getrennt (M05). Vollständiger Bestand und Geometrien nur aus amtlicher Quelle per Import, nicht von Hand.
