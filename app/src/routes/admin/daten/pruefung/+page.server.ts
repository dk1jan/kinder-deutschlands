import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { DataError, decideSuggestion, handleReport, markDistinct, mergePlaces, reviewQueue } from '$lib/server/datacenter';
import { isUuid } from '$lib/server/contacts';
import { cleanText } from '$lib/server/validate';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'data.view');
	return { q: await reviewQueue(db()) };
};

const uuid = (v: FormDataEntryValue | null) => {
	const s = String(v ?? '');
	if (!isUuid(s)) throw new DataError('Ungültige Angabe.');
	return s;
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
	vorschlag: async (event) => {
		const user = await requireAction(event, 'data.edit');
		const f = await event.request.formData();
		const approve = f.get('decision') === 'ja';
		return guarded(() => decideSuggestion(db(), uuid(f.get('id')), approve, user.id, cleanText(f.get('note'), 300), cleanText(f.get('to_sender'), 200)), approve ? 'Vorschlag freigegeben, Einsender benachrichtigt.' : 'Vorschlag abgelehnt, Einsender benachrichtigt.');
	},
	dublette: async (event) => {
		const user = await requireAction(event, 'data.edit');
		const f = await event.request.formData();
		const a = f.get('a');
		const b = f.get('b');
		const d = String(f.get('decision') ?? '');
		if (d === 'verschieden') return guarded(() => markDistinct(db(), uuid(a), uuid(b), user.id), 'Als verschiedene Orte markiert.');
		if (d === 'a') return guarded(() => mergePlaces(db(), uuid(a), uuid(b), user.id), 'Zusammengeführt.');
		if (d === 'b') return guarded(() => mergePlaces(db(), uuid(b), uuid(a), user.id), 'Zusammengeführt.');
		return fail(400, { error: 'Bitte eine Entscheidung wählen.' });
	},
	meldung: async (event) => {
		const user = await requireAction(event, 'data.edit');
		const f = await event.request.formData();
		const decision = f.get('decision') === 'abgelehnt' ? 'abgelehnt' : 'erledigt';
		const n = String(f.get('notice') ?? '');
		const notice = (['bestaetigen', 'amtlich', 'beenden'].includes(n) ? n : null) as 'bestaetigen' | 'amtlich' | 'beenden' | null;
		const url = cleanText(f.get('source_url'), 500);
		if (url && !/^https?:\/\//i.test(url)) return fail(400, { error: 'Quelle muss ein Link sein.' });
		return guarded(() => handleReport(db(), uuid(f.get('id')), decision, notice, cleanText(f.get('text'), 500), url, user.id, { note: cleanText(f.get('note'), 300), toReporter: cleanText(f.get('to_reporter'), 200) }), 'Meldung bearbeitet, Melder benachrichtigt.');
	}
};
