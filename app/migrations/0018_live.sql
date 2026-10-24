-- F-037: Live-Standort-Ebene „Live unterwegs“ (D-088). Je Mitglied höchstens eine Freigabe, immer mit Ablaufzeit.
-- Gespeichert wird NIE der genaue Punkt, sondern nur die Mitte eines ca. 200-m-Rasters (der Server rundet beim Eintreffen).
CREATE TABLE live_shares (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	audience text NOT NULL CHECK (audience IN ('kontakte', 'mitglieder')),
	lon double precision NOT NULL,
	lat double precision NOT NULL,
	started_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL
);
CREATE INDEX live_shares_expires_idx ON live_shares(expires_at);
