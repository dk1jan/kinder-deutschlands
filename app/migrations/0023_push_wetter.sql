-- F-059: eigener Schalter für Push bei Wetter an Terminen (Warnung/Regen zur Terminzeit); vorher folgte er "Erinnerungen"
ALTER TABLE notification_settings ADD COLUMN push_weather boolean NOT NULL DEFAULT true;
