-- Abschnitt 3: Community (M03), geschützte Gruppen (M04), Linkkarten/Editor (M07), Wissen (M19),
-- Meldungen und Moderation (M24), Bewertungen/Fotos für Orte (M11/M13, D-025).
-- Alle Community-Inhalte sind nur für angemeldete Mitglieder sichtbar (nicht im offenen Internet).

CREATE TABLE topics (
	key         text PRIMARY KEY,
	name        text NOT NULL,
	description text NOT NULL,
	sort        integer NOT NULL DEFAULT 100
);
INSERT INTO topics (key, name, description, sort) VALUES
	('erziehung', 'Erziehung und Alltag', 'Schlaf, Trotzphase, Geschwister, Medienzeit – Erfahrungen und Fragen.', 10),
	('schwangerschaft-baby', 'Schwangerschaft und Baby', 'Von der Schwangerschaft bis zum ersten Geburtstag.', 20),
	('kinderarzt', 'Kinderarzt und Gesundheit', 'Erfahrungen mit Praxen, Vorsorge, Impfungen – keine Diagnosen.', 30),
	('betreuung', 'Kita und Betreuung', 'Kita-Platz, Tagespflege, Eingewöhnung, Anträge.', 40),
	('schule', 'Schule', 'Einschulung, Hort, Lernen, Ganztag.', 50),
	('alleinerziehende', 'Alleinerziehende', 'Austausch und Unterstützung für Alleinerziehende.', 60),
	('produkte', 'Produkte und Ausstattung', 'Kinderwagen, Autositz, Spielzeug – Erfahrungen statt Werbung.', 70),
	('freizeit', 'Freizeit und Ausflüge', 'Tipps für drinnen und draußen.', 80),
	('lokale-hilfe', 'Lokale Hilfe', 'Hilfe in der Nähe suchen und anbieten.', 90);

-- Gruppen: offen (alle Mitglieder lesen), Beitritt (Anfrage nötig), geschützt (Anfrage + Prüfung, Pseudonym, unsichtbar für andere)
CREATE TABLE community_groups (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,60}$'),
	name         text NOT NULL,
	description  text NOT NULL,
	rules        text,
	kind         text NOT NULL CHECK (kind IN ('offen', 'beitritt', 'geschuetzt')),
	topic_key    text REFERENCES topics(key),
	region_code  text REFERENCES regions(code) ON DELETE SET NULL,
	admission    jsonb NOT NULL DEFAULT '[]',
	status       text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'archiviert')),
	created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
	group_id    uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
	user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	status      text NOT NULL CHECK (status IN ('angefragt', 'aktiv', 'abgelehnt', 'entfernt')),
	-- In geschützten Gruppen: Name nur innerhalb der Gruppe, nicht mit dem Profil verknüpft
	pseudonym   text,
	-- Antworten der Aufnahmeprüfung – werden nach der Entscheidung gelöscht (Datensparsamkeit)
	application jsonb,
	decided_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	decided_at  timestamptz,
	created_at  timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (group_id, user_id)
);
CREATE UNIQUE INDEX group_members_pseudonym_idx ON group_members(group_id, lower(pseudonym)) WHERE pseudonym IS NOT NULL;

CREATE TABLE posts (
	id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind          text NOT NULL CHECK (kind IN ('frage', 'beitrag', 'erfahrung', 'link', 'umfrage')),
	title         text NOT NULL CHECK (length(title) BETWEEN 3 AND 160),
	body          text NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
	topic_key     text REFERENCES topics(key),
	region_code   text REFERENCES regions(code) ON DELETE SET NULL,
	group_id      uuid REFERENCES community_groups(id) ON DELETE CASCADE,
	place_id      uuid REFERENCES places(id) ON DELETE SET NULL,
	author_id     uuid REFERENCES users(id) ON DELETE SET NULL,
	labels        text[] NOT NULL DEFAULT '{}',
	tags          text[] NOT NULL DEFAULT '{}',
	link_url      text,
	link_card     jsonb,
	status        text NOT NULL DEFAULT 'sichtbar' CHECK (status IN ('sichtbar', 'pruefung', 'ausgeblendet', 'entfernt')),
	mod_note      text,
	pinned        boolean NOT NULL DEFAULT false,
	closed        boolean NOT NULL DEFAULT false,
	archived      boolean NOT NULL DEFAULT false,
	solved_comment uuid,
	comment_count integer NOT NULL DEFAULT 0,
	created_at    timestamptz NOT NULL DEFAULT now(),
	edited_at     timestamptz,
	activity_at   timestamptz NOT NULL DEFAULT now(),
	search        tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('german', coalesce(title, '')), 'A') || setweight(to_tsvector('german', coalesce(body, '')), 'B')) STORED
);
CREATE INDEX posts_activity_idx ON posts(activity_at DESC) WHERE status = 'sichtbar';
CREATE INDEX posts_topic_idx ON posts(topic_key, activity_at DESC);
CREATE INDEX posts_region_idx ON posts(region_code, activity_at DESC);
CREATE INDEX posts_group_idx ON posts(group_id, activity_at DESC);
CREATE INDEX posts_search_idx ON posts USING gin(search);
CREATE INDEX posts_tags_idx ON posts USING gin(tags);

CREATE TABLE comments (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
	body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
	status     text NOT NULL DEFAULT 'sichtbar' CHECK (status IN ('sichtbar', 'pruefung', 'ausgeblendet', 'entfernt')),
	mod_note   text,
	helpful    integer NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	edited_at  timestamptz
);
CREATE INDEX comments_post_idx ON comments(post_id, created_at);
ALTER TABLE posts ADD CONSTRAINT posts_solved_fk FOREIGN KEY (solved_comment) REFERENCES comments(id) ON DELETE SET NULL;

CREATE TABLE helpful_marks (
	comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE polls (
	post_id   uuid PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
	options   text[] NOT NULL CHECK (array_length(options, 1) BETWEEN 2 AND 10),
	multiple  boolean NOT NULL DEFAULT false,
	closes_at timestamptz
);
CREATE TABLE poll_votes (
	post_id  uuid NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
	user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	choices  integer[] NOT NULL,
	voted_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (post_id, user_id)
);

CREATE TABLE bookmarks (
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, post_id)
);

-- Abos: Regionen und Themen unabhängig, mehrere gleichzeitig (Region schließt Unterregionen ein)
CREATE TABLE subscriptions (
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       text NOT NULL CHECK (kind IN ('region', 'topic')),
	key        text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, kind, key)
);

-- Bilder: EXIF/GPS entfernt, neu kodiert. Ortsfotos erst nach Freigabe öffentlich.
CREATE TABLE media (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_id   uuid REFERENCES users(id) ON DELETE SET NULL,
	post_id    uuid REFERENCES posts(id) ON DELETE CASCADE,
	place_id   uuid REFERENCES places(id) ON DELETE CASCADE,
	purpose    text NOT NULL CHECK (purpose IN ('beitrag', 'ort', 'linkvorschau')),
	mime       text NOT NULL,
	width      integer NOT NULL,
	height     integer NOT NULL,
	bytes      integer NOT NULL,
	alt        text,
	status     text NOT NULL DEFAULT 'sichtbar' CHECK (status IN ('sichtbar', 'pruefung', 'entfernt')),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_post_idx ON media(post_id);
CREATE INDEX media_place_idx ON media(place_id) WHERE status = 'sichtbar';

-- Bewertungen von Orten (eine je Mitglied und Ort, änderbar)
CREATE TABLE place_reviews (
	id         uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
	place_id   uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	stars      smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
	body       text CHECK (length(body) <= 2000),
	status     text NOT NULL DEFAULT 'sichtbar' CHECK (status IN ('sichtbar', 'pruefung', 'ausgeblendet', 'entfernt')),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (place_id, user_id)
);

-- Meldungen und automatische Markierungen – eine Warteschlange für die Moderation
CREATE TABLE mod_cases (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	target_type  text NOT NULL CHECK (target_type IN ('post', 'comment', 'media', 'review', 'user', 'group')),
	target_id    text NOT NULL,
	source       text NOT NULL CHECK (source IN ('meldung', 'automatisch', 'einspruch')),
	reason       text NOT NULL,
	message      text,
	reporter_id  uuid REFERENCES users(id) ON DELETE SET NULL,
	priority     smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
	-- Zuständigkeit (für regionale/thematische/Gruppen-Moderation)
	region_code  text,
	topic_key    text,
	group_id     uuid,
	status       text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'in_arbeit', 'erledigt', 'eskaliert')),
	assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
	internal_note text,
	decision     text,
	decision_reason text,
	decided_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	decided_at   timestamptz,
	created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mod_cases_open_idx ON mod_cases(status, priority, created_at);
CREATE INDEX mod_cases_target_idx ON mod_cases(target_type, target_id);

-- Einschränkungen von Konten (zeitweise stummschalten); Sperre bleibt users.status = 'suspended'
CREATE TABLE user_restrictions (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       text NOT NULL CHECK (kind IN ('verwarnung', 'stumm')),
	reason     text NOT NULL,
	until      timestamptz,
	case_id    uuid REFERENCES mod_cases(id) ON DELETE SET NULL,
	created_by uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	lifted_at  timestamptz
);
CREATE INDEX user_restrictions_user_idx ON user_restrictions(user_id);

-- Mitteilungen in der App (Antworten, Moderationsentscheidungen, Gruppenaufnahme)
CREATE TABLE notifications (
	id         bigserial PRIMARY KEY,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind       text NOT NULL,
	text       text NOT NULL,
	link       text,
	created_at timestamptz NOT NULL DEFAULT now(),
	read_at    timestamptz
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

-- Wissen aus der Community: redaktionell geprüft, mit Quellen und Prüfdatum
CREATE TABLE knowledge (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	slug         text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,100}$'),
	title        text NOT NULL,
	summary      text NOT NULL,
	body         text NOT NULL,
	sources      jsonb NOT NULL DEFAULT '[]',
	topic_key    text REFERENCES topics(key),
	region_code  text REFERENCES regions(code) ON DELETE SET NULL,
	visibility   text NOT NULL DEFAULT 'mitglieder' CHECK (visibility IN ('mitglieder', 'oeffentlich')),
	status       text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf', 'veroeffentlicht', 'archiviert')),
	from_post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
	-- Zustimmung der Autorin/des Autors bei Übernahme aus einem Beitrag
	consent      text NOT NULL DEFAULT 'nicht_noetig' CHECK (consent IN ('nicht_noetig', 'angefragt', 'erteilt', 'abgelehnt')),
	reviewed_at  timestamptz,
	reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at   timestamptz NOT NULL DEFAULT now(),
	updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Rechte: Moderation darf Fälle bearbeiten und Konten einschränken; Gruppenmoderation nur in ihrer Gruppe;
-- Datenredaktion pflegt Wissenseinträge.
INSERT INTO role_permissions (role_key, action) VALUES
	('moderator_global', 'users.restrict'), ('moderator_global', 'group.manage'), ('moderator_global', 'knowledge.edit'),
	('moderator_regional', 'users.restrict'),
	('moderator_topic', 'users.restrict'),
	('group_moderator', 'content.moderate'), ('group_moderator', 'moderation.review'),
	('data_editor', 'knowledge.edit')
ON CONFLICT DO NOTHING;
