import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { block, ContactError, isUuid, overview, removeContact, respond, unblock, withdraw } from '$lib/server/contacts';
import { formatContactId } from '$lib/server/contactid';
import { canSee, type Visibility } from '$lib/visibility';

const name = (r: { display_name: string | null; visibility: Visibility }, rel: 'mitglied' | 'kontakt') =>
	canSee(rel, r.visibility?.display_name) ? r.display_name : null;

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user || !event.locals.session?.mfaVerified) return { member: false as const };
	const user = requireMember(event);
	const o = await overview(db(), user.id);
	const fmtDate = (d: Date) => new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
	return {
		member: true as const,
		contacts: o.contacts.map((r) => ({
			cid: r.contact_id as string,
			id: formatContactId(r.contact_id as string),
			name: name(r as never, 'kontakt'),
			since: fmtDate(r.created_at)
		})),
		incoming: o.incoming.map((r) => ({
			id: r.id as string,
			cid: r.contact_id as string,
			contactId: formatContactId(r.contact_id as string),
			name: name(r as never, 'mitglied'),
			message: r.message as string | null,
			via: r.via as string,
			at: fmtDate(r.created_at)
		})),
		outgoing: o.outgoing.map((r) => ({ id: r.id as string, contactId: formatContactId(r.contact_id as string), at: fmtDate(r.created_at) })),
		blocked: o.blocked.map((r) => ({ cid: r.contact_id as string, contactId: formatContactId(r.contact_id as string) }))
	};
};

// Formulare tragen nur die öffentliche Kontakt-ID, nie die interne Konto-ID
async function userIdOfContact(cid: string) {
	const [r] = await db()`select user_id from user_profiles where contact_id = ${cid}`;
	return (r?.user_id as string) ?? null;
}

async function userIdOfRequest(requestId: string, toUser: string) {
	if (!isUuid(requestId)) return null;
	const [r] = await db()`select from_user from contact_requests where id = ${requestId} and to_user = ${toUser}`;
	return (r?.from_user as string) ?? null;
}

const handle = async (fn: () => Promise<unknown>, ok: string) => {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof ContactError) return fail(400, { error: e.message });
		throw e;
	}
};

export const actions: Actions = {
	annehmen: async (event) => {
		const u = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		return handle(() => respond(db(), u.id, id, true), 'Anfrage angenommen. Ihr seid jetzt verbunden.');
	},
	ablehnen: async (event) => {
		const u = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		return handle(() => respond(db(), u.id, id, false), 'Anfrage abgelehnt. Die andere Familie erfährt das nicht ausdrücklich.');
	},
	anfrageBlockieren: async (event) => {
		const u = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		const other = await userIdOfRequest(id, u.id);
		if (!other) return fail(400, { error: 'Diese Anfrage gibt es nicht mehr.' });
		return handle(() => block(db(), u.id, other), 'Blockiert. Diese Familie kann dich nicht mehr finden oder anfragen.');
	},
	zurueckziehen: async (event) => {
		const u = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		return handle(() => withdraw(db(), u.id, id), 'Anfrage zurückgezogen.');
	},
	entfernen: async (event) => {
		const u = requireMember(event);
		const other = await userIdOfContact(String((await event.request.formData()).get('cid') ?? ''));
		if (!other) return fail(400, { error: 'Unbekannter Kontakt.' });
		return handle(() => removeContact(db(), u.id, other), 'Kontakt entfernt.');
	},
	blockieren: async (event) => {
		const u = requireMember(event);
		const other = await userIdOfContact(String((await event.request.formData()).get('cid') ?? ''));
		if (!other) return fail(400, { error: 'Unbekannter Kontakt.' });
		return handle(() => block(db(), u.id, other), 'Blockiert. Diese Familie kann dich nicht mehr finden oder anfragen.');
	},
	freigeben: async (event) => {
		const u = requireMember(event);
		const other = await userIdOfContact(String((await event.request.formData()).get('cid') ?? ''));
		if (!other) return fail(400, { error: 'Unbekannter Kontakt.' });
		return handle(() => unblock(db(), u.id, other), 'Blockierung aufgehoben.');
	}
};
