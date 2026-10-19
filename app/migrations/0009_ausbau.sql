-- Abschnitt 7: zweite Freigabe kritischer Aktionen (M24), Kinderwagenrouten (M14), Affiliate-Einstellungen (M08),
-- Statistik-Recht (M24). Anrufe (M02) brauchen keine Tabellen: Signalisierung liegt verschlüsselt im Chat.

-- ---------- Zweite Freigabe ----------
-- Kritische Aktionen (Betreiber-/Technikrolle vergeben oder entziehen, Konto sperren) führt erst eine zweite
-- berechtigte Person aus. Gibt es nur eine berechtigte Person, gilt die Aktion sofort – mit Vermerk im Protokoll.
CREATE TABLE approvals (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	action       text NOT NULL CHECK (action IN ('role.assign', 'role.revoke', 'user.suspend')),
	permission   text NOT NULL,
	payload      jsonb NOT NULL,
	summary      text NOT NULL,
	reason       text NOT NULL,
	requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
	requested_at timestamptz NOT NULL DEFAULT now(),
	expires_at   timestamptz NOT NULL DEFAULT now() + interval '72 hours',
	status       text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'ausgefuehrt', 'abgelehnt', 'abgelaufen', 'zurueckgezogen', 'fehler')),
	decided_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	decided_at   timestamptz,
	decision_note text,
	CHECK (decided_by IS NULL OR decided_by IS DISTINCT FROM requested_by)
);
CREATE INDEX approvals_open_idx ON approvals(status, requested_at DESC);

-- ---------- Kinderwagenrouten ----------
-- Nur Wege, die jemand selbst gegangen ist und eingezeichnet hat (oder aus Quellen mit geklärter Lizenz).
-- Start und Ziel sollen öffentliche Orte sein – keine Wohnadressen. Angaben sind Erfahrungen, keine Garantie.
CREATE TABLE stroller_routes (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	title        text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
	description  text NOT NULL DEFAULT '',
	geom         geometry(LineString, 4326) NOT NULL,
	distance_m   integer NOT NULL CHECK (distance_m BETWEEN 100 AND 50000),
	is_loop      boolean NOT NULL DEFAULT false,
	surface      text CHECK (surface IN ('asphalt', 'pflaster', 'wassergebunden', 'waldweg', 'gemischt')),
	incline      text CHECK (incline IN ('eben', 'leicht', 'steil')),
	stairs       boolean,
	narrow       boolean,
	shade        boolean,
	rest_spots   text,
	duration_min smallint CHECK (duration_min BETWEEN 5 AND 600),
	region_code  text REFERENCES regions(code) ON DELETE SET NULL,
	origin       text NOT NULL DEFAULT 'mitglied' CHECK (origin IN ('mitglied', 'redaktion', 'import')),
	source_key   text REFERENCES data_sources(key) ON DELETE SET NULL,
	source_url   text,
	status       text NOT NULL DEFAULT 'pruefung' CHECK (status IN ('pruefung', 'aktiv', 'abgelehnt', 'entfernt')),
	review_note  text,
	created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	checked_at   timestamptz,
	created_at   timestamptz NOT NULL DEFAULT now(),
	updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stroller_routes_geom_idx ON stroller_routes USING gist (geom);
CREATE INDEX stroller_routes_status_idx ON stroller_routes(status, created_at DESC);

-- Erfahrungen mit einer Route („gut mit Kinderwagen“ / „Hindernis“) – nur Text und Datum, kein Bewegungsprofil
CREATE TABLE route_reports (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	route_id   uuid NOT NULL REFERENCES stroller_routes(id) ON DELETE CASCADE,
	user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
	kind       text NOT NULL CHECK (kind IN ('passt', 'hindernis', 'gesperrt')),
	text       text,
	created_at timestamptz NOT NULL DEFAULT now(),
	ended_at   timestamptz
);
CREATE INDEX route_reports_route_idx ON route_reports(route_id, created_at DESC);

ALTER TABLE mod_cases DROP CONSTRAINT mod_cases_target_type_check;
ALTER TABLE mod_cases ADD CONSTRAINT mod_cases_target_type_check CHECK (target_type IN ('post', 'comment', 'media', 'review', 'user', 'group', 'chat', 'event', 'offer', 'org', 'listing', 'help', 'invitation', 'route'));

-- ---------- Rechte ----------
INSERT INTO role_permissions (role_key, action) VALUES
	('data_editor', 'routes.edit'), ('moderator_global', 'routes.edit'),
	('tech_admin', 'stats.view')
ON CONFLICT DO NOTHING;

-- Affiliate (M08): Einstellungen liegen in settings (Schlüssel 'affiliate'), standardmäßig AUS.
INSERT INTO settings (key, value) VALUES ('affiliate', '{"enabled": false, "amazon_tag": null}') ON CONFLICT (key) DO NOTHING;
