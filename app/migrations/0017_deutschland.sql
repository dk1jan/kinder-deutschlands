-- Jan 24.10.2026: „sofort ganz Deutschland, richtig fett“ – kein Bremen-/Testphasen-Auftritt mehr (D-084).
-- 1. Neue Ortsart „Unterkunft“ (Jugendherbergen, Familienhotels, Ferienhöfe, Campingplätze) aus OSM und Overture
-- 2. Grundkarte ganz Deutschland (D-068), falls noch der alte Ausschnitt Bremen/Niedersachsen eingestellt ist
-- 3. Forum für Moderation und Verwaltung (posts.team)
-- 4. Rundnachrichten an alle oder an Regionen (eigenes, vergebbares Recht)
-- 5. Amtliche Wetterwarnungen des DWD mit Abo und Push

-- ---------- 1. Orte ----------
ALTER TABLE places DROP CONSTRAINT places_kind_check;
ALTER TABLE places ADD CONSTRAINT places_kind_check CHECK (kind IN ('spielplatz', 'indoorspielplatz', 'wickelraum', 'toilette', 'stillraum',
	'familiencafe', 'ausflugsort', 'schwimmbad', 'bibliothek', 'familienzentrum', 'unterkunft'));

INSERT INTO data_sources (key, name, kind, operator, format, access, license, license_url, attribution, regions, topics, contact, notes, config, interval_hours, next_run_at) VALUES
('osm-unterkuenfte', 'Unterkünfte für Familien', 'orte', 'OpenStreetMap-Mitwirkende', 'Deutschland-Auszug (Geofabrik), osmium',
 'https://download.geofabrik.de/europe/germany.html', 'Open Database License 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
 '© OpenStreetMap-Mitwirkende, ODbL', '{01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16}', '{unterkunft}', NULL,
 'Campingplätze (ohne FKK-, Gruppen- und Dauercamping), Jugendherbergen (DJH), Familien-/Kinderhotels und Ferienhöfe über den Namen, Hotels mit Spielecke (kids_area). Ohne private.',
 '{"type": "osm", "selector": "unterkunft", "areas": ["DE-SH","DE-HH","DE-NI","DE-HB","DE-NW","DE-HE","DE-RP","DE-BW","DE-BY","DE-SL","DE-BE","DE-BB","DE-MV","DE-SN","DE-ST","DE-TH"]}',
 168, now() + interval '20 minutes')
ON CONFLICT (key) DO NOTHING;

UPDATE data_sources SET notes = 'changing_table=yes und das ältere Merkmal diaper (yes/room/Anzahl) außerhalb von Toiletten, ohne private. Toiletten mit Wickeltisch kommen über „Toiletten“.'
	WHERE key = 'osm-wickeln';
UPDATE data_sources SET notes = 'Cafés, Restaurants und Eiscafés mit Spielecke (kids_area), dazu Eltern-, Kinder-, Familien-, Spiel- und Krabbelcafés über den Namen (nicht an Kitas/Schulen, keine Brettspiel-/Internetcafés). Ohne private.'
	WHERE key = 'osm-familiencafes';
UPDATE data_sources SET name = 'Indoorspielplätze, Kindermuseen, Kinderbauernhöfe, Elterncafés, Unterkünfte (Overture)',
	notes = notes || ' Seit 24.10.2026 zusätzlich Eltern-/Kinder-/Familiencafés und Jugendherbergen/Familienhotels/Ferienhöfe über eindeutige Namen.',
	next_run_at = least(next_run_at, now() + interval '30 minutes')
	WHERE key = 'overture-orte' AND name NOT LIKE '%Elterncafés%';
-- Neue Regeln für Wickeln und Cafés: beim nächsten Lauf neu abgleichen
UPDATE data_sources SET next_run_at = least(next_run_at, now() + interval '25 minutes') WHERE key IN ('osm-wickeln', 'osm-familiencafes', 'osm-toiletten');

-- ---------- 2. Grundkarte ganz Deutschland (D-068) ----------
UPDATE data_sources SET config = jsonb_set(config, '{bbox}', '"5.8,47.2,15.1,55.1"'), next_run_at = now() + interval '5 minutes'
	WHERE key = 'protomaps-karte' AND config->>'bbox' = '6.6,51.29,11.62,53.9';

-- ---------- 3. Forum für Moderation und Verwaltung ----------
ALTER TABLE posts ADD COLUMN team boolean NOT NULL DEFAULT false;
CREATE INDEX posts_team_idx ON posts(activity_at DESC) WHERE team;

INSERT INTO role_permissions (role_key, action) VALUES
	('moderator_global', 'team.forum'), ('moderator_regional', 'team.forum'), ('moderator_topic', 'team.forum'),
	('group_moderator', 'team.forum'), ('tech_admin', 'team.forum'), ('data_editor', 'team.forum')
ON CONFLICT DO NOTHING;

-- Gehört die Person zum Team (irgendeine aktive Rolle mit Forum-Recht, egal welcher Geltungsbereich)?
CREATE FUNCTION kd_is_team(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
	SELECT EXISTS (SELECT 1 FROM role_assignments a JOIN role_permissions p ON p.role_key = a.role_key
		WHERE a.user_id = u AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at > now()) AND p.action IN ('*', 'team.forum'))
$$;

-- ---------- 4. Rundnachrichten ----------
INSERT INTO roles (key, name, description) VALUES
	('broadcaster', 'Rundnachrichten', 'Mitteilungen an alle Mitglieder oder an Regionen schicken (Geltungsbereich „überall“ oder eine Region mit allem darunter).')
ON CONFLICT (key) DO NOTHING;
INSERT INTO role_permissions (role_key, action) VALUES ('broadcaster', 'admin.access'), ('broadcaster', 'broadcast.send')
ON CONFLICT DO NOTHING;

CREATE TABLE broadcasts (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	title       text NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
	body        text NOT NULL CHECK (length(body) BETWEEN 3 AND 2000),
	link        text CHECK (link IS NULL OR length(link) <= 500),
	all_members boolean NOT NULL DEFAULT false,
	regions     text[] NOT NULL DEFAULT '{}',
	push        boolean NOT NULL DEFAULT false,
	recipients  integer NOT NULL DEFAULT 0,
	created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at  timestamptz NOT NULL DEFAULT now(),
	CHECK (all_members OR cardinality(regions) > 0)
);
CREATE INDEX broadcasts_created_idx ON broadcasts(created_at DESC);
CREATE TABLE broadcast_recipients (
	broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	read_at      timestamptz,
	PRIMARY KEY (broadcast_id, user_id)
);
CREATE INDEX broadcast_recipients_user_idx ON broadcast_recipients(user_id);

-- ---------- 5. Amtliche Wetterwarnungen (DWD) ----------
-- Kreis zu einer Region (Stadtteil → Gemeinde → Kreis); Hamburg und Berlin sind Land und Kreis zugleich.
CREATE FUNCTION kd_kreis_of(c text) RETURNS text LANGUAGE sql STABLE AS $$
	WITH RECURSIVE up AS (
		SELECT code, parent_code, level, 0 AS depth FROM regions WHERE code = c
		UNION ALL SELECT r.code, r.parent_code, r.level, up.depth + 1 FROM regions r JOIN up ON r.code = up.parent_code WHERE up.depth < 10
	) SELECT coalesce(
		(SELECT code FROM up WHERE level = 'kreis' ORDER BY depth LIMIT 1),
		(SELECT k.code FROM up JOIN regions k ON k.code = up.code || '000' AND k.level = 'kreis' WHERE up.level = 'land' AND up.code IN ('02', '11') LIMIT 1)
	)
$$;

CREATE TABLE warnings (
	id          text PRIMARY KEY,                 -- CAP identifier
	provider    text NOT NULL DEFAULT 'dwd' CHECK (provider IN ('dwd')),
	msg_type    text NOT NULL,                    -- Alert / Update / Cancel
	event       text,
	event_group text,
	severity    text NOT NULL CHECK (severity IN ('Minor', 'Moderate', 'Severe', 'Extreme', 'Unknown')),
	level       smallint NOT NULL CHECK (level BETWEEN 0 AND 4),
	urgency     text,
	headline    text NOT NULL,
	description text,
	instruction text,
	sender_name text,
	web         text,
	sent        timestamptz NOT NULL,
	onset       timestamptz,
	expires     timestamptz,
	refs        text[] NOT NULL DEFAULT '{}',
	area_desc   text,
	first_seen  timestamptz NOT NULL DEFAULT now(),
	last_seen   timestamptz NOT NULL DEFAULT now(),
	ended_at    timestamptz
);
CREATE INDEX warnings_active_idx ON warnings(level DESC, onset) WHERE ended_at IS NULL;
CREATE TABLE warning_areas (
	warning_id text NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
	kreis_code text NOT NULL,
	PRIMARY KEY (warning_id, kreis_code)
);
CREATE INDEX warning_areas_kreis_idx ON warning_areas(kreis_code);

CREATE TABLE warning_subscriptions (
	user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kreis_code  text NOT NULL REFERENCES regions(code) ON DELETE CASCADE,
	label       text,
	min_level   smallint NOT NULL DEFAULT 2 CHECK (min_level BETWEEN 1 AND 4),
	push        boolean NOT NULL DEFAULT true,
	created_at  timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, kreis_code)
);
CREATE INDEX warning_subscriptions_kreis_idx ON warning_subscriptions(kreis_code);

-- Wer wurde zu welcher Warnung schon benachrichtigt (keine doppelten Mitteilungen bei Aktualisierungen)
CREATE TABLE warning_deliveries (
	warning_id text NOT NULL,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	at         timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (warning_id, user_id)
);
