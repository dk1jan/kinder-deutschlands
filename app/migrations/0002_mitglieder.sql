-- 0002 Mitglieder: Profil mit Kontakt-ID, Freigaben, QR-Codes, Kontakte, Anfragen, Blockieren,
-- E-Mail-Token, Passkeys, Löschprotokoll.  Module: M01, Querschnitt (Identität, Wiederherstellung, Löschung)

-- Profil. contact_id = öffentliche Kontakt-ID (getrennt von users.id und von QR-Token).
CREATE TABLE user_profiles (
	user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	contact_id     text NOT NULL UNIQUE,
	display_name   text,
	can_help       text,
	looking_for    text,
	interests      text[] NOT NULL DEFAULT '{}',
	child_ages     text[] NOT NULL DEFAULT '{}',
	region_code    text REFERENCES regions(code),
	discoverable   boolean NOT NULL DEFAULT false,
	privacy_preset text NOT NULL DEFAULT 'zurueckhaltend' CHECK (privacy_preset IN ('zurueckhaltend', 'offen', 'individuell')),
	visibility     jsonb NOT NULL DEFAULT '{"display_name":"mitglieder","can_help":"kontakte","looking_for":"kontakte","interests":"kontakte","child_ages":"kontakte","region":"kontakte"}',
	updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_profiles_discover_idx ON user_profiles(region_code) WHERE discoverable;

-- Einmal-Token für E-Mail-Bestätigung und Passwort-Zurücksetzen (nur Hash gespeichert).
CREATE TABLE email_tokens (
	token_hash text PRIMARY KEY,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	purpose    text NOT NULL CHECK (purpose IN ('verify', 'reset')),
	created_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL,
	used_at    timestamptz
);
CREATE INDEX email_tokens_user_idx ON email_tokens(user_id, purpose);

-- QR-Codes: widerrufbar, dauerhaft oder befristet. Das Token ist öffentlich (steht im QR), deshalb im Klartext.
CREATE TABLE qr_tokens (
	id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	token           text NOT NULL UNIQUE,
	user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind            text NOT NULL CHECK (kind IN ('dauerhaft', 'befristet')),
	label           text,
	created_at      timestamptz NOT NULL DEFAULT now(),
	expires_at      timestamptz,
	revoked_at      timestamptz,
	last_scanned_at timestamptz
);
CREATE INDEX qr_tokens_user_idx ON qr_tokens(user_id);

-- Kontaktanfragen
CREATE TABLE contact_requests (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	from_user  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	to_user    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	message    text,
	via        text NOT NULL DEFAULT 'id' CHECK (via IN ('id', 'qr', 'entdecken')),
	status     text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'angenommen', 'abgelehnt', 'zurueckgezogen')),
	created_at timestamptz NOT NULL DEFAULT now(),
	decided_at timestamptz,
	CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX contact_requests_open_uidx ON contact_requests(from_user, to_user) WHERE status = 'offen';
CREATE INDEX contact_requests_to_idx ON contact_requests(to_user) WHERE status = 'offen';

-- Bestätigte Kontakte (symmetrisch, kleinere ID zuerst)
CREATE TABLE contacts (
	user_a     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	user_b     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_a, user_b),
	CHECK (user_a < user_b)
);
CREATE INDEX contacts_b_idx ON contacts(user_b);

-- Blockieren (einseitig, wirkt in beide Richtungen auf Sichtbarkeit und Anfragen)
CREATE TABLE blocks (
	blocker    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	blocked    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (blocker, blocked),
	CHECK (blocker <> blocked)
);
CREATE INDEX blocks_blocked_idx ON blocks(blocked);

-- Passkeys (WebAuthn)
CREATE TABLE webauthn_credentials (
	id           text PRIMARY KEY,
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	public_key   bytea NOT NULL,
	counter      bigint NOT NULL DEFAULT 0,
	transports   text[] NOT NULL DEFAULT '{}',
	name         text NOT NULL DEFAULT 'Passkey',
	created_at   timestamptz NOT NULL DEFAULT now(),
	last_used_at timestamptz
);
CREATE INDEX webauthn_user_idx ON webauthn_credentials(user_id);

-- Löschprotokoll: nach einer Wiederherstellung aus Sicherung erneut anwenden (DEPLOYMENT.md)
CREATE TABLE deletion_log (
	user_id    uuid NOT NULL,
	deleted_at timestamptz NOT NULL DEFAULT now()
);

-- Neue Aktionen für die Verwaltung
INSERT INTO role_permissions (role_key, action) VALUES ('tech_admin', 'mail.test');

-- Bereits vorhandene Konten (Betreiber aus der Einrichtung) gelten als bestätigt und bekommen ein Profil
UPDATE users SET email_verified_at = coalesce(email_verified_at, created_at) WHERE status = 'active';
