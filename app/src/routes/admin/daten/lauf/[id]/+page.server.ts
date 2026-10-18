import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { runItems } from '$lib/server/datacenter';
import { applyRun, discardRun } from '$lib/server/import/engine';
import { audit } from '$lib/server/audit';

const id = (v: string) => {
	const n = Number(v);
	if (!Number.isInteger(n) || n < 1) error(404, 'Abruf nicht gefunden.');
	return n;
};

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'data.view');
	const d = await runItems(db(), id(event.params.id));
	if (!d) error(404, 'Abruf nicht gefunden.');
	return d;
};

export const actions: Actions = {
	uebernehmen: async (event) => {
		const user = await requireAction(event, 'data.import');
		const sql = db();
		try {
			await applyRun(sql, id(event.params.id), user.id);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		await audit(sql, { actorId: user.id, action: 'data.run.applied', targetType: 'run', targetId: event.params.id });
		redirect(303, `/admin/daten/lauf/${event.params.id}`);
	},
	verwerfen: async (event) => {
		const user = await requireAction(event, 'data.import');
		const sql = db();
		try {
			await discardRun(sql, id(event.params.id), user.id);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		await audit(sql, { actorId: user.id, action: 'data.run.discarded', targetType: 'run', targetId: event.params.id });
		redirect(303, `/admin/daten/lauf/${event.params.id}`);
	}
};
