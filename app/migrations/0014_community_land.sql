-- F-023 (Jan 21.10.): Community nach „Ganz Deutschland“ und „Mein Bundesland“.
-- land_code gesetzt = nur Mitglieder dieses Bundeslands (Wohnregion im Profil) und Eingeladene lesen den Beitrag.
-- NULL = ganz Deutschland (wie bisher; bestehende Beiträge bleiben so).
ALTER TABLE posts ADD COLUMN land_code text REFERENCES regions(code);
CREATE INDEX posts_land_idx ON posts(land_code, activity_at DESC) WHERE land_code IS NOT NULL;

-- Einladung in einen Landes-Beitrag: genau dieser Beitrag, lesen und antworten
CREATE TABLE post_invites (
	post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_invites_user_idx ON post_invites(user_id);
CREATE INDEX post_invites_by_idx ON post_invites(invited_by, created_at);

-- Bundesland wechseln höchstens einmal im Monat (gegen „Land wechseln, um mitzulesen“)
ALTER TABLE user_profiles ADD COLUMN land_changed_at timestamptz;

-- Bundesland zu einer Region (Stadtteil → Gemeinde → Kreis → Land)
CREATE FUNCTION kd_land_of(c text) RETURNS text LANGUAGE sql STABLE AS $$
	WITH RECURSIVE up AS (
		SELECT code, parent_code, level, 0 AS depth FROM regions WHERE code = c
		UNION ALL SELECT r.code, r.parent_code, r.level, up.depth + 1 FROM regions r JOIN up ON r.code = up.parent_code WHERE up.depth < 10
	) SELECT code FROM up WHERE level = 'land' LIMIT 1
$$;
