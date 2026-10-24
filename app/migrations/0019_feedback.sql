-- F-052: Feedback aus der Fußzeile (Fehler melden, Fehlerkorrektur, allgemeines Feedback).
-- Nur angemeldete Mitglieder; keine Geräte-/IP-Daten, nur die Seite (Pfad ohne Suchparameter).
CREATE TABLE feedback (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
	kind       text NOT NULL CHECK (kind IN ('fehler', 'korrektur', 'allgemein')),
	body       text NOT NULL CHECK (length(body) BETWEEN 5 AND 2000),
	page       text CHECK (page IS NULL OR length(page) <= 200),
	status     text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'in_arbeit', 'erledigt', 'verworfen')),
	reply      text CHECK (reply IS NULL OR length(reply) <= 500),
	handled_by uuid REFERENCES users(id) ON DELETE SET NULL,
	handled_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_status_idx ON feedback(status, created_at DESC);
CREATE INDEX feedback_user_idx ON feedback(user_id, created_at DESC);

-- Recht: Feedback ansehen und bearbeiten (Admin hat „*“)
INSERT INTO role_permissions (role_key, action) VALUES
	('moderator_global', 'feedback.manage'), ('tech_admin', 'feedback.manage')
ON CONFLICT DO NOTHING;
