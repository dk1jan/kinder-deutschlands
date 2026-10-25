-- F-056 (Jan 25.10., „go“): Wetter bei Veranstaltungen.
-- (1) Entscheidung des Veranstalters je Termin („findet trotzdem statt“ / „nach drinnen verlegt“). Absagen laufen weiter über events/exdates.
-- (2) Vermerk, wer zu welchem Termin schon wegen einer Wetterwarnung benachrichtigt wurde (höchstens einmal je Person und Termin).
CREATE TABLE event_weather (
	event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	occurrence date NOT NULL,
	status     text NOT NULL CHECK (status IN ('findet_statt', 'drinnen')),
	note       text CHECK (length(note) <= 200),
	set_by     uuid REFERENCES users(id) ON DELETE SET NULL,
	at         timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (event_id, occurrence)
);

CREATE TABLE event_weather_alerts (
	event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	occurrence date NOT NULL,
	user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	warning_id text,
	at         timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (event_id, occurrence, user_id)
);
CREATE INDEX event_weather_alerts_at_idx ON event_weather_alerts(at);
