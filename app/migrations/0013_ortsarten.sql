-- F-018 (Jan 21.10.): mehr Kartendaten aus OpenStreetMap, ganz Deutschland. Kein Google (Nutzungsbedingungen,
-- REQUIREMENTS „Nicht einfach Google Maps … kopieren“). Merkmale laut OSM-Wiki (geprüft 21.10.2026):
--   kids_area=yes|designated|limited an Cafés/Restaurants/Eiscafés → Familiencafé
--   baby_feeding=yes|room → Stillmöglichkeit (room = eigener Stillraum)
--   amenity=library → Bibliothek (neu)
--   community_centre=family_centre → Familienzentrum (neu)
-- Zusätzlich in „Zoos, Freizeitparks, Bäder“: Minigolf (leisure=miniature_golf) und Kletterhallen (sport=climbing).
-- Anzahl je Land erst nach dem ersten Lauf bekannt (aus der Arbeitsumgebung nicht abfragbar).

ALTER TABLE places DROP CONSTRAINT places_kind_check;
ALTER TABLE places ADD CONSTRAINT places_kind_check CHECK (kind IN ('spielplatz', 'indoorspielplatz', 'wickelraum', 'toilette', 'stillraum',
	'familiencafe', 'ausflugsort', 'schwimmbad', 'bibliothek', 'familienzentrum'));

INSERT INTO data_sources (key, name, kind, operator, format, access, license, license_url, attribution, regions, topics, contact, notes, config, interval_hours, next_run_at) VALUES
('osm-familiencafes', 'Familiencafés', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', '{cafe}', NULL,
 'Cafés, Restaurants und Eiscafés mit Spielecke (kids_area=yes/designated/limited), ohne private. Schnellrestaurants bewusst nicht.',
 '{"type": "osm", "selector": "familiencafe", "areas": ["DE-SH","DE-HH","DE-NI","DE-HB","DE-NW","DE-HE","DE-RP","DE-BW","DE-BY","DE-SL","DE-BE","DE-BB","DE-MV","DE-SN","DE-ST","DE-TH"]}',
 168, now() + interval '15 minutes'),
('osm-stillen', 'Stillmöglichkeiten', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', '{cafe,wickeln}', NULL,
 'baby_feeding=yes oder room (eigener Stillraum), ohne private.',
 '{"type": "osm", "selector": "stillen", "areas": ["DE-SH","DE-HH","DE-NI","DE-HB","DE-NW","DE-HE","DE-RP","DE-BW","DE-BY","DE-SL","DE-BE","DE-BB","DE-MV","DE-SN","DE-ST","DE-TH"]}',
 168, now() + interval '25 minutes'),
('osm-bibliotheken', 'Bibliotheken', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', '{bibliothek}', NULL,
 'amenity=library ohne private; Hochschul-, Instituts- und Archivbibliotheken werden über den Namen ausgelassen.',
 '{"type": "osm", "selector": "bibliothek", "areas": ["DE-SH","DE-HH","DE-NI","DE-HB","DE-NW","DE-HE","DE-RP","DE-BW","DE-BY","DE-SL","DE-BE","DE-BB","DE-MV","DE-SN","DE-ST","DE-TH"]}',
 168, now() + interval '35 minutes'),
('osm-familienzentren', 'Familienzentren', 'orte', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', '{familienzentrum}', NULL,
 'community_centre=family_centre ohne private. In OSM noch dünn erfasst – hier helfen Ergänzungen von Mitgliedern und Einrichtungen.',
 '{"type": "osm", "selector": "familienzentrum", "areas": ["DE-SH","DE-HH","DE-NI","DE-HB","DE-NW","DE-HE","DE-RP","DE-BW","DE-BY","DE-SL","DE-BE","DE-BB","DE-MV","DE-SN","DE-ST","DE-TH"]}',
 168, now() + interval '45 minutes')
ON CONFLICT (key) DO NOTHING;

UPDATE data_sources SET name = 'Zoos, Freizeitparks, Bäder, Minigolf, Klettern',
	notes = 'tourism=zoo/theme_park, leisure=water_park, Schwimmhallen, öffentliche Bäder, leisure=miniature_golf, Kletterhallen (sport=climbing).'
	WHERE key = 'osm-ausflug';
