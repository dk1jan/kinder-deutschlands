// Entscheidungen zum Chat-Schlüssel (D-066, F-017) – bewusst ohne Browser-/SDK-Abhängigkeit, damit testbar.

/** Art der Schlüsselsicherung auf dem Chat-Server. */
export type StorageKind = 'keine' | 'passwort' | 'frueher';

/** Sicherung aus der Zeit vor D-066 hat keine Passwort-Angabe (Wiederherstellungsschlüssel von Hand). */
export function storageKind(info: { passphrase?: unknown } | null | undefined): StorageKind {
	if (!info) return 'keine';
	return info.passphrase ? 'passwort' : 'frueher';
}

export type LockedOutcome = 'entsperren' | 'abweichend' | 'frueher';

/**
 * Gerät ist gesperrt und das Passwort-Geheimnis liegt vor: was jetzt?
 * · passende Passwort-Sicherung → entsperren
 * · Passwort-Sicherung, Geheimnis passt nicht → abweichend (Passwort geändert, kein Gerät hat neu verpackt)
 * · Sicherung aus früherer Version → frueher (Wiederherstellungsschlüssel eingeben oder neu beginnen)
 */
export function lockedOutcome(kind: StorageKind, secretMatches: boolean): LockedOutcome {
	if (kind === 'frueher') return 'frueher';
	return secretMatches ? 'entsperren' : 'abweichend';
}

/**
 * Wurde die Passworteingabe auf der Karte „Chat entsperren“ angenommen?
 * Nur ein falsches Passwort (Prüfung vor dem Speichern) ist ein Fehler; geht es danach auf einer anderen Karte weiter
 * (früher/abweichend), ist das keine falsche Eingabe und darf keine rote Meldung zeigen.
 */
export function passwordAccepted(checkedAgainstBackup: boolean, matches: boolean): boolean {
	return !checkedAgainstBackup || matches;
}
