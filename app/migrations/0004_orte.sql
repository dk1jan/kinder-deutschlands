-- Abschnitt 2: Gemeinsames Ortsmodell (M10/M11/M13), Quellenkatalog und Importe (M23), Datenzentrale (M24).

-- Quellenkatalog: jede Datenquelle mit Betreiber, Format, Zugang, Nutzungsrecht, Rhythmus und Zustand.
CREATE TABLE data_sources (
	key              text PRIMARY KEY,
	name             text NOT NULL,
	kind             text NOT NULL CHECK (kind IN ('orte', 'regionen', 'karte')),
	operator         text NOT NULL,
	format           text NOT NULL,
	access           text NOT NULL,
	license          text NOT NULL,
	license_url      text,
	attribution      text NOT NULL,
	regions          text[] NOT NULL DEFAULT '{}',
	topics           text[] NOT NULL DEFAULT '{}',
	contact          text,
	notes            text,
	config           jsonb NOT NULL DEFAULT '{}',
	interval_hours   integer NOT NULL DEFAULT 168 CHECK (interval_hours >= 1),
	auto_apply       boolean NOT NULL DEFAULT true,
	max_removal_pct  integer NOT NULL DEFAULT 15 CHECK (max_removal_pct BETWEEN 0 AND 100),
	paused           boolean NOT NULL DEFAULT false,
	next_run_at      timestamptz NOT NULL DEFAULT now(),
	last_run_at      timestamptz,
	last_success_at  timestamptz,
	last_error       text,
	runs_ok          integer NOT NULL DEFAULT 0,
	runs_failed      integer NOT NULL DEFAULT 0,
	created_at       timestamptz NOT NULL DEFAULT now()
);

-- Jeder Abruf: Zähler, Fehler, Vorschau/Übernahme nachvollziehbar.
CREATE TABLE import_runs (
	id           bigserial PRIMARY KEY,
	source_key   text NOT NULL REFERENCES data_sources(key) ON DELETE CASCADE,
	trigger      text NOT NULL CHECK (trigger IN ('zeitplan', 'manuell')),
	triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
	status       text NOT NULL CHECK (status IN ('laeuft', 'vorschau', 'uebernommen', 'fehler', 'verworfen')),
	started_at   timestamptz NOT NULL DEFAULT now(),
	finished_at  timestamptz,
	counts       jsonb NOT NULL DEFAULT '{}',
	message      text,
	applied_at   timestamptz,
	applied_by   uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX import_runs_source_idx ON import_runs(source_key, started_at DESC);

-- Vorschau eines Abrufs: was neu, geändert oder verschwunden wäre.
CREATE TABLE import_items (
	run_id      bigint NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
	external_id text NOT NULL,
	action      text NOT NULL CHECK (action IN ('neu', 'geaendert', 'entfernt')),
	name        text,
	data        jsonb NOT NULL,
	PRIMARY KEY (run_id, external_id)
);

-- Orte: ein gemeinsames Modell für Spielplätze, Wickelmöglichkeiten, Toiletten, Ausflugsorte …
CREATE TABLE places (
	id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind           text NOT NULL CHECK (kind IN ('spielplatz', 'indoorspielplatz', 'wickelraum', 'toilette', 'stillraum',
	                                             'familiencafe', 'ausflugsort', 'schwimmbad')),
	name           text,
	description    text,
	location       geometry(Point, 4326) NOT NULL,
	area           geometry(Geometry, 4326),
	address        jsonb NOT NULL DEFAULT '{}',
	region_code    text REFERENCES regions(code) ON DELETE SET NULL,
	features       jsonb NOT NULL DEFAULT '{}',
	opening_hours  text,
	website        text,
	status         text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'pruefung', 'archiviert', 'abgelehnt', 'zusammengefuehrt')),
	confirmation   text NOT NULL DEFAULT 'importiert' CHECK (confirmation IN ('importiert', 'community', 'redaktion', 'anbieter')),
	locked_fields  text[] NOT NULL DEFAULT '{}',
	merged_into    uuid REFERENCES places(id) ON DELETE SET NULL,
	created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at     timestamptz NOT NULL DEFAULT now(),
	updated_at     timestamptz NOT NULL DEFAULT now(),
	checked_at     timestamptz
);
CREATE INDEX places_location_idx ON places USING gist (location);
CREATE INDEX places_kind_status_idx ON places(kind, status);
CREATE INDEX places_region_idx ON places(region_code);

-- Herkunft je Ort und Quelle: externe ID, Prüfzeitpunkte, Rohdaten. Ein Ort kann mehrere Quellen haben.
CREATE TABLE place_sources (
	source_key    text NOT NULL REFERENCES data_sources(key) ON DELETE CASCADE,
	external_id   text NOT NULL,
	place_id      uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	external_url  text,
	hash          text NOT NULL,
	raw           jsonb NOT NULL DEFAULT '{}',
	first_seen_at timestamptz NOT NULL DEFAULT now(),
	last_seen_at  timestamptz NOT NULL DEFAULT now(),
	changed_at    timestamptz NOT NULL DEFAULT now(),
	gone_at       timestamptz,
	PRIMARY KEY (source_key, external_id)
);
CREATE INDEX place_sources_place_idx ON place_sources(place_id);

-- Mögliche Dubletten (gleiche Art, sehr nah): Redaktion entscheidet, nichts wird stillschweigend zusammengelegt.
CREATE TABLE place_duplicates (
	place_a     uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	place_b     uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	distance_m  real NOT NULL,
	status      text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'zusammengefuehrt', 'verschieden')),
	detected_at timestamptz NOT NULL DEFAULT now(),
	decided_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	decided_at  timestamptz,
	PRIMARY KEY (place_a, place_b),
	CHECK (place_a < place_b)
);

CREATE TABLE place_favorites (
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	place_id   uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, place_id)
);

-- Fehlermeldungen von Mitgliedern. Freitext nur für die Redaktion sichtbar.
CREATE TABLE place_reports (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
	kind        text NOT NULL CHECK (kind IN ('falsche_angabe', 'existiert_nicht', 'defekt', 'gesperrt', 'dublette', 'sonstiges')),
	message     text,
	status      text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'erledigt', 'abgelehnt')),
	created_at  timestamptz NOT NULL DEFAULT now(),
	handled_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	handled_at  timestamptz,
	resolution  text
);
CREATE INDEX place_reports_open_idx ON place_reports(status, created_at);

-- Sichtbare Hinweise am Ort (Defekt, Sperrung): klar getrennt nach Herkunft.
CREATE TABLE place_notices (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	kind        text NOT NULL CHECK (kind IN ('defekt', 'gesperrt')),
	origin      text NOT NULL CHECK (origin IN ('nutzer', 'redaktion', 'amtlich')),
	text        text,
	source_url  text,
	report_id   uuid REFERENCES place_reports(id) ON DELETE SET NULL,
	created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at  timestamptz NOT NULL DEFAULT now(),
	valid_until timestamptz,
	ended_at    timestamptz
);
CREATE INDEX place_notices_place_idx ON place_notices(place_id) WHERE ended_at IS NULL;

-- Regionen: Herkunft und Stand der Geometrie
ALTER TABLE regions ADD COLUMN source_version text;

-- Rechte: Datenredaktion prüft, Technikadministration darf Importe starten
INSERT INTO role_permissions (role_key, action) VALUES
	('data_editor', 'data.view'), ('tech_admin', 'data.view'), ('tech_admin', 'data.import')
ON CONFLICT DO NOTHING;

-- Startbestand des Quellenkatalogs (geprüft am 18.10.2026: Erreichbarkeit, Umfang, Lizenz – siehe DECISIONS D-020).
-- Reihenfolge beim ersten Start: Regionen → Kartenkacheln → Orte (next_run_at gestaffelt).
INSERT INTO data_sources (key, name, kind, operator, format, access, license, license_url, attribution, regions, topics, contact, notes, config, interval_hours, next_run_at) VALUES
('bkg-vg250', 'Verwaltungsgebiete (VG250)', 'regionen', 'Bundesamt für Kartographie und Geodäsie (BKG)', 'WFS 2.0, GeoJSON',
 'https://sgx.geodatenzentrum.de/wfs_vg250', 'Datenlizenz Deutschland – Namensnennung 2.0', 'https://www.govdata.de/dl-de/by-2-0',
 '© BKG (2026) dl-de/by-2-0', '{03,04}', '{regionen}', 'dlz@bkg.bund.de',
 'Amtliche Grenzen von Ländern, Kreisen und Gemeinden, Maßstab 1:250 000, Stand jeweils 01.01.',
 '{"type": "vg250", "laender": ["03", "04"]}', 720, now()),
('osm-stadtteile-hb', 'Stadtteile Bremen und Bremerhaven', 'regionen', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{04}', '{regionen}', NULL,
 'Übergangslösung, bis eine offene amtliche Stadtteilgeometrie angebunden ist.',
 '{"type": "osm-stadtteile", "iso": "DE-HB", "admin_level": 10}', 720, now() + interval '1 minute'),
('protomaps-karte', 'Kartenhintergrund (eigene Kacheln)', 'karte', 'Protomaps / OpenStreetMap-Mitwirkende', 'PMTiles (Vektorkacheln)',
 'https://build.protomaps.com', 'Open Database License 1.0 (Kartendaten), BSD/CC0 (Protomaps-Stil)', 'https://docs.protomaps.com/basemaps/downloads',
 'Protomaps © OpenStreetMap-Mitwirkende', '{03,04}', '{karte}', NULL,
 'Ausschnitt Bremen + Niedersachsen bis Zoomstufe 15 (ca. 1,5 GB). Wird auf dem eigenen Server ausgeliefert, keine Anfragen an Dritte beim Kartenaufruf.',
 '{"type": "protomaps", "bbox": "6.6,51.29,11.62,53.9", "maxzoom": 15}', 720, now() + interval '2 minutes'),
('osm-spielplaetze', 'Spielplätze', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{03,04}', '{spielplatz}', NULL,
 'leisure=playground ohne private; Spielgeräte (playground=*) werden dem umgebenden Spielplatz zugeordnet. Stand 18.10.2026: 816 in Bremen, 14 746 in Niedersachsen.',
 '{"type": "osm", "selector": "spielplatz", "areas": ["DE-HB", "DE-NI"]}', 168, now() + interval '3 minutes'),
('osm-toiletten', 'Öffentliche Toiletten', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{03,04}', '{toilette,wickeln}', NULL,
 'amenity=toilets ohne private, inkl. Wickeltisch-Angaben. Stand 18.10.2026: 278 in Bremen, 3 076 in Niedersachsen.',
 '{"type": "osm", "selector": "toilette", "areas": ["DE-HB", "DE-NI"]}', 168, now() + interval '4 minutes'),
('osm-wickeln', 'Wickelmöglichkeiten', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{03,04}', '{wickeln}', NULL,
 'changing_table=yes außerhalb von Toiletten (Cafés, Geschäfte, Einrichtungen). Stand 18.10.2026: 20 in Bremen, 201 in Niedersachsen.',
 '{"type": "osm", "selector": "wickeln", "areas": ["DE-HB", "DE-NI"]}', 168, now() + interval '5 minutes'),
('osm-indoor', 'Indoorspielplätze', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{03,04}', '{drinnen}', NULL,
 'leisure=indoor_play. Stand 18.10.2026: 1 in Bremen, 19 in Niedersachsen – hier helfen Ergänzungen von Mitgliedern.',
 '{"type": "osm", "selector": "indoor", "areas": ["DE-HB", "DE-NI"]}', 168, now() + interval '6 minutes'),
('osm-ausflug', 'Zoos, Freizeitparks, Bäder', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{03,04}', '{ausflug}', NULL,
 'tourism=zoo/theme_park, leisure=water_park, Schwimmhallen (sport=swimming), public_bath.',
 '{"type": "osm", "selector": "ausflug", "areas": ["DE-HB", "DE-NI"]}', 168, now() + interval '7 minutes');
