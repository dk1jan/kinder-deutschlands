-- 0001 Fundament: Konten, Sitzungen, Rechte, Regionen, Einstellungen, Audit-Log
-- Module: Querschnitt (Identität, Rechte, Regionsmodell), M24-Basis

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Plattform-Einstellungen (u. a. Setup-Status). Keine Geheimnisse im Klartext.
CREATE TABLE settings (
	key        text PRIMARY KEY,
	value      jsonb NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (key, value) VALUES ('setup', '{"completed_at": null}');

-- Konten: technische ID. Öffentliche Kontakt-ID und QR-Token folgen in M01 als eigene Tabellen.
CREATE TABLE users (
	id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email            citext NOT NULL UNIQUE,
	email_verified_at timestamptz,
	password_hash    text NOT NULL,
	totp_secret_enc  text,
	totp_enabled_at  timestamptz,
	totp_last_step   bigint,
	display_name     text,
	status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
	created_at       timestamptz NOT NULL DEFAULT now(),
	last_login_at    timestamptz
);

-- Sitzungen: in der DB liegt nur der SHA-256-Hash des Tokens, nie das Token selbst.
CREATE TABLE sessions (
	id_hash      text PRIMARY KEY,
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	mfa_verified boolean NOT NULL DEFAULT false,
	created_at   timestamptz NOT NULL DEFAULT now(),
	last_seen_at timestamptz NOT NULL DEFAULT now(),
	expires_at   timestamptz NOT NULL,
	user_agent   text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

-- Regionsmodell nach Amtlichem Regionalschlüssel (ARS/AGS). Geometrien folgen per Import (M23).
CREATE TABLE regions (
	code        text PRIMARY KEY,
	name        text NOT NULL,
	level       text NOT NULL CHECK (level IN ('staat', 'land', 'kreis', 'gemeinde', 'stadtteil')),
	parent_code text REFERENCES regions(code),
	geom        geometry(MultiPolygon, 4326),
	center      geometry(Point, 4326),
	source      text NOT NULL,
	updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX regions_parent_idx ON regions(parent_code);
CREATE INDEX regions_geom_idx ON regions USING gist (geom);

-- Rollen und ihre Aktionen. Durchsetzung ausschließlich serverseitig.
CREATE TABLE roles (
	key         text PRIMARY KEY,
	name        text NOT NULL,
	description text NOT NULL,
	is_system   boolean NOT NULL DEFAULT true
);
CREATE TABLE role_permissions (
	role_key text NOT NULL REFERENCES roles(key) ON DELETE CASCADE,
	action   text NOT NULL,
	PRIMARY KEY (role_key, action)
);

-- Zuweisung = Rolle × Geltungsbereich, optional befristet, widerrufbar, nachvollziehbar.
CREATE TABLE role_assignments (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role_key    text NOT NULL REFERENCES roles(key),
	scope_type  text NOT NULL CHECK (scope_type IN ('global', 'region', 'topic', 'org', 'group')),
	scope_id    text,
	granted_by  uuid REFERENCES users(id),
	granted_at  timestamptz NOT NULL DEFAULT now(),
	expires_at  timestamptz,
	revoked_at  timestamptz,
	revoked_by  uuid REFERENCES users(id),
	note        text,
	CHECK ((scope_type = 'global') = (scope_id IS NULL))
);
CREATE INDEX role_assignments_user_idx ON role_assignments(user_id) WHERE revoked_at IS NULL;

-- Geschütztes Audit-Protokoll: wer, wann, was. Keine privaten Inhalte, IP nur als Hash.
CREATE TABLE audit_log (
	id          bigserial PRIMARY KEY,
	at          timestamptz NOT NULL DEFAULT now(),
	actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
	action      text NOT NULL,
	target_type text,
	target_id   text,
	reason      text,
	meta        jsonb NOT NULL DEFAULT '{}',
	ip_hash     text
);
CREATE INDEX audit_log_at_idx ON audit_log(at DESC);

-- Systemrollen
INSERT INTO roles (key, name, description) VALUES
	('superadmin',         'Betreiber',                 'Vollzugriff auf Betrieb und Rechtevergabe. Kein Lesezugriff auf private Chats.'),
	('tech_admin',         'Technikadministration',     'Systemzustand, Backups, Module, Wartung.'),
	('moderator_global',   'Moderation (bundesweit)',   'Meldungen und Inhalte in allen offenen Bereichen.'),
	('moderator_regional', 'Moderation (Region)',       'Meldungen und Inhalte im zugewiesenen Gebiet und darunter.'),
	('moderator_topic',    'Moderation (Thema)',        'Meldungen und Inhalte im zugewiesenen Thema.'),
	('group_moderator',    'Moderation (geschützte Gruppe)', 'Nur die ausdrücklich zugewiesene geschützte Gruppe.'),
	('data_editor',        'Datenredaktion',            'Quellen, Importe und Orts-/Angebotsdaten.'),
	('org_admin',          'Organisationsverwaltung',   'Pflege der eigenen verifizierten Einrichtung.');

INSERT INTO role_permissions (role_key, action) VALUES
	('superadmin', '*'),
	('tech_admin', 'admin.access'), ('tech_admin', 'system.view'), ('tech_admin', 'system.manage'), ('tech_admin', 'audit.view'),
	('moderator_global', 'admin.access'), ('moderator_global', 'moderation.review'), ('moderator_global', 'content.moderate'),
	('moderator_regional', 'admin.access'), ('moderator_regional', 'moderation.review'), ('moderator_regional', 'content.moderate'),
	('moderator_topic', 'admin.access'), ('moderator_topic', 'moderation.review'), ('moderator_topic', 'content.moderate'),
	('group_moderator', 'admin.access'), ('group_moderator', 'protected_group.read'), ('group_moderator', 'protected_group.moderate'),
	('data_editor', 'admin.access'), ('data_editor', 'data.edit'), ('data_editor', 'data.import'),
	('org_admin', 'org.manage');

-- Regionen: Startbestand. Kreise/Gemeinden/Stadtteile und Geometrien kommen per Import aus amtlicher Quelle (M23).
INSERT INTO regions (code, name, level, parent_code, source) VALUES
	('de', 'Deutschland', 'staat', NULL, 'manuell'),
	('01', 'Schleswig-Holstein', 'land', 'de', 'manuell'),
	('02', 'Hamburg', 'land', 'de', 'manuell'),
	('03', 'Niedersachsen', 'land', 'de', 'manuell'),
	('04', 'Bremen (Land)', 'land', 'de', 'manuell'),
	('05', 'Nordrhein-Westfalen', 'land', 'de', 'manuell'),
	('06', 'Hessen', 'land', 'de', 'manuell'),
	('07', 'Rheinland-Pfalz', 'land', 'de', 'manuell'),
	('08', 'Baden-Württemberg', 'land', 'de', 'manuell'),
	('09', 'Bayern', 'land', 'de', 'manuell'),
	('10', 'Saarland', 'land', 'de', 'manuell'),
	('11', 'Berlin', 'land', 'de', 'manuell'),
	('12', 'Brandenburg', 'land', 'de', 'manuell'),
	('13', 'Mecklenburg-Vorpommern', 'land', 'de', 'manuell'),
	('14', 'Sachsen', 'land', 'de', 'manuell'),
	('15', 'Sachsen-Anhalt', 'land', 'de', 'manuell'),
	('16', 'Thüringen', 'land', 'de', 'manuell'),
	('04011', 'Bremen (Stadt)', 'kreis', '04', 'manuell'),
	('04012', 'Bremerhaven', 'kreis', '04', 'manuell');
