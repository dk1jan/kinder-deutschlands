-- Abschnitt 5: Einrichtungen (M22), Veranstaltungen (M12), freie Plätze (M17), regionale Hinweise (M20),
-- Merkliste und Erinnerungen (M18), Familienradar (M05).

-- ---------- Einrichtungen und Partner ----------
CREATE TABLE organizations (
	id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,80}$'),
	name            text NOT NULL CHECK (length(name) BETWEEN 2 AND 160),
	kind            text NOT NULL CHECK (kind IN ('familienzentrum', 'beratung', 'jugendhilfe', 'kommune', 'verein', 'kita', 'kursanbieter', 'veranstalter', 'gesundheit', 'sonstiges')),
	description     text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
	topics          text[] NOT NULL DEFAULT '{}',
	region_code     text REFERENCES regions(code),
	address         text CHECK (length(address) <= 300),
	location        geometry(Point, 4326),
	website         text CHECK (length(website) <= 300),
	email           text CHECK (length(email) <= 200),
	phone           text CHECK (length(phone) <= 60),
	place_id        uuid REFERENCES places(id) ON DELETE SET NULL,
	status          text NOT NULL DEFAULT 'beantragt' CHECK (status IN ('beantragt', 'verifiziert', 'abgelehnt', 'pausiert')),
	-- Angaben zur Prüfung (nur Verwaltung), werden nach der Entscheidung gekürzt
	application     jsonb,
	verified_at     timestamptz,
	verified_by     uuid REFERENCES users(id) ON DELETE SET NULL,
	decision_note   text,
	ics_url         text CHECK (length(ics_url) <= 500),
	created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at      timestamptz NOT NULL DEFAULT now(),
	updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organizations_status_idx ON organizations(status);
CREATE INDEX organizations_region_idx ON organizations(region_code);

-- Berechtigte Mitarbeitende (mehrere je Einrichtung); mindestens eine Person mit „admin“
CREATE TABLE org_members (
	org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	role       text NOT NULL DEFAULT 'redaktion' CHECK (role IN ('admin', 'redaktion')),
	added_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user_idx ON org_members(user_id);

-- Folgen ist privat: Einrichtungen sehen keine Liste, nur eine grobe Zahl
CREATE TABLE org_followers (
	org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_followers_user_idx ON org_followers(user_id);

-- ---------- Veranstaltungen ----------
CREATE TABLE events (
	id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	title                 text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
	description           text NOT NULL DEFAULT '' CHECK (length(description) <= 8000),
	kind                  text NOT NULL CHECK (kind IN ('flohmarkt', 'fest', 'kurs', 'workshop', 'ferien', 'verein', 'treffen', 'beratung', 'sonstiges')),
	topics                text[] NOT NULL DEFAULT '{freizeit}',
	-- Herkunft: Anbieter (verifizierte Einrichtung), Mitglied (privat/Netzwerk), Redaktion, Import (Quelle)
	origin                text NOT NULL CHECK (origin IN ('anbieter', 'mitglied', 'redaktion', 'import')),
	org_id                uuid REFERENCES organizations(id) ON DELETE SET NULL,
	created_by            uuid REFERENCES users(id) ON DELETE SET NULL,
	source_key            text REFERENCES data_sources(key) ON DELETE SET NULL,
	external_id           text,
	source_hash           text,
	source_url            text CHECK (length(source_url) <= 500),
	locked_fields         text[] NOT NULL DEFAULT '{}',
	place_id              uuid REFERENCES places(id) ON DELETE SET NULL,
	location              geometry(Point, 4326),
	address               text CHECK (length(address) <= 300),
	region_code           text REFERENCES regions(code),
	starts_at             timestamptz NOT NULL,
	ends_at               timestamptz,
	all_day               boolean NOT NULL DEFAULT false,
	-- Wiederholung (Teilmenge von RFC 5545: DAILY/WEEKLY/MONTHLY, INTERVAL, BYDAY, COUNT, UNTIL) und Einzelabsagen
	rrule                 text CHECK (length(rrule) <= 200),
	exdates               date[] NOT NULL DEFAULT '{}',
	series_until          timestamptz,
	age_min               smallint CHECK (age_min BETWEEN 0 AND 18),
	age_max               smallint CHECK (age_max BETWEEN 0 AND 18),
	cost_free             boolean,
	cost_text             text CHECK (length(cost_text) <= 200),
	discounts             text CHECK (length(discounts) <= 300),
	-- FreiKarte nur anzeigen, wenn vom Anbieter oder der Redaktion bestätigt
	freikarte             boolean NOT NULL DEFAULT false,
	accessibility         text[] NOT NULL DEFAULT '{}',
	setting               text CHECK (setting IN ('drinnen', 'draussen', 'beides')),
	capacity              integer CHECK (capacity > 0),
	registration_url      text CHECK (length(registration_url) <= 500),
	registration_deadline timestamptz,
	waitlist              boolean NOT NULL DEFAULT false,
	-- oeffentlich = auch ohne Konto im Internet; mitglieder = nur angemeldet; privat = nur mit Link
	visibility            text NOT NULL DEFAULT 'mitglieder' CHECK (visibility IN ('oeffentlich', 'mitglieder', 'privat')),
	share_token           text UNIQUE,
	status                text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('pruefung', 'aktiv', 'abgesagt', 'archiviert', 'entfernt')),
	cancel_note           text CHECK (length(cancel_note) <= 300),
	mod_note              text,
	chat_room_id          text,
	checked_at            timestamptz NOT NULL DEFAULT now(),
	created_at            timestamptz NOT NULL DEFAULT now(),
	updated_at            timestamptz NOT NULL DEFAULT now(),
	UNIQUE (source_key, external_id),
	CHECK (age_min IS NULL OR age_max IS NULL OR age_min <= age_max),
	CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX events_time_idx ON events(starts_at, series_until) WHERE status IN ('aktiv', 'abgesagt');
CREATE INDEX events_location_idx ON events USING gist(location);
CREATE INDEX events_region_idx ON events(region_code);
CREATE INDEX events_org_idx ON events(org_id);

-- „Interessiert“ / „Komme mit“ je Termin (bei Serien je Datum). Teilnehmerlisten sind privat:
-- sichtbar nur, wer ausdrücklich „für Mitkommende sichtbar“ wählt („Wer kommt mit?“).
CREATE TABLE event_attendance (
	event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	occurrence date NOT NULL,
	status     text NOT NULL CHECK (status IN ('interessiert', 'komme_mit')),
	show_me    boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (event_id, user_id, occurrence)
);

-- ---------- Freie Plätze und Kurse ----------
CREATE TABLE offers (
	id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id                     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	title                      text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
	description                text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
	kind                       text NOT NULL CHECK (kind IN ('elternkurs', 'babyschwimmen', 'ferienprogramm', 'betreuung', 'kurs', 'beratung', 'sonstiges')),
	topics                     text[] NOT NULL DEFAULT '{}',
	region_code                text REFERENCES regions(code),
	place_id                   uuid REFERENCES places(id) ON DELETE SET NULL,
	address                    text CHECK (length(address) <= 300),
	location                   geometry(Point, 4326),
	age_min                    smallint CHECK (age_min BETWEEN 0 AND 18),
	age_max                    smallint CHECK (age_max BETWEEN 0 AND 18),
	schedule_text              text CHECK (length(schedule_text) <= 300),
	starts_on                  date,
	cost_text                  text CHECK (length(cost_text) <= 200),
	freikarte                  boolean NOT NULL DEFAULT false,
	-- Verfügbarkeit nur mit Zeitstempel und Gültigkeit; abgelaufen = „unbekannt“, nie „frei“
	availability               text NOT NULL DEFAULT 'unbekannt' CHECK (availability IN ('frei', 'wenige', 'warteliste', 'ausgebucht', 'unbekannt')),
	places_count               integer CHECK (places_count >= 0),
	availability_until         timestamptz,
	availability_confirmed_at  timestamptz,
	availability_confirmed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	reminder_sent_at           timestamptz,
	registration_url           text CHECK (length(registration_url) <= 500),
	contact                    text CHECK (length(contact) <= 300),
	status                     text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'beendet', 'entfernt')),
	created_by                 uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at                 timestamptz NOT NULL DEFAULT now(),
	updated_at                 timestamptz NOT NULL DEFAULT now(),
	CHECK (age_min IS NULL OR age_max IS NULL OR age_min <= age_max)
);
CREATE INDEX offers_org_idx ON offers(org_id);
CREATE INDEX offers_region_idx ON offers(region_code);

-- ---------- Regionale Hinweise ----------
CREATE TABLE notices (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind        text NOT NULL CHECK (kind IN ('neu', 'aktualisiert', 'absage', 'frist', 'sperrung', 'leistung', 'info')),
	title       text NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
	body        text NOT NULL DEFAULT '' CHECK (length(body) <= 1200),
	topics      text[] NOT NULL DEFAULT '{}',
	region_code text REFERENCES regions(code),
	-- Herkunft sichtbar: amtlich bestätigt, Anbieterinformation, Redaktion, ungeprüfter Mitgliederhinweis
	source_kind text NOT NULL CHECK (source_kind IN ('amtlich', 'anbieter', 'redaktion', 'mitglied')),
	source_url  text CHECK (length(source_url) <= 500),
	source_key  text REFERENCES data_sources(key) ON DELETE SET NULL,
	external_id text,
	org_id      uuid REFERENCES organizations(id) ON DELETE SET NULL,
	event_id    uuid REFERENCES events(id) ON DELETE CASCADE,
	offer_id    uuid REFERENCES offers(id) ON DELETE CASCADE,
	place_id    uuid REFERENCES places(id) ON DELETE SET NULL,
	valid_from  timestamptz NOT NULL DEFAULT now(),
	valid_until timestamptz,
	deadline    date,
	-- „dringend“ nur durch die Redaktion; nur dann Sofort-Push (für wer das eingeschaltet hat)
	urgent      boolean NOT NULL DEFAULT false,
	status      text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'archiviert', 'entfernt')),
	created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at  timestamptz NOT NULL DEFAULT now(),
	updated_at  timestamptz NOT NULL DEFAULT now(),
	UNIQUE (source_key, external_id)
);
CREATE INDEX notices_region_idx ON notices(region_code, valid_from DESC);

-- ---------- Merkliste, Erinnerungen, eigener Kalender-Link ----------
CREATE TABLE saved_items (
	user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind        text NOT NULL CHECK (kind IN ('event', 'offer', 'notice')),
	item_id     uuid NOT NULL,
	occurrence  date NOT NULL DEFAULT '1900-01-01',
	remind_at   timestamptz,
	reminded_at timestamptz,
	created_at  timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, kind, item_id, occurrence)
);
CREATE INDEX saved_items_remind_idx ON saved_items(remind_at) WHERE remind_at IS NOT NULL AND reminded_at IS NULL;

-- Persönlicher Kalender-Link (ICS) mit gemerkten Terminen; nur Hash gespeichert, jederzeit erneuerbar
CREATE TABLE calendar_feeds (
	user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	token_hash text NOT NULL UNIQUE,
	created_at timestamptz NOT NULL DEFAULT now(),
	last_used_at timestamptz
);

-- ---------- Familienradar ----------
CREATE TABLE radar_profiles (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
	regions     text[] NOT NULL DEFAULT '{}',
	topics      text[] NOT NULL DEFAULT '{}',
	include     text[] NOT NULL DEFAULT '{veranstaltungen,angebote,hinweise}',
	age_groups  text[] NOT NULL DEFAULT '{}',
	frequency   text NOT NULL DEFAULT 'woechentlich' CHECK (frequency IN ('woechentlich', 'taeglich', 'nur_portal')),
	via_email   boolean NOT NULL DEFAULT false,
	via_push    boolean NOT NULL DEFAULT false,
	paused      boolean NOT NULL DEFAULT false,
	last_sent_at timestamptz,
	created_at  timestamptz NOT NULL DEFAULT now(),
	updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX radar_profiles_user_idx ON radar_profiles(user_id);

-- Was eine Zusammenfassung schon enthielt (keine Dubletten in der nächsten)
CREATE TABLE radar_sent (
	profile_id uuid NOT NULL REFERENCES radar_profiles(id) ON DELETE CASCADE,
	item_kind  text NOT NULL,
	item_id    uuid NOT NULL,
	version    text NOT NULL DEFAULT '',
	sent_at    timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (profile_id, item_kind, item_id)
);

ALTER TABLE notification_settings ADD COLUMN push_reminders boolean NOT NULL DEFAULT true;
ALTER TABLE notification_settings ADD COLUMN push_urgent boolean NOT NULL DEFAULT false;

-- Quellenarten für Termine (ICS) und Hinweise (RSS/Atom)
ALTER TABLE data_sources DROP CONSTRAINT data_sources_kind_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_kind_check CHECK (kind IN ('orte', 'regionen', 'karte', 'termine', 'hinweise'));
ALTER TABLE data_sources ADD COLUMN license_confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE data_sources ADD COLUMN license_confirmed_at timestamptz;

-- Meldungen auch für Veranstaltungen, Angebote, Einrichtungen
ALTER TABLE mod_cases DROP CONSTRAINT mod_cases_target_type_check;
ALTER TABLE mod_cases ADD CONSTRAINT mod_cases_target_type_check CHECK (target_type IN ('post', 'comment', 'media', 'review', 'user', 'group', 'chat', 'event', 'offer', 'org'));

-- Rechte: Einrichtungen prüfen (heikel: wer spricht für wen) und Hinweise/Termine redaktionell pflegen
INSERT INTO role_permissions (role_key, action) VALUES
	('moderator_global', 'orgs.verify'), ('moderator_global', 'notices.edit'), ('moderator_global', 'events.edit'),
	('data_editor', 'notices.edit'), ('data_editor', 'events.edit'),
	('moderator_regional', 'events.edit')
ON CONFLICT DO NOTHING;
