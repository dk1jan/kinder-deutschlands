-- Abschnitt 8.2
-- Aufnahme durch Partnerorganisationen (M04): Eine Gruppe mit Beitritt oder eine geschützte Gruppe kann einer
-- verifizierten Einrichtung zugeordnet werden. Deren Verwaltung entscheidet über Aufnahmeanfragen – sieht dabei
-- wie die Gruppenmoderation nur Gruppenname/Pseudonym und Antworten, nie das Profil (geschützt). Sie moderiert keine Inhalte.
ALTER TABLE community_groups ADD COLUMN partner_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

-- Hinweise von Mitgliedern (M20): Vorschlag → „pruefung“ → Redaktion gibt frei („aktiv“) oder lehnt ab.
-- Herkunft bleibt sichtbar „Hinweis eines Mitglieds“ – nicht amtlich, nicht vom Anbieter.
ALTER TABLE notices DROP CONSTRAINT notices_status_check;
ALTER TABLE notices ADD CONSTRAINT notices_status_check CHECK (status IN ('pruefung', 'aktiv', 'abgelehnt', 'archiviert', 'entfernt'));
ALTER TABLE notices ADD COLUMN review_note text CHECK (length(review_note) <= 300);
CREATE INDEX notices_review_idx ON notices(created_at) WHERE status = 'pruefung';
