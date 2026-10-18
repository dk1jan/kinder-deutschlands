# ROADMAP

Jeder Abschnitt endet betreibbar. Am Ende jedes Abschnitts in CHANGELOG/STATUS: was funktioniert, was getestet ist, was fehlt, was Freigabe braucht.

| Abschnitt | Inhalt | Module |
|---|---|---|
| **0 Fundament** ✔ | Installation/Setup, Designsystem, Hell/Dunkel, Anmeldung + 2FA, Rechte, Regionsmodell, Audit, Basis-Admin, Pipeline | Querschnitt, M24-Basis |
| **1 Mitglieder** ✔ | Registrierung mit E-Mail-Bestätigung, öffentliche Kontakt-ID (nicht fortlaufend, gut eingebbar, gegen Durchprobieren geschützt), widerrufbare QR-Tokens, temporäre Begegnungscodes, Freigabestufen (Externe/Mitglieder/Kontakte/Gruppen), „So sehen andere mein Profil“, Kontaktanfragen, Blockieren, Passkeys, Geräte/Sitzungen, Kontolöschung/Export, SMTP | M01, Querschnitt |
| **2 Karte & Orte** ✔ | Gemeinsames Ortsmodell, selbst gehostete OSM-Vektorkarten (MapLibre + PMTiles), erster echter Import (OSM-Spielplätze Bremen) mit Herkunft/Prüfzeit/Dubletten, Spielplatz-Detail, Favoriten, Fehler melden, Regionen-Import (Kreise/Gemeinden/Stadtteile + Geometrien), Datenzentrale | M10, M11, M13, M23, M24 |
| **3 Community** | Boards nach Region/Thema, persönlicher Feed, geschützte Gruppen mit Aufnahmeprüfung und Gruppenpseudonym, Linkkarten ohne Tracker, Editor, Meldungen + Moderatoren-Cockpit, Wissenseinträge | M03, M04, M07, M19, M24 |
| **4 Kommunikation** | Eigener Synapse (E2EE), Direkt-/Gruppenchat, Medien, Sprachnachrichten, Kontaktanfragen, Ruhezeiten, Push (PWA inkl. iOS-Installationshilfe), temporäre Räume per QR, Treffpunkt-Pin, Live-Standort (15/30/60 Min, sofort stoppbar) | M02, M06 |
| **5 Angebote & Radar** | Veranstaltungen (Liste/Kalender/Karte, wiederkehrend, Absagen, ICS), Einrichtungen/Partner mit Verifizierung, freie Plätze mit Gültigkeit, regionale Hinweise, Merklisten/Erinnerungen, Familienradar mit Wochenübersicht | M05, M12, M17, M18, M20, M22 |
| **6 Alltag** | Marktplatz, Familien helfen Familien, Lebenslagen-Kompass, Geburtstage/Einladungen | M09, M15, M16, M21 |
| **7 Ausbau** | Audio/Video mit LiveKit + TURN, Kinderwagenrouten, Affiliate (nach Prüfung der Amazon-Bedingungen), Statistik-Ausbau, zweite Freigabe für kritische Aktionen | M02, M08, M14, M24 |

Externe Abhängigkeiten: Lizenz-/Nutzungsprüfung jeder Datenquelle (M23), Amazon-PartnerNet-Konto und -Bedingungen (M08), offene UDP-Ports für TURN (M02), Rechtstexte (Impressum, Datenschutz) durch den Betreiber.
