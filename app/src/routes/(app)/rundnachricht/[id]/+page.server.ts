import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { readBroadcast } from '$lib/server/broadcasts';
import { isUuid } from '$lib/server/contacts';

// Rundnachricht des Teams lesen – nur Empfänger (oder wer Rundnachrichten verschicken darf).
export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404, 'Nicht gefunden.');
	const b = await readBroadcast(db(), user.id, event.params.id);
	if (!b) error(404, 'Nicht gefunden.');
	return { b };
};
