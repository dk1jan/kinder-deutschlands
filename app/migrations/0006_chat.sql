-- Abschnitt 4: Kommunikation (M02) und Treffen (M06).
-- Nachrichteninhalte liegen NICHT hier: Sie sind Ende-zu-Ende-verschlüsselt auf dem Chat-Server (Synapse).
-- Hier nur, was die Plattformregeln brauchen: Zuordnung Konto ↔ Chat-Kennung, Raumart, Ablauf von Treffen,
-- Push-Abos und Benachrichtigungseinstellungen.

-- Chat-Kennung je Konto (zufällig, nicht aus Familien-ID oder Konto-ID ableitbar)
CREATE TABLE chat_accounts (
	user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	localpart   text NOT NULL UNIQUE CHECK (localpart ~ '^k[a-z2-7]{15}$'),
	created_at  timestamptz NOT NULL DEFAULT now(),
	synced_name text
);

-- Räume, die über die App angelegt wurden (Direktchat, Gruppe, Treffen)
CREATE TABLE chat_rooms (
	room_id          text PRIMARY KEY,
	kind             text NOT NULL CHECK (kind IN ('direkt', 'gruppe', 'treffen')),
	created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
	dm_a             uuid REFERENCES users(id) ON DELETE CASCADE,
	dm_b             uuid REFERENCES users(id) ON DELETE CASCADE,
	expires_at       timestamptz,
	join_token_hash  text UNIQUE,
	status           text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'abgelaufen', 'geloescht')),
	created_at       timestamptz NOT NULL DEFAULT now(),
	ended_at         timestamptz,
	CHECK (kind <> 'direkt' OR (dm_a IS NOT NULL AND dm_b IS NOT NULL AND dm_a < dm_b)),
	CHECK (kind = 'treffen' OR expires_at IS NULL)
);
CREATE UNIQUE INDEX chat_rooms_dm_idx ON chat_rooms(dm_a, dm_b) WHERE kind = 'direkt' AND status = 'aktiv';
CREATE INDEX chat_rooms_expiry_idx ON chat_rooms(expires_at) WHERE status = 'aktiv' AND expires_at IS NOT NULL;

-- Beitrittsberechtigung nach QR-Scan (kurz gültig, nur für diesen Raum)
CREATE TABLE chat_join_tickets (
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	room_id    text NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
	expires_at timestamptz NOT NULL,
	PRIMARY KEY (user_id, room_id)
);

-- Web-Push-Abos je Gerät/Browser. id = pushkey für den Chat-Server (zufällig).
CREATE TABLE push_subscriptions (
	id           text PRIMARY KEY,
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	endpoint     text NOT NULL UNIQUE,
	p256dh       text NOT NULL,
	auth         text NOT NULL,
	device_label text,
	created_at   timestamptz NOT NULL DEFAULT now(),
	last_used_at timestamptz,
	failures     int NOT NULL DEFAULT 0
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);

-- Benachrichtigungen, Ruhezeiten, Lesebestätigungen und Tippanzeige (standardmäßig aus)
CREATE TABLE notification_settings (
	user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	push_chat      boolean NOT NULL DEFAULT true,
	push_community boolean NOT NULL DEFAULT false,
	quiet_from     smallint CHECK (quiet_from BETWEEN 0 AND 1439),
	quiet_to       smallint CHECK (quiet_to BETWEEN 0 AND 1439),
	read_receipts  boolean NOT NULL DEFAULT false,
	typing         boolean NOT NULL DEFAULT false,
	updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Gemeldete Chatnachrichten: Inhalt nur, wenn die meldende Person ihn ausdrücklich freigibt (mod_cases.message/evidence).
ALTER TABLE mod_cases ADD COLUMN evidence jsonb;
ALTER TABLE mod_cases DROP CONSTRAINT mod_cases_target_type_check;
ALTER TABLE mod_cases ADD CONSTRAINT mod_cases_target_type_check CHECK (target_type IN ('post', 'comment', 'media', 'review', 'user', 'group', 'chat'));
