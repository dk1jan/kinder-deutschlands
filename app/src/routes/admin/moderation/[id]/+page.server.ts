import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { isUuid } from '$lib/server/contacts';
import { ACTIONS, caseDetail, decide, saveNote, takeCase, type ModAction } from '$lib/server/community/moderation';
import { REASON_LABEL } from '$lib/server/community/automod';
import { PostError } from '$lib/server/community/posts';

export const load: PageServerLoad = async (event) => {
	const user = await requireAction(event, 'admin.access');
	if (!isUuid(event.params.id)) error(404);
	const sql = db();
	const d = await caseDetail(sql, user.id, event.params.id);
	if (!d) error(404, 'Fall nicht gefunden oder nicht in deiner Zuständigkeit.');
	const topics = await sql`select key, name from topics order by sort`;
	// Chat-Meldungen: interne Konto-ID nicht an die Oberfläche geben
	if (d.c.evidence) {
		const { sender_user: _drop, ...rest } = d.c.evidence as Record<string, unknown>;
		void _drop;
		d.c.evidence = rest;
	}
	const chatOnly = ['freigeben', 'verwarnen', 'stumm', 'sperren', 'eskalieren'];
	const actions = d.c.target_type === 'chat' ? Object.fromEntries(Object.entries(ACTIONS).filter(([k]) => chatOnly.includes(k))) : ACTIONS;
	return { d, actions: actions as typeof ACTIONS, reasons: REASON_LABEL, topics, me: user.id };
};

async function guarded(fn: () => Promise<void>, ok: string) {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	uebernehmen: async (event) => {
		const user = await requireAction(event, 'admin.access');
		return guarded(() => takeCase(db(), user.id, event.params.id), 'Fall übernommen.');
	},
	notiz: async (event) => {
		const user = await requireAction(event, 'admin.access');
		const f = await event.request.formData();
		return guarded(() => saveNote(db(), user.id, event.params.id, String(f.get('note') ?? '')), 'Notiz gespeichert.');
	},
	entscheiden: async (event) => {
		const user = await requireAction(event, 'admin.access');
		const f = await event.request.formData();
		return guarded(
			() =>
				decide(db(), user.id, event.params.id, String(f.get('action')) as ModAction, String(f.get('reason') ?? ''), {
					note: String(f.get('note') ?? ''),
					days: Number(f.get('days')) || 7,
					topicKey: String(f.get('topic') ?? '') || null,
					regionCode: String(f.get('region_code') ?? '') || null
				}),
			'Entscheidung gespeichert und mitgeteilt.'
		);
	}
};
