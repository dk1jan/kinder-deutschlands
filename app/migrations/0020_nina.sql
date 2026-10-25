-- F-053 (Jan 25.10., „go B“): Warnungen des Bevölkerungsschutzes aus der NINA-Schnittstelle (warnung.bund.de/api31):
-- MoWaS, KATWARN, BIWAPP, Hochwasser (LHP), Polizei. Bewusst ohne Warnmultiplikatoren-Vereinbarung mit dem BBK
-- eingebunden – Entscheidung Jan nach Hinweis auf das Risiko (D-092, ändert D-087). Dazu Warngebiete als Fläche für die Karte.

ALTER TABLE warnings DROP CONSTRAINT warnings_provider_check;
ALTER TABLE warnings ADD CONSTRAINT warnings_provider_check CHECK (provider IN ('dwd', 'nina'));
ALTER TABLE warnings ADD COLUMN source text;            -- nina: mowas | katwarn | biwapp | lhp | police
ALTER TABLE warnings ADD COLUMN version integer;        -- nina: Fassung der Meldung (gleiche Kennung, neue Fassung)
ALTER TABLE warnings ADD COLUMN contact text;
ALTER TABLE warnings ADD COLUMN geom geometry(MultiPolygon, 4326);
CREATE INDEX warnings_geom_idx ON warnings USING gist (geom) WHERE ended_at IS NULL;
UPDATE warnings SET source = 'dwd' WHERE provider = 'dwd';

-- Laufende DWD-Warnungen bekommen ihre Fläche aus den betroffenen Kreisen (neue bringen sie selbst mit)
UPDATE warnings w SET geom = g.geom FROM (
	SELECT a.warning_id, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(ST_Union(r.geom), 0.002)), 3)) AS geom
	FROM warning_areas a JOIN regions r ON r.code = a.kreis_code AND r.geom IS NOT NULL
	GROUP BY a.warning_id
) g WHERE g.warning_id = w.id AND w.ended_at IS NULL AND w.geom IS NULL;
