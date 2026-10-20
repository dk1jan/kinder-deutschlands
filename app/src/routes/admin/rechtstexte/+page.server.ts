import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { appUrl } from '$lib/server/config';
import { getLegal, imprintComplete, LegalError, privacyDraft, saveLegal, type Imprint } from '$lib/server/legal';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'settings.manage');
	const l = await getLegal(db());
	return { l, draft: privacyDraft(l, appUrl()), complete: imprintComplete(l.imprint) };
};

const FIELDS: (keyof Imprint)[] = ['provider', 'street', 'city', 'country', 'email', 'phone', 'represented', 'register', 'vat', 'responsible'];

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		const f = await event.request.formData();
		const own = f.get('own_text') === 'on';
		try {
			await saveLegal(db(), user.id, {
				imprint: Object.fromEntries(FIELDS.map((k) => [k, String(f.get(`i_${k}`) ?? '')])),
				hosting: String(f.get('hosting') ?? ''),
				authority: String(f.get('authority') ?? ''),
				imprintExtra: String(f.get('imprint_extra') ?? ''),
				privacyText: own ? String(f.get('privacy_text') ?? '') : null,
				resetPrivacy: !own,
				checked: f.get('checked') === 'on',
				note: String(f.get('note') ?? '') || null
			});
		} catch (e) {
			if (e instanceof LegalError) return fail(400, { error: e.message });
			throw e;
		}
		return { ok: 'Gespeichert.' };
	}
};
