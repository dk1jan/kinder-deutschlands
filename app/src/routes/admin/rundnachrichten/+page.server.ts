import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { BroadcastError, broadcastRights, checkBroadcast, countRecipients, fuzzyCount, listBroadcasts, sendBroadcast, type BroadcastInput } from '$lib/server/broadcasts';

async function sender(event: Parameters<PageServerLoad>[0] | Parameters<Actions[string]>[0]) {
	const user = await requireAction(event, 'admin.access');
	const rights = await broadcastRights(db(), user.id);
	if (!rights.any) error(403, 'Dafür fehlt die Berechtigung („Rundnachrichten“).');
	return { user, rights };
}

function fromForm(f: FormData): BroadcastInput {
	return {
		title: String(f.get('title') ?? ''),
		body: String(f.get('body') ?? ''),
		link: String(f.get('link') ?? '') || null,
		all: f.get('ziel') === 'alle',
		// Länder als Häkchen, dazu bis zu drei Städte/Kreise/Stadtteile aus der Suche
		regions: [...f.getAll('laender').map(String), ...f.getAll('region').map(String)].filter(Boolean),
		push: f.get('push') === 'on'
	};
}
const values = (i: BroadcastInput) => ({ ...i, regions: i.regions });

export const load: PageServerLoad = async (event) => {
	const { rights } = await sender(event);
	return { rights, rows: await listBroadcasts(db()) };
};

export const actions: Actions = {
	vorschau: async (event) => {
		const { user } = await sender(event);
		const i = fromForm(await event.request.formData());
		try {
			const ok = await checkBroadcast(db(), user.id, i);
			const n = await countRecipients(db(), ok.all, ok.regions);
			return { preview: n === 0 ? 'Damit erreichst du gerade niemanden (in diesen Regionen hat noch niemand seine Wohnregion eingetragen).' : `Empfänger: ${fuzzyCount(n)}.`, values: values(i) };
		} catch (e) {
			if (e instanceof BroadcastError) return fail(400, { error: e.message, values: values(i) });
			throw e;
		}
	},
	senden: async (event) => {
		const { user } = await sender(event);
		const f = await event.request.formData();
		const i = fromForm(f);
		if (f.get('bestaetigt') !== 'on') return fail(400, { error: 'Bitte bestätigen, dass die Nachricht so rausgehen soll.', values: values(i) });
		try {
			const r = await sendBroadcast(db(), user.id, i);
			return { ok: `Verschickt an ${fuzzyCount(r.recipients)} Mitglieder${i.push ? ' – Push an alle, die „Wichtiges sofort“ eingeschaltet haben' : ''}.` };
		} catch (e) {
			if (e instanceof BroadcastError) return fail(400, { error: e.message, values: values(i) });
			throw e;
		}
	}
};
