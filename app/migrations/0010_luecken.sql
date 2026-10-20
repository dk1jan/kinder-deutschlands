-- Abschnitt 8.1: Orte abonnieren (M11/M05) – „Bei Änderungen benachrichtigen“ an einem gemerkten Ort.
-- Benachrichtigt wird bei neuen/aufgehobenen Hinweisen (defekt, gesperrt) und neuen Terminen an diesem Ort.
ALTER TABLE place_favorites ADD COLUMN notify boolean NOT NULL DEFAULT false;
CREATE INDEX place_favorites_notify_idx ON place_favorites(place_id) WHERE notify;
