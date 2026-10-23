-- F-028 (Jan 23.10.): zweite Quelle neben OSM – Overture Maps Places (D-078). Lizenz laut docs.overturemaps.org/guides/places
-- (geprüft 23.10.2026): CDLA-Permissive-2.0 bzw. Apache-2.0 je Datenlieferant, keine OSM-Daten enthalten.
-- Stichprobe Bremen (Jan, 23.10.): Leo's Abenteuerpark, Bremer Abenteuerland, Erlebniswelt Kiddo, Spiel Coolisse,
-- JUMP House, kek-Kindermuseum, Kinderbauernhof Tenever – in OSM fehlend. Kategorien unzuverlässig → strenge Regeln im Code.
-- Übernommen nur: Indoorspielplätze/Trampolinhallen, Kindermuseen, Kinderbauernhöfe. Zoos, Spielplätze, Bäder nicht (OSM besser).

INSERT INTO data_sources (key, name, kind, operator, format, access, license, license_url, attribution, regions, topics, contact, notes, config, interval_hours, next_run_at) VALUES
('overture-orte', 'Indoorspielplätze, Kindermuseen, Kinderbauernhöfe (Overture)', 'orte', 'Overture Maps Foundation',
 'GeoParquet (HTTP-Teilabruf)', 'https://docs.overturemaps.org/guides/places',
 'CDLA-Permissive-2.0 / Apache-2.0 (je Lieferant)', 'https://docs.overturemaps.org/attribution/',
 'Overture Maps Foundation, overturemaps.org (Daten u. a. von Meta und Microsoft, CDLA-Permissive-2.0; Foursquare: Copyright 2024 Foursquare Labs, Inc., Apache-2.0, ins Overture-Schema umgewandelt)', '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', '{drinnen,ausflug}', NULL,
 'Ergänzt OSM um Firmeneinträge. Nur Zuverlässigkeit ab 0,8 (eindeutiger Name „Indoorspielplatz“ ab 0,7), nur geöffnete Orte in Deutschland. Vereine, Märkte, Spielhallen und Spielplätze draußen werden über den Namen ausgeschlossen. Orte, die es schon gibt (OSM, Mitglieder), werden nicht doppelt angelegt. Gemeldet „gibt es nicht mehr“ → sofort ausgeblendet bis zur Prüfung.',
 '{"type": "overture", "min_confidence": 0.8}', 168, now() + interval '10 minutes')
ON CONFLICT (key) DO NOTHING;
