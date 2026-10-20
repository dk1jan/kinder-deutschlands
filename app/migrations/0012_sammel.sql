-- Sammel-Update (FEEDBACK F-001 bis F-015)
-- F-005: Meldeart „Ich kann etwas ergänzen“ am Ort
ALTER TABLE place_reports DROP CONSTRAINT place_reports_kind_check;
ALTER TABLE place_reports ADD CONSTRAINT place_reports_kind_check CHECK (kind IN ('ergaenzung', 'falsche_angabe', 'existiert_nicht', 'defekt', 'gesperrt', 'dublette', 'sonstiges'));

-- F-006 / D-060: E-Mail-Adressen für niemanden in der Verwaltung sichtbar.
-- Alte Einträge, die eine Adresse als Text enthalten, auf die Familien-ID umstellen bzw. die Adresse entfernen.
UPDATE settings s SET value = jsonb_set(s.value, '{terms_checked_by}',
		coalesce(to_jsonb((select substr(p.contact_id,1,3) || '-' || substr(p.contact_id,4,3) || '-' || substr(p.contact_id,7,3)
			from users u join user_profiles p on p.user_id = u.id where lower(u.email) = lower(s.value->>'terms_checked_by'))), '"(Familien-ID unbekannt)"'::jsonb))
	WHERE s.key = 'affiliate' AND s.value->>'terms_checked_by' LIKE '%@%';
UPDATE approvals SET summary = regexp_replace(summary, '[^[:space:]]+@[^[:space:]]+', '[Adresse entfernt]', 'g') WHERE summary ~ '@';

-- F-006 / D-016: Mitglied ändert die eigene E-Mail-Adresse selbst (Bestätigung an die neue Adresse)
ALTER TABLE email_tokens ADD COLUMN new_email text;
ALTER TABLE email_tokens DROP CONSTRAINT email_tokens_purpose_check;
ALTER TABLE email_tokens ADD CONSTRAINT email_tokens_purpose_check CHECK (purpose IN ('verify', 'reset', 'change'));

-- F-008: Partnerschaft/Familie verbinden – nur mit Bestätigung beider Seiten. Wer die Verbindung sehen darf,
-- legt jede Person in ihrem Profil fest (Feld „family“ in visibility); angezeigt wird sie nur, wenn beide es zulassen.
CREATE TABLE family_links (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_a       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	user_b       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind         text NOT NULL CHECK (kind IN ('partnerschaft', 'familie')),
	status       text NOT NULL DEFAULT 'angefragt' CHECK (status IN ('angefragt', 'aktiv')),
	requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at   timestamptz NOT NULL DEFAULT now(),
	confirmed_at timestamptz,
	CHECK (user_a < user_b),
	UNIQUE (user_a, user_b)
);
CREATE INDEX family_links_b_idx ON family_links(user_b);

-- F-015 (Entscheidung Jan 20.10.): Orte für ganz Deutschland. Alle 16 Länder nacheinander (ein Fehler bricht den
-- ganzen Lauf ab – nichts wird fälschlich als „entfernt“ markiert). Damit die Orte Gemeinden zugeordnet werden,
-- holt VG250 ebenfalls alle Länder.
UPDATE data_sources SET config = jsonb_set(config, '{areas}', '["DE-SH","DE-HH","DE-NI","DE-HB","DE-NW","DE-HE","DE-RP","DE-BW","DE-BY","DE-SL","DE-BE","DE-BB","DE-MV","DE-SN","DE-ST","DE-TH"]'::jsonb),
	regions = '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', next_run_at = least(next_run_at, now() + interval '30 minutes')
	WHERE kind = 'orte' AND config->>'type' = 'osm';
UPDATE data_sources SET config = jsonb_set(config, '{laender}', '["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16"]'::jsonb),
	regions = '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', next_run_at = least(next_run_at, now() + interval '5 minutes')
	WHERE key = 'bkg-vg250';

-- Stadtteile/Ortsteile Niedersachsen (admin_level 10) aus OSM – wie Bremen, Zuordnung über die amtliche Gemeindegrenze
INSERT INTO data_sources (key, name, kind, operator, format, access, license, license_url, attribution, regions, topics, contact, notes, config, interval_hours, next_run_at) VALUES
('osm-stadtteile-ni', 'Stadt- und Ortsteile Niedersachsen', 'regionen', 'OpenStreetMap-Mitwirkende', 'Overpass API, JSON',
 'https://overpass-api.de', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{03}', '{regionen}', NULL,
 'Stadtteile (z. B. Hannover, Braunschweig, Oldenburg) und Ortsteile der Gemeinden; Übergangslösung bis zu einer offenen amtlichen Quelle (D-020).',
 '{"type": "osm-stadtteile", "iso": "DE-NI", "admin_level": 10}', 720, now() + interval '20 minutes')
ON CONFLICT (key) DO NOTHING;
