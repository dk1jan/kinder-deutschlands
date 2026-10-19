import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { AffiliateError, getAffiliate, saveAffiliate } from '$lib/server/affiliate';
import { affiliateLink } from '$lib/affiliate';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'settings.manage');
	return { a: await getAffiliate(db()) };
};

export const actions: Actions = {
	speichern: async (event) => {
		const user = await requireAction(event, 'settings.manage');
		const f = await event.request.formData();
		try {
			await saveAffiliate(db(), user.id, { enabled: f.get('enabled') === 'on', tag: String(f.get('tag') ?? '') || null, termsChecked: f.get('terms') === 'on', note: String(f.get('note') ?? '') || null });
			return { ok: 'Gespeichert.' };
		} catch (e) {
			if (e instanceof AffiliateError) return fail(400, { error: e.message });
			throw e;
		}
	},
	testen: async (event) => {
		await requireAction(event, 'settings.manage');
		const f = await event.request.formData();
		const a = await getAffiliate(db());
		const url = String(f.get('url') ?? '').trim();
		return { test: { url, ...affiliateLink(url, a.amazon_tag) } };
	}
};
