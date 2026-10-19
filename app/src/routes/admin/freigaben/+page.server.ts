import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { ApprovalError, decide, listApprovals, withdraw } from '$lib/server/approvals';
import { ipHash } from '$lib/server/crypto';
import { key } from '$lib/server/config';

export const load: PageServerLoad = async (event) => {
	const user = await requireAction(event, 'admin.access');
	return { rows: await listApprovals(db(), user.id) };
};

async function run(fn: () => Promise<unknown>, ok: string) {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof ApprovalError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	entscheiden: async (event) => {
		const user = await requireAction(event, 'admin.access');
		const f = await event.request.formData();
		const yes = f.get('decision') === 'ja';
		return run(() => decide(db(), user.id, String(f.get('id') ?? ''), yes, String(f.get('note') ?? ''), ipHash(event.getClientAddress(), key('ip'))), yes ? 'Freigegeben und ausgeführt.' : 'Abgelehnt.');
	},
	zurueckziehen: async (event) => {
		const user = await requireAction(event, 'admin.access');
		const f = await event.request.formData();
		return run(() => withdraw(db(), user.id, String(f.get('id') ?? '')), 'Zurückgezogen.');
	}
};
