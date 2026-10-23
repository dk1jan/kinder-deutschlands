import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { isUuid } from '$lib/server/contacts';
import { rateLimit } from '$lib/server/ratelimit';
import { userCan } from '$lib/server/roles';
import { addComment, deleteOwnComment, deleteOwnPost, editComment, editPost, getPost, inviteToPost, markSolved, PostError, revokeInvite, toggleBookmark, toggleHelpful, togglePin, vote } from '$lib/server/community/posts';
import { appeal, decide, report, ACTIONS, type ModAction } from '$lib/server/community/moderation';
import { draftFromPost } from '$lib/server/community/knowledge';
import { tagFor } from '$lib/server/affiliate';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404, 'Beitrag nicht gefunden.');
	const sql = db();
	const post = await getPost(sql, user.id, event.params.id);
	if (!post) error(404, 'Beitrag nicht gefunden.');
	const editor = await userCan(sql, user.id, 'knowledge.edit');
	const affiliateTag = await tagFor(sql, { protectedGroup: post.group?.kind === 'geschuetzt' });
	return { post, editor, held: event.url.searchParams.has('pruefung'), affiliateTag };
};

async function run(event: RequestEvent, fn: (uid: string, f: FormData) => Promise<unknown>) {
	const user = requireMember(event);
	if (!isUuid(event.params.id)) error(404);
	const f = await event.request.formData();
	try {
		const r = await fn(user.id, f);
		return r ?? { ok: true };
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}
const uuid = (v: FormDataEntryValue | null) => {
	const s = String(v ?? '');
	if (!isUuid(s)) throw new PostError('Ungültig.');
	return s;
};

export const actions: Actions = {
	antworten: (e) =>
		run(e, async (uid, f) => {
			if (!rateLimit(`antwort:${uid}`, 120, 24 * 3600 * 1000)) throw new PostError('Heute schon sehr viele Antworten – bitte später weiter.');
			const r = await addComment(db(), uid, e.params.id, String(f.get('body') ?? ''));
			return { answered: true, held: r.held };
		}),
	bearbeiten: (e) => run(e, async (uid, f) => ({ held: await editPost(db(), uid, e.params.id, String(f.get('title') ?? ''), String(f.get('body') ?? '')), edited: true })),
	loeschen: async (e) => {
		const r = await run(e, (uid) => deleteOwnPost(db(), uid, e.params.id));
		if (r && typeof r === 'object' && 'status' in r) return r;
		redirect(303, '/community?ansicht=neu');
	},
	antwortBearbeiten: (e) => run(e, async (uid, f) => ({ held: await editComment(db(), uid, uuid(f.get('id')), String(f.get('body') ?? '')) })),
	antwortLoeschen: (e) => run(e, (uid, f) => deleteOwnComment(db(), uid, uuid(f.get('id')))),
	hilfreich: (e) => run(e, (uid, f) => toggleHelpful(db(), uid, uuid(f.get('id')))),
	loesung: (e) => run(e, (uid, f) => markSolved(db(), uid, e.params.id, f.get('id') ? uuid(f.get('id')) : null)),
	abstimmen: (e) => run(e, (uid, f) => vote(db(), uid, e.params.id, f.getAll('choice').map(Number))),
	merken: (e) => run(e, async (uid) => ({ bookmarked: await toggleBookmark(db(), uid, e.params.id) })),
	// F-023: in einen Landes-Beitrag einladen / Einladung zurücknehmen
	einladen: (e) =>
		run(e, async (uid, f) => {
			if (!rateLimit(`einladen:${uid}`, 60, 3600 * 1000)) throw new PostError('Bitte kurz warten.');
			const r = await inviteToPost(db(), uid, e.params.id, String(f.get('familien_id') ?? ''));
			return { invited: r.name };
		}),
	einladungZurueck: (e) => run(e, async (uid, f) => (await revokeInvite(db(), uid, e.params.id, uuid(f.get('user'))), { revoked: true })),
	melden: (e) =>
		run(e, async (uid, f) => {
			if (!rateLimit(`melden:${uid}`, 30, 24 * 3600 * 1000)) throw new PostError('Heute schon viele Meldungen – danke!');
			const type = f.get('type') === 'comment' ? 'comment' : 'post';
			await report(db(), uid, type, uuid(f.get('id')), String(f.get('reason') ?? ''), String(f.get('message') ?? '').trim().slice(0, 500) || null);
			return { reported: true };
		}),
	einspruch: (e) =>
		run(e, async (uid, f) => {
			const type = f.get('type') === 'comment' ? 'comment' : 'post';
			await appeal(db(), uid, type, uuid(f.get('id')), String(f.get('message') ?? ''));
			return { appealed: true };
		}),
	// Schnellaktion der Moderation direkt am Beitrag: legt einen Fall an und entscheidet ihn (nachvollziehbar im Protokoll)
	moderieren: (e) =>
		run(e, async (uid, f) => {
			const sql = db();
			const action = String(f.get('action') ?? '') as ModAction;
			if (!(action in ACTIONS)) throw new PostError('Unbekannte Aktion.');
			const type = f.get('type') === 'comment' ? 'comment' : 'post';
			const id = uuid(f.get('id'));
			const post = await getPost(sql, uid, e.params.id);
			if (!post?.moderator) throw new PostError('Keine Berechtigung.');
			const [c] = await sql`insert into mod_cases (target_type, target_id, source, reason, message, reporter_id, priority, region_code, topic_key, group_id)
				values (${type}, ${id}, 'meldung', 'sonstiges', 'Direkt durch Moderation', ${uid}, 2, ${post.region?.code ?? null}, ${post.topic?.key ?? null}, ${post.group?.id ?? null}) returning id`;
			await decide(sql, uid, c.id, action, String(f.get('reason') ?? ''));
			return { moderated: true };
		}),
	anheften: (e) =>
		run(e, async (uid) => ({ pinned: await togglePin(db(), uid, e.params.id) })),
	wissen: async (e) => {
		const r = await run(e, async (uid) => ({ slug: await draftFromPost(db(), uid, e.params.id) }));
		if (r && typeof r === 'object' && 'slug' in r) redirect(303, `/admin/wissen/${(r as { slug: string }).slug}`);
		return r;
	}
};
