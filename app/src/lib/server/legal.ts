// Impressum und Datenschutzerklärung (Querschnitt, D-067): pflegbar in Verwaltung → Rechtstexte.
// Die Datenschutzerklärung startet als Entwurf, der aus den tatsächlichen Funktionen dieses Systems erzeugt wird.
// Sie gilt als Entwurf, bis der Betreiber die rechtliche Prüfung bestätigt – das steht dann auch öffentlich dabei.
// Keine erfundenen Angaben: fehlende Betreiberdaten bleiben als „fehlt“ sichtbar.
import type { Sql } from './db';
import { audit } from './audit';
import { formatContactId } from './contactid';

export interface Imprint {
	provider: string; // Name bzw. Firma
	street: string;
	city: string; // PLZ Ort
	country: string;
	email: string;
	phone: string;
	represented: string; // vertreten durch (bei Vereinen/Firmen)
	register: string; // Registereintrag (optional)
	vat: string; // USt-IdNr. (optional)
	responsible: string; // Verantwortlich für Inhalte (Name, Anschrift) – optional
}

export interface LegalSettings {
	imprint: Imprint;
	hosting: string; // Hoster/Rechenzentrum, z. B. „IONOS SE, Rechenzentrum in Deutschland“ – vom Betreiber einzutragen
	authority: string; // zuständige Datenschutz-Aufsichtsbehörde – vom Betreiber einzutragen
	privacy_text: string | null; // eigener (bearbeiteter) Text; null = erzeugter Entwurf
	imprint_extra: string; // weitere Angaben im Impressum (optional)
	checked_at: string | null;
	checked_by: string | null; // Familien-ID der Person, die die Prüfung bestätigt hat
	checked_note: string | null;
	updated_at: string | null;
}

const EMPTY_IMPRINT: Imprint = { provider: '', street: '', city: '', country: 'Deutschland', email: '', phone: '', represented: '', register: '', vat: '', responsible: '' };
const DEFAULT: LegalSettings = { imprint: EMPTY_IMPRINT, hosting: '', authority: '', privacy_text: null, imprint_extra: '', checked_at: null, checked_by: null, checked_note: null, updated_at: null };

export async function getLegal(sql: Sql): Promise<LegalSettings> {
	const [r] = await sql`select value from settings where key = 'legal'`;
	const v = (r?.value as Partial<LegalSettings>) ?? {};
	return { ...DEFAULT, ...v, imprint: { ...EMPTY_IMPRINT, ...(v.imprint ?? {}) } };
}

/** Pflichtangaben vollständig? (Name, Anschrift, E-Mail) */
export function imprintComplete(i: Imprint): boolean {
	return !!(i.provider.trim() && i.street.trim() && i.city.trim() && i.email.trim());
}

export class LegalError extends Error {}

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

export async function saveLegal(
	sql: Sql,
	actorId: string,
	i: { imprint: Partial<Imprint>; hosting: string; authority: string; imprintExtra: string; privacyText: string | null; resetPrivacy: boolean; checked: boolean; note: string | null }
) {
	const cur = await getLegal(sql);
	const imprint: Imprint = { ...EMPTY_IMPRINT };
	for (const k of Object.keys(EMPTY_IMPRINT) as (keyof Imprint)[]) imprint[k] = clip(i.imprint[k] ?? cur.imprint[k], k === 'responsible' || k === 'represented' ? 300 : 200);
	if (imprint.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(imprint.email)) throw new LegalError('Die Kontakt-E-Mail im Impressum ist ungültig.');
	const privacy = i.resetPrivacy ? null : i.privacyText !== null ? clip(i.privacyText, 60_000) || null : cur.privacy_text;
	if (i.checked && !imprintComplete(imprint)) throw new LegalError('Prüfung erst bestätigen, wenn Name, Anschrift und E-Mail im Impressum stehen.');
	const changed = JSON.stringify([imprint, privacy, clip(i.hosting, 300), clip(i.authority, 300), clip(i.imprintExtra, 3000)]) !==
		JSON.stringify([cur.imprint, cur.privacy_text, cur.hosting, cur.authority, cur.imprint_extra]);
	const [p] = await sql`select contact_id from user_profiles where user_id = ${actorId}`;
	const v: LegalSettings = {
		imprint,
		hosting: clip(i.hosting, 300),
		authority: clip(i.authority, 300),
		imprint_extra: clip(i.imprintExtra, 3000),
		privacy_text: privacy,
		// Jede inhaltliche Änderung hebt die Bestätigung auf – geprüft ist nur, was geprüft wurde
		checked_at: i.checked ? new Date().toISOString() : changed ? null : cur.checked_at,
		checked_by: i.checked ? (p ? formatContactId(p.contact_id) : null) : changed ? null : cur.checked_by,
		checked_note: i.checked ? clip(i.note, 500) || null : changed ? null : cur.checked_note,
		updated_at: changed ? new Date().toISOString() : cur.updated_at
	};
	await sql`insert into settings (key, value) values ('legal', ${sql.json(v as never)}) on conflict (key) do update set value = excluded.value, updated_at = now()`;
	await audit(sql, { actorId, action: 'legal.saved', targetType: 'settings', targetId: 'legal', meta: { checked: i.checked, changed, own_privacy_text: v.privacy_text !== null } });
	return v;
}

const or = (v: string, missing: string) => (v.trim() ? v.trim() : `[${missing} – fehlt, bitte in der Verwaltung eintragen]`);

/**
 * Entwurf der Datenschutzerklärung aus den tatsächlichen Funktionen dieses Systems (Stand Abschnitt 8).
 * Format: „## Überschrift“, Absätze, Listen mit „- “. Muss vom Betreiber rechtlich geprüft werden.
 */
export function privacyDraft(l: LegalSettings, appUrl: string): string {
	const i = l.imprint;
	const who = [or(i.provider, 'Name/Firma'), or(i.street, 'Straße'), or(i.city, 'PLZ Ort'), i.country].filter(Boolean).join(', ');
	return `## Wer verantwortlich ist
${who}
E-Mail: ${or(i.email, 'E-Mail')}${i.phone ? `\nTelefon: ${i.phone}` : ''}

## Kurz gesagt
- Kein Tracking, keine Werbe- oder Analysedienste, keine Weitergabe an Datenhändler.
- Karten, Kartenkacheln, Luftbilder und Linkvorschauen laufen über unseren eigenen Server – deine IP-Adresse geht dabei nicht an Dritte.
- Chats und Anrufe sind Ende-zu-Ende-verschlüsselt. Wir können die Inhalte nicht lesen.
- Deine Profilangaben siehst nur du, bis du sie freigibst – für jede Angabe einzeln.
- Du kannst dein Konto jederzeit selbst löschen und deine Daten herunterladen (Mein Konto).

## Wo die Daten liegen
Alle Teile laufen auf einem eigenen Server des Betreibers: ${or(l.hosting, 'Hoster und Standort des Servers')}. Es gibt keine Anbindung an andere Chat-Server (keine Föderation).

## Konto und Anmeldung
- Gespeichert: E-Mail-Adresse, Passwort nur als Hash (scrypt), optional Passkeys (öffentlicher Schlüssel) und Zwei-Faktor-Geheimnis.
- Zweck: Anmeldung, Bestätigung der Adresse, Passwort zurücksetzen, auf Wunsch Familienradar per E-Mail. Die Adresse wird nicht für Werbung genutzt.
- Sitzungen: Ein notwendiges Cookie („kd_session“) hält dich angemeldet. Auf dem Server liegt nur ein Hash davon, dazu Ablaufzeit (30 Tage nach letzter Nutzung) und die Gerätebezeichnung des Browsers, damit du deine Geräte siehst und abmelden kannst.
- Rechtsgrundlage: Nutzungsvertrag (Art. 6 Abs. 1 lit. b DSGVO).

## Profil und Familien-ID
Anzeigename, „Ich kann helfen“, „Ich suche“, Interessen, Altersgruppen der Kinder und Region – alles freiwillig. Für jede Angabe legst du fest, wer sie sieht (alle, Mitglieder, Mitglieder deiner Gruppen, Kontakte, nur du). Die Familien-ID ist zufällig und nicht aus deinen Daten abgeleitet. Auffindbar bist du nur, wenn du das einschaltest.

## Community, Gruppen, Marktplatz, Hilfe, Hinweise, Routen
Was du schreibst oder einstellst, ist für den Kreis sichtbar, den die jeweilige Funktion anzeigt (z. B. nur Mitglieder). Community-Beiträge „nur für dein Bundesland“ sehen nur Mitglieder mit Wohnregion in diesem Land und Personen, die jemand per Familien-ID gezielt zu genau diesem Beitrag einlädt; wer eingeladen hat, sieht die Verfasserin bzw. der Verfasser. Dein Bundesland ergibt sich aus der Wohnregion im Profil und lässt sich höchstens einmal im Monat wechseln. In geschützten Gruppen trittst du mit einem eigenen Gruppennamen auf; Antworten der Aufnahmeprüfung werden nach der Entscheidung gelöscht. Marktplatz und Hilfe zeigen nie deine Adresse, nur die Gegend. Bei Fotos entfernen wir Metadaten (z. B. Standort, Kamera). Hinweise und Kinderwagenrouten von Mitgliedern prüft die Redaktion vor der Veröffentlichung. Zeichnest du eine Route per GPS auf, bleibt die Aufzeichnung auf deinem Gerät, bis du sie absendest; gespeichert wird nur die Linie (keine Uhrzeiten, kein Tempo), Anfang und Ende werden vorher gekürzt (standardmäßig je 50 m, von dir einstellbar). Rechtsgrundlage: Nutzungsvertrag.

## Chat und Anrufe
- Nachrichten, Bilder, Dateien, Sprachnachrichten, geteilte Standorte und die Anrufsignalisierung sind Ende-zu-Ende-verschlüsselt und werden nur in den Geräten der Beteiligten entschlüsselt.
- Der Chat-Server speichert verschlüsselte Inhalte sowie technisch nötige Angaben: wer in welchem Raum ist, Zeitpunkte, Geräte. IP-Adressen der Chat-Verbindungen werden nach 14 Tagen gelöscht.
- Anrufe gehen direkt von Gerät zu Gerät oder, wenn das nicht klappt, über unseren eigenen Vermittlungsserver (TURN), der nur verschlüsselte Daten sieht. Bei direkter Verbindung kann das Gerät der anderen Person deine IP-Adresse sehen.
- Gruppenanrufe laufen über unseren eigenen Medienserver. Bild und Ton sind zusätzlich Ende-zu-Ende-verschlüsselt; den Schlüssel tauschen nur die Geräte der Teilnehmenden über den verschlüsselten Chat aus. Der Medienserver sieht deine IP-Adresse und deine zufällige Chat-Kennung, solange du im Anruf bist, aber keine Inhalte. Es gibt keinen Mitschnitt und keine Anrufprotokolle; technische Fehlermeldungen werden nur kurz in rotierenden Server-Logs gehalten.
- Gemeldete Nachrichten erreicht die Moderation nur, wenn du sie beim Melden ausdrücklich mitschickst.
- Die Suche im Chat findet nur auf deinem Gerät statt.

## Mitteilungen und Push
Push-Mitteilungen nur, wenn du sie im Browser erlaubst und in deinen Einstellungen einschaltest. Sie enthalten keine Inhalte (z. B. „Neue Nachricht“). Zur Zustellung nutzt dein Browser den Push-Dienst seines Herstellers (z. B. Apple, Google, Mozilla); dieser erhält eine zufällige Geräteadresse und den verschlüsselten Hinweis, aber keinen Inhalt. Rechtsgrundlage: Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit abschaltbar.

## Standort
Dein Standort wird nur im Browser verwendet, wenn du „Mein Standort“ antippst (z. B. für Entfernungen), und nicht gespeichert. Live-Standort teilst du nur bewusst im verschlüsselten Chat, für 15, 30 oder 60 Minuten.

## Karte, Luftbild und Links
Kartenkacheln liegen auf unserem Server (Daten © OpenStreetMap-Mitwirkende). Luftbilder holt unser Server für dich ab, deine IP-Adresse geht nicht an den Anbieter. Für Linkvorschauen ruft unser Server die verlinkte Seite ab. Eingebettete Videos (YouTube, Vimeo) laden erst nach deinem Klick – dann gelten die Bestimmungen des jeweiligen Anbieters.

## Protokolle und Sicherheit
Für Sicherheit und Nachvollziehbarkeit protokollieren wir Verwaltungsaktionen (wer, wann, was, warum) mit gehashter IP-Adresse (nicht im Klartext) – ohne private Inhalte. Rechtsgrundlage: berechtigtes Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO).

## Speicherdauer und Löschung
- Konto löschen: sofort selbst möglich. Profil, Kontakte, Bewertungen, Bilder, Anzeigen, Hilfe-Einträge, Einladungen, Hinweis-Vorschläge und eigene Routen werden gelöscht; Beiträge und Antworten in der Community werden geleert („[gelöscht]“), damit Gesprächsverläufe lesbar bleiben; der Chat-Zugang wird stillgelegt.
- Treffen-Räume, Einladungen und Event-Chats werden nach Ablauf automatisch gelöscht.
- Sicherungskopien werden 14 Tage aufbewahrt. Wird eine Sicherung zurückgespielt, löschen wir zwischenzeitlich gelöschte Konten erneut.

## E-Mail-Versand
E-Mails versenden wir über den Mailserver des Betreibers. Inhalt: Bestätigungen, Passwort zurücksetzen, auf Wunsch der Familienradar.

## Deine Rechte
Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie das Recht, eine Einwilligung jederzeit zu widerrufen. Vieles davon kannst du direkt unter „Mein Konto“ erledigen (Datenexport, Löschung, Sichtbarkeit). Beschwerden kannst du bei einer Datenschutz-Aufsichtsbehörde einreichen, zum Beispiel bei: ${or(l.authority, 'zuständige Aufsichtsbehörde')}.

## Kontakt zum Datenschutz
${or(i.email, 'E-Mail')}

Adresse dieses Angebots: ${appUrl}`;
}

export type LegalBlock = { t: 'h' | 'p' | 'li'; text: string };

/** Einfaches, sicheres Format für Rechtstexte: „## “ Überschrift, „- “ Listenpunkt, Leerzeile = neuer Absatz. */
export function legalBlocks(text: string): LegalBlock[] {
	const out: LegalBlock[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length) out.push({ t: 'p', text: para.join('\n') });
		para = [];
	};
	for (const raw of text.replace(/\r/g, '').split('\n')) {
		const line = raw.trimEnd();
		if (/^##\s+/.test(line)) {
			flush();
			out.push({ t: 'h', text: line.replace(/^##\s+/, '') });
		} else if (/^-\s+/.test(line)) {
			flush();
			out.push({ t: 'li', text: line.replace(/^-\s+/, '') });
		} else if (!line.trim()) flush();
		else para.push(line);
	}
	flush();
	return out;
}
