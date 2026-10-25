-- F-054 (Jan 25.10.): NINA-Warnungen (Migration 0020) wieder entfernen – D-093 hebt D-092 auf.
-- Übernommene NINA-Meldungen samt Mitteilungen löschen, nur Wetterwarnungen (DWD) bleiben.
-- Die Fläche (warnings.geom) bleibt: die Warnkarte zeigt weiter die Wetterwarnungen.

-- Mitteilungen zu NINA-Meldungen (Link auf die Detailseite, Kennung URL-kodiert)
DELETE FROM notifications n
WHERE n.kind = 'warnung'
	AND EXISTS (
		SELECT 1 FROM warnings w
		WHERE w.provider = 'nina'
			AND n.link IN ('/warnungen/' || w.id, '/warnungen/' || replace(w.id, ':', '%3A'))
	);

-- Gebiete (warning_areas) und Zustellvermerke (warning_deliveries) fallen über ON DELETE CASCADE mit weg
DELETE FROM warnings WHERE provider = 'nina';
DELETE FROM settings WHERE key = 'warnungen_nina';

ALTER TABLE warnings DROP CONSTRAINT warnings_provider_check;
ALTER TABLE warnings ADD CONSTRAINT warnings_provider_check CHECK (provider IN ('dwd'));
ALTER TABLE warnings DROP COLUMN source;
ALTER TABLE warnings DROP COLUMN version;
ALTER TABLE warnings DROP COLUMN contact;
