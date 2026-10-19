-- Abschnitt 6: Marktplatz (M09), Familien helfen Familien (M16), Lebenslagen-Kompass (M15), Einladungen (M21).

-- ---------- Marktplatz ----------
-- Ort nur grob: Mittelpunkt der gewählten Region (nie die Wohnadresse). Übergabe vereinbaren die Beteiligten selbst.
CREATE TABLE market_listings (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind         text NOT NULL CHECK (kind IN ('verkaufen', 'verschenken', 'tauschen', 'suchen')),
	category     text NOT NULL,
	title        text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
	description  text NOT NULL DEFAULT '',
	price_cents  integer CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 10000000),
	negotiable   boolean NOT NULL DEFAULT false,
	condition    text CHECK (condition IN ('neu', 'wie_neu', 'gut', 'gebraucht', 'defekt')),
	size_text    text,
	age_min      smallint CHECK (age_min BETWEEN 0 AND 18),
	age_max      smallint CHECK (age_max BETWEEN 0 AND 18),
	region_code  text REFERENCES regions(code) ON DELETE SET NULL,
	location     geometry(Point, 4326),
	pickup_only  boolean NOT NULL DEFAULT true,
	safety_ack   boolean NOT NULL DEFAULT false,
	status       text NOT NULL DEFAULT 'verfuegbar' CHECK (status IN ('pruefung', 'verfuegbar', 'reserviert', 'abgegeben', 'abgelaufen', 'entfernt')),
	expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days',
	renewed_at   timestamptz,
	created_at   timestamptz NOT NULL DEFAULT now(),
	updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_listings_status_idx ON market_listings(status, created_at DESC);
CREATE INDEX market_listings_user_idx ON market_listings(user_id);
CREATE INDEX market_listings_region_idx ON market_listings(region_code);
CREATE INDEX market_listings_geo_idx ON market_listings USING gist (location);
CREATE INDEX market_listings_text_idx ON market_listings USING gin (to_tsvector('german', title || ' ' || description));

ALTER TABLE media ADD COLUMN listing_id uuid REFERENCES market_listings(id) ON DELETE CASCADE;
ALTER TABLE media DROP CONSTRAINT media_purpose_check;
ALTER TABLE media ADD CONSTRAINT media_purpose_check CHECK (purpose IN ('beitrag', 'ort', 'linkvorschau', 'markt'));
CREATE INDEX media_listing_idx ON media(listing_id);

-- Suchaufträge: neue passende Anzeigen als Mitteilung (Push ohne Inhalt nur, wenn eingeschaltet)
CREATE TABLE market_searches (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	q            text,
	category     text,
	kinds        text[] NOT NULL DEFAULT '{}',
	region_code  text REFERENCES regions(code) ON DELETE CASCADE,
	max_price_cents integer,
	last_checked_at timestamptz NOT NULL DEFAULT now(),
	created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX market_searches_user_idx ON market_searches(user_id);

-- ---------- Familien helfen Familien ----------
CREATE TABLE help_posts (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind         text NOT NULL CHECK (kind IN ('brauche', 'biete')),
	category     text NOT NULL,
	title        text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
	body         text NOT NULL DEFAULT '',
	region_code  text REFERENCES regions(code) ON DELETE SET NULL,
	status       text NOT NULL DEFAULT 'offen' CHECK (status IN ('pruefung', 'offen', 'erledigt', 'abgelaufen', 'entfernt')),
	expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days',
	created_at   timestamptz NOT NULL DEFAULT now(),
	updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX help_posts_status_idx ON help_posts(status, created_at DESC);
CREATE INDEX help_posts_user_idx ON help_posts(user_id);

-- Kontaktaufnahme aus Marktplatz/Hilfe: Kontaktanfrage mit Bezug (Familien-ID bleibt der Weg)
ALTER TABLE contact_requests DROP CONSTRAINT contact_requests_via_check;
ALTER TABLE contact_requests ADD CONSTRAINT contact_requests_via_check CHECK (via IN ('id', 'qr', 'entdecken', 'markt', 'hilfe'));
ALTER TABLE contact_requests ADD COLUMN ref_kind text CHECK (ref_kind IN ('listing', 'help'));
ALTER TABLE contact_requests ADD COLUMN ref_id uuid;

-- ---------- Lebenslagen-Kompass ----------
-- Inhalte pflegt die Redaktion. Auswahl der Besucher wird nicht gespeichert.
CREATE TABLE life_situations (
	key          text PRIMARY KEY CHECK (key ~ '^[a-z0-9-]{3,40}$'),
	title        text NOT NULL,
	intro        text NOT NULL,
	topic_key    text REFERENCES topics(key),
	org_kinds    text[] NOT NULL DEFAULT '{}',
	sort         integer NOT NULL DEFAULT 100,
	sensitive    boolean NOT NULL DEFAULT false
);

CREATE TABLE life_items (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	situation    text NOT NULL REFERENCES life_situations(key) ON DELETE CASCADE,
	kind         text NOT NULL CHECK (kind IN ('schritt', 'info')),
	section      text,
	title        text NOT NULL,
	body         text NOT NULL DEFAULT '',
	url          text,
	source       text,
	reviewed_at  date,
	sort         integer NOT NULL DEFAULT 100,
	updated_by   uuid REFERENCES users(id) ON DELETE SET NULL,
	updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX life_items_situation_idx ON life_items(situation, sort);

INSERT INTO life_situations (key, title, intro, topic_key, org_kinds, sort, sensitive) VALUES
	('schwangerschaft', 'Schwangerschaft', 'Was vor der Geburt zu erledigen ist, wo es Beratung gibt und wer in der Nähe dasselbe erlebt.', 'schwangerschaft-baby', '{beratung,gesundheit,familienzentrum}', 10, false),
	('geburt', 'Geburt und erste Wochen', 'Anmeldungen und Anträge nach der Geburt, Unterstützung in den ersten Monaten.', 'schwangerschaft-baby', '{familienzentrum,beratung,gesundheit}', 20, false),
	('kita-start', 'Kita-Start', 'Betreuungsplatz finden, anmelden, Eingewöhnung.', 'betreuung', '{kita,familienzentrum,kommune}', 30, false),
	('schule', 'Schule', 'Einschulung, Hort und Ganztag.', 'schule', '{kommune,beratung,familienzentrum}', 40, false),
	('trennung', 'Trennung', 'Unterhalt, Sorge- und Umgangsrecht, Beratung und Austausch mit anderen in derselben Lage.', 'alleinerziehende', '{beratung,jugendhilfe,kommune}', 50, true),
	('geld-knapp', 'Wenn das Geld knapp ist', 'Leistungen, auf die Familien Anspruch haben können, und Beratung in der Nähe.', 'lokale-hilfe', '{beratung,kommune,jugendhilfe}', 60, true);

-- Erste Inhalte: nur aus dem Familienportal des Bundesfamilienministeriums (abgerufen 19.10.2026)
INSERT INTO life_items (situation, kind, section, title, body, url, source, reviewed_at, sort) VALUES
	('schwangerschaft', 'schritt', 'Vor der Geburt', 'Arbeitgeber über Schwangerschaft und errechneten Termin informieren', 'Wichtig für den Mutterschutz.', 'https://familienportal.de/familienportal/familienleistungen/mutterschutz', 'Familienportal (BMFSFJ)', '2026-10-19', 10),
	('schwangerschaft', 'schritt', 'Vor der Geburt', 'Mutterschaftsgeld beantragen', '', 'https://familienportal.de/familienportal/familienleistungen/mutterschaftsleistungen/wie-kann-ich-mutterschaftsgeld-der-gesetzlichen-krankenkasse-berechnen-und-beantragen--125038', 'Familienportal (BMFSFJ)', '2026-10-19', 20),
	('schwangerschaft', 'schritt', 'Vor der Geburt', 'Mutterschutzlohn beantragen, falls ein Beschäftigungsverbot gilt', '', 'https://familienportal.de/familienportal/familienleistungen/mutterschaftsleistungen/was-ist-mutterschutzlohn-und-wann-bekomme-ich-ihn--125048', 'Familienportal (BMFSFJ)', '2026-10-19', 30),
	('schwangerschaft', 'schritt', 'Vor der Geburt', 'Elterngeld mit dem Elterngeldrechner planen', '', 'https://familienportal.de/familienportal/rechner-antraege/elterngeldrechner-126930', 'Familienportal (BMFSFJ)', '2026-10-19', 40),
	('schwangerschaft', 'schritt', 'Wenn ihr nicht verheiratet seid', 'Vaterschaftsanerkennung beim Standesamt oder Jugendamt (auch vor der Geburt möglich)', '', 'https://familienportal.de/familienportal/lebenslagen/schwangerschaft-geburt/vaterschaftanerkennung', 'Familienportal (BMFSFJ)', '2026-10-19', 50),
	('schwangerschaft', 'schritt', 'Wenn ihr nicht verheiratet seid', 'Gemeinsame Sorgeerklärung, z. B. beim Jugendamt oder Notar (auch vor der Geburt möglich)', '', 'https://familienportal.de/familienportal/lebenslagen/trennung/sorgerecht-umgangsrecht-und-namensrecht/was-regelt-das-sorgerecht--126082', 'Familienportal (BMFSFJ)', '2026-10-19', 60),
	('schwangerschaft', 'info', NULL, 'Checkliste vor der Geburt (PDF)', '', 'https://familienportal.de/resource/blob/197876/7344c8e4c7f0c2ae5bce49d5b7be0501/pdf-checkliste-vor-der-geburt-data.pdf', 'Familienportal (BMFSFJ)', '2026-10-19', 70),
	('schwangerschaft', 'info', NULL, 'Staatliche Leistungen in der Schwangerschaft und nach der Geburt', '', 'https://familienportal.de/familienportal/lebenslagen/schwangerschaft-geburt/staatliche-leistungen', 'Familienportal (BMFSFJ)', '2026-10-19', 80),
	('schwangerschaft', 'info', NULL, 'Frühe Hilfen für Schwangere und Eltern mit Kindern bis 3 Jahre', '', 'https://familienportal.de/familienportal/lebenslagen/schwangerschaft-geburt/fruehe-hilfen/hilfen-fuer-schwangere-eltern-mit-kindern-bis-3-jahre-134494', 'Familienportal (BMFSFJ)', '2026-10-19', 90),

	('geburt', 'schritt', 'Nach der Geburt', 'Kind innerhalb von 7 Werktagen beim Standesamt anmelden', '', 'https://familienportal.de/familienportal/lebenslagen/schwangerschaft-geburt/anmeldung-standesamt', 'Familienportal (BMFSFJ)', '2026-10-19', 10),
	('geburt', 'schritt', 'Nach der Geburt', 'Krankenkasse über die Geburt informieren', '', NULL, 'Familienportal (BMFSFJ)', '2026-10-19', 20),
	('geburt', 'schritt', 'Nach der Geburt', 'Kindergeld beantragen', '', 'https://familienportal.de/familienportal/familienleistungen/kindergeld/faq/wie-wird-kindergeld-beantragt-und-ausgezahlt--124954', 'Familienportal (BMFSFJ)', '2026-10-19', 30),
	('geburt', 'schritt', 'Nach der Geburt', 'Elterngeld beantragen', '', 'https://familienportal.de/familienportal/familienleistungen/elterngeld/faq/wie-kann-ich-elterngeld-beantragen--124762', 'Familienportal (BMFSFJ)', '2026-10-19', 40),
	('geburt', 'schritt', 'Nach der Geburt', 'Mutterschaftsleistungen beantragen', '', 'https://familienportal.de/familienportal/familienleistungen/mutterschaftsleistungen/was-sind-mutterschaftsleistungen-mutterschutzlohn-und-mutterschaftsgeld--124744', 'Familienportal (BMFSFJ)', '2026-10-19', 50),
	('geburt', 'schritt', 'Nach der Geburt', 'Bei Frühgeburt: Arbeitgeber informieren', '', 'https://familienportal.de/familienportal/lebenslagen/schwangerschaft-geburt/fruehgeborene', 'Familienportal (BMFSFJ)', '2026-10-19', 60),
	('geburt', 'schritt', 'Nach der Geburt', 'Termine für die weiteren Vorsorgeuntersuchungen beim Kinderarzt vereinbaren', '', NULL, 'Familienportal (BMFSFJ)', '2026-10-19', 70),
	('geburt', 'schritt', 'Alleinerziehend', 'Kindesunterhalt oder Unterhaltsvorschuss prüfen', '', 'https://familienportal.de/familienportal/familienleistungen/unterhaltsvorschuss', 'Familienportal (BMFSFJ)', '2026-10-19', 80),
	('geburt', 'schritt', 'Alleinerziehend', 'Bei Konflikten: Beistandschaft beim Jugendamt beantragen', '', 'https://familienportal.de/familienportal/lebenslagen/trennung/allein-und-getrennt-erziehende-eltern/wie-kann-ich-unterhalt-und-vaterschaft-mit-einem-beistand-regeln--126098', 'Familienportal (BMFSFJ)', '2026-10-19', 90),
	('geburt', 'info', NULL, 'Checkliste nach der Geburt (PDF)', '', 'https://familienportal.de/resource/blob/197878/265ab144eaa4bc32770d69a7f2568eb5/pdf-checkliste-nach-der-geburt-data.pdf', 'Familienportal (BMFSFJ)', '2026-10-19', 100),
	('geburt', 'info', NULL, 'Zuständiges Jugendamt finden', '', 'https://familienportal.de/dynamic/action/familienportal/125008/suche', 'Familienportal (BMFSFJ)', '2026-10-19', 110),

	('kita-start', 'info', NULL, 'Kinderbetreuung: Informationen des Familienportals', '', 'https://familienportal.de/familienportal/lebenslagen/ausbildung-beruf/kinderbetreuung', 'Familienportal (BMFSFJ)', '2026-10-19', 10),
	('schule', 'info', NULL, 'Kinder und Jugendliche: staatliche Leistungen', '', 'https://familienportal.de/familienportal/lebenslagen/kinder-jugendliche/staatliche-leistungen', 'Familienportal (BMFSFJ)', '2026-10-19', 10),
	('schule', 'info', NULL, 'Bildung und Teilhabe (z. B. Schulbedarf, Klassenfahrten, Mittagessen)', '', 'https://familienportal.de/familienportal/familienleistungen/bildung-und-teilhabe', 'Familienportal (BMFSFJ)', '2026-10-19', 20),

	('trennung', 'info', NULL, 'Trennung: Überblick', '', 'https://familienportal.de/familienportal/lebenslagen/trennung', 'Familienportal (BMFSFJ)', '2026-10-19', 10),
	('trennung', 'info', NULL, 'Staatliche Leistungen bei Trennung', '', 'https://familienportal.de/familienportal/lebenslagen/trennung/staatliche-leistungen', 'Familienportal (BMFSFJ)', '2026-10-19', 20),
	('trennung', 'info', NULL, 'Allein- und getrennt erziehende Eltern', '', 'https://familienportal.de/familienportal/lebenslagen/trennung/allein-und-getrennt-erziehende-eltern', 'Familienportal (BMFSFJ)', '2026-10-19', 30),
	('trennung', 'info', NULL, 'Sorgerecht, Umgangsrecht und Namensrecht', '', 'https://familienportal.de/familienportal/lebenslagen/trennung/sorgerecht-umgangsrecht-und-namensrecht/was-regelt-das-sorgerecht--126082', 'Familienportal (BMFSFJ)', '2026-10-19', 40),
	('trennung', 'info', NULL, 'Unterhaltsvorschuss', '', 'https://familienportal.de/familienportal/familienleistungen/unterhaltsvorschuss', 'Familienportal (BMFSFJ)', '2026-10-19', 50),

	('geld-knapp', 'info', NULL, 'Kinderzuschlag', '', 'https://familienportal.de/familienportal/familienleistungen/kinderzuschlag', 'Familienportal (BMFSFJ)', '2026-10-19', 10),
	('geld-knapp', 'info', NULL, 'Bildung und Teilhabe', '', 'https://familienportal.de/familienportal/familienleistungen/bildung-und-teilhabe', 'Familienportal (BMFSFJ)', '2026-10-19', 20),
	('geld-knapp', 'info', NULL, 'Wohngeld', '', 'https://familienportal.de/familienportal/familienleistungen/weitere-leistungen/wohngeld', 'Familienportal (BMFSFJ)', '2026-10-19', 30),
	('geld-knapp', 'info', NULL, 'Bürgergeld und Arbeitslosengeld', '', 'https://familienportal.de/familienportal/familienleistungen/weitere-leistungen/arbeitslosengeld', 'Familienportal (BMFSFJ)', '2026-10-19', 40),
	('geld-knapp', 'info', NULL, 'Unterhaltsvorschuss', '', 'https://familienportal.de/familienportal/familienleistungen/unterhaltsvorschuss', 'Familienportal (BMFSFJ)', '2026-10-19', 50),
	('geld-knapp', 'info', NULL, 'Alle Familienleistungen im Überblick', '', 'https://familienportal.de/familienportal/familienleistungen', 'Familienportal (BMFSFJ)', '2026-10-19', 60);

-- ---------- Einladungen (Kindergeburtstag u. Ä.) ----------
-- Zugang nur per Link (Token gehasht; verschlüsselte Kopie, damit die Gastgeberin den Link erneut kopieren kann).
-- Gästeliste sieht nur die Gastgeberin. Daten der Gäste werden 30 Tage nach dem Termin gelöscht.
CREATE TABLE invitations (
	id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	organizer_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
	message       text NOT NULL DEFAULT '',
	starts_at     timestamptz NOT NULL,
	ends_at       timestamptz,
	place_text    text,
	address_after_rsvp boolean NOT NULL DEFAULT true,
	place_id      uuid REFERENCES places(id) ON DELETE SET NULL,
	rsvp_until    timestamptz,
	max_guests    smallint CHECK (max_guests BETWEEN 1 AND 200),
	guests_see_list boolean NOT NULL DEFAULT false,
	token_hash    text,
	token_enc     text,
	link_expires_at timestamptz,
	status        text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'abgesagt')),
	cancel_note   text,
	chat_room_id  text,
	created_at    timestamptz NOT NULL DEFAULT now(),
	updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_token_idx ON invitations(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX invitations_organizer_idx ON invitations(organizer_id);

CREATE TABLE invitation_rsvps (
	id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
	user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
	guest_key_hash text,
	name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
	answer        text NOT NULL CHECK (answer IN ('ja', 'nein', 'vielleicht')),
	kids          smallint NOT NULL DEFAULT 0 CHECK (kids BETWEEN 0 AND 10),
	adults        smallint NOT NULL DEFAULT 0 CHECK (adults BETWEEN 0 AND 10),
	note          text,
	created_at    timestamptz NOT NULL DEFAULT now(),
	updated_at    timestamptz NOT NULL DEFAULT now(),
	CHECK (user_id IS NOT NULL OR guest_key_hash IS NOT NULL)
);
CREATE UNIQUE INDEX invitation_rsvps_user_idx ON invitation_rsvps(invitation_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX invitation_rsvps_guest_idx ON invitation_rsvps(invitation_id, guest_key_hash) WHERE guest_key_hash IS NOT NULL;

-- Event-Chat zu „Wer kommt mit?“ (M12): je Termin-Tag ein verschlüsselter Raum mit Ablauf (Beitritt per Ticket, wie Treffen)
CREATE TABLE event_chats (
	event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
	occurrence  date NOT NULL,
	room_id     text NOT NULL REFERENCES chat_rooms(room_id) ON DELETE CASCADE,
	created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
	created_at  timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (event_id, occurrence)
);

-- Merken: auch Anzeigen
ALTER TABLE saved_items DROP CONSTRAINT saved_items_kind_check;
ALTER TABLE saved_items ADD CONSTRAINT saved_items_kind_check CHECK (kind IN ('event', 'offer', 'notice', 'listing'));

-- Push für Marktplatz-Suchaufträge
ALTER TABLE notification_settings ADD COLUMN push_market boolean NOT NULL DEFAULT false;

-- Moderation
ALTER TABLE mod_cases DROP CONSTRAINT mod_cases_target_type_check;
ALTER TABLE mod_cases ADD CONSTRAINT mod_cases_target_type_check CHECK (target_type IN ('post', 'comment', 'media', 'review', 'user', 'group', 'chat', 'event', 'offer', 'org', 'listing', 'help', 'invitation'));

-- Redaktion des Kompasses
INSERT INTO role_permissions (role_key, action) VALUES
	('moderator_global', 'compass.edit'), ('data_editor', 'compass.edit')
ON CONFLICT DO NOTHING;
