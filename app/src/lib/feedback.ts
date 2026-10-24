// Feedback-Arten (F-052) – ohne Serverabhängigkeit, damit auch Seiten sie nutzen können.
export const FEEDBACK_KINDS = {
	fehler: 'Fehler melden',
	korrektur: 'Fehlerkorrektur (Inhalt ist falsch)',
	allgemein: 'Allgemeines Feedback'
} as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;
export const FEEDBACK_STATUS = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verworfen: 'Verworfen' } as const;
export type FeedbackStatus = keyof typeof FEEDBACK_STATUS;
