import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { contactTarget } from '$lib/server/live';

// F-037: „Kontakt aufnehmen“ aus der Live-Ebene. Die Adresse enthält nur die Freigabe-Nummer (nicht die Familien-ID);
// die Familien-ID erfährt nur, wer die Freigabe gerade sehen darf. Dann weiter zur normalen Kontaktanfrage mit Nachricht.
export const GET: RequestHandler = async (event) => {
	const user = requireMember(event);
	const cid = await contactTarget(db(), user.id, event.params.id);
	if (!cid) error(404, 'Diese Freigabe ist beendet oder nicht mehr sichtbar.');
	redirect(303, `/nachrichten/familie?id=${encodeURIComponent(cid)}`);
};
