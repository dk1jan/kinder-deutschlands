import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { addNotice, DataError, editPlace, endNotice, placeForEdit, unlockAll } from '$lib/server/datacenter';
import { isUuid } from '$lib/server/contacts';
import { cleanText } from '$lib/server/validate';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'data.view');
	if (!isUuid(event.params.id)) error(404, 'Ort nicht gefunden.');
	const d = await placeForEdit(db(), event.params.id);
	if (!d) error(404, 'Ort nicht gefunden.');
	return d;
};

async function guarded(fn: () => Promise<void>, ok: string) {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof DataError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'data.edit');
		const f = await event.request.formData();
		return guarded(() => editPlace(db(), event.params.id, f, user.id), 'Gespeichert. Geänderte Felder sind gegen Überschreiben durch Importe gesperrt.');
	},
	entsperren: async (event) => {
		const user = await requireAction(event, 'data.edit');
		return guarded(() => unlockAll(db(), event.params.id, user.id), 'Sperren aufgehoben – der nächste Import aktualisiert alle Felder.');
	},
	hinweis: async (event) => {
		const user = await requireAction(event, 'data.edit');
		const f = await event.request.formData();
		const days = Number(f.get('days')) || null;
		return guarded(
			() => addNotice(db(), event.params.id, String(f.get('kind')), String(f.get('origin')), cleanText(f.get('text'), 500), cleanText(f.get('source_url'), 500), days && days > 0 && days < 400 ? days : null, user.id),
			'Hinweis veröffentlicht.'
		);
	},
	hinweisEnde: async (event) => {
		const user = await requireAction(event, 'data.edit');
		const id = String((await event.request.formData()).get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		return guarded(() => endNotice(db(), id, user.id), 'Hinweis beendet.');
	}
};
