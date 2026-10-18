import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { overview, setPaused } from '$lib/server/datacenter';
import { runInBackground, isRunning } from '$lib/server/import/jobs';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'data.view');
	return { o: await overview(db()) };
};

export const actions: Actions = {
	starten: async (event) => {
		const user = await requireAction(event, 'data.import');
		const key = String((await event.request.formData()).get('key') ?? '');
		const sql = db();
		const [src] = await sql`select key from data_sources where key = ${key}`;
		if (!src) return fail(404, { error: 'Quelle nicht gefunden.' });
		if (await isRunning(sql)) return fail(409, { error: 'Es läuft bereits ein Abruf. Bitte warten, bis er fertig ist.' });
		await audit(sql, { actorId: user.id, action: 'data.source.run', targetType: 'source', targetId: key });
		runInBackground(key, user.id);
		await new Promise((r) => setTimeout(r, 300));
		return { ok: 'Abruf gestartet. Die Seite aktualisiert sich selbst.' };
	},
	pause: async (event) => {
		const user = await requireAction(event, 'data.import');
		const f = await event.request.formData();
		await setPaused(db(), String(f.get('key') ?? ''), f.get('paused') === '1', user.id);
		return { ok: f.get('paused') === '1' ? 'Quelle pausiert.' : 'Quelle läuft wieder nach Zeitplan.' };
	}
};
