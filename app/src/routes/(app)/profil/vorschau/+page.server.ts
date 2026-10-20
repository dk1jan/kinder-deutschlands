import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { ensureProfile, getProfile } from '$lib/server/profiles';
import { formatContactId } from '$lib/server/contactid';
import { cardFor, type Relation } from '$lib/visibility';

// „So sehen andere mein Profil“ – dieselbe Funktion, die auch echte Betrachter bedient.
export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	await ensureProfile(sql, user.id);
	const p = (await getProfile(sql, user.id))!;
	const views: { key: Relation; label: string; text: string }[] = [
		{ key: 'extern', label: 'Ohne Konto', text: 'Wer deinen QR-Code scannt und nicht angemeldet ist.' },
		{ key: 'mitglied', label: 'Mitglieder', text: 'Angemeldete Mitglieder, die deine ID kennen oder dich entdecken.' },
		{ key: 'gruppe', label: 'Aus deinen Gruppen', text: 'Mitglieder, die mit dir in einer offenen Gruppe sind (geschützte Gruppen zählen nie).' },
		{ key: 'kontakt', label: 'Kontakte', text: 'Familien, deren Anfrage du angenommen hast.' }
	];
	return {
		saved: event.url.searchParams.has('gespeichert'),
		views: views.map((v) => ({ ...v, card: { ...cardFor(p, v.key), contactIdFormatted: formatContactId(p.contact_id) } }))
	};
};
