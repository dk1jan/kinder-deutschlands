import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { ContactError, discover, sendRequest } from '$lib/server/contacts';
import { getProfile, getProfileByContactId, relationOf } from '$lib/server/profiles';
import { formatContactId, normalizeContactId } from '$lib/server/contactid';
import { cardFor } from '$lib/visibility';
import { rateLimit } from '$lib/server/ratelimit';

// Freiwillige Entdeckung: nur wer „auffindbar“ eingeschaltet hat; gezeigt wird die Mitglieder-Sicht.
export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	if (!rateLimit(`discover:${user.id}`, 60, 3_600_000)) error(429, 'Zu viele Aufrufe. Bitte später erneut versuchen.');
	const sql = db();
	const me = await getProfile(sql, user.id);
	const region = event.url.searchParams.get('region') ?? me?.region_code ?? '';
	const regions = await sql`select code, name from regions where code in (select distinct region_code from user_profiles where discoverable and region_code is not null) order by name`;
	const rows = await discover(sql, user.id, region || null);
	const pending = new Set(
		(await sql`select to_user from contact_requests where from_user = ${user.id} and status = 'offen'`).map((r) => r.to_user as string)
	);
	const items = await Promise.all(
		rows.map(async (r) => {
			const rel = await relationOf(sql, user.id, r.user_id as string);
			return {
				cid: r.contact_id as string,
				relation: rel,
				pending: pending.has(r.user_id as string),
				card: { ...cardFor(r as never, rel), contactIdFormatted: formatContactId(r.contact_id as string) }
			};
		})
	);
	return {
		items,
		region,
		regions: regions.map((r) => ({ code: r.code as string, name: r.name as string })),
		meDiscoverable: !!me?.discoverable
	};
};

export const actions: Actions = {
	anfragen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const cid = normalizeContactId(String(f.get('cid') ?? ''));
		const owner = cid ? await getProfileByContactId(db(), cid) : null;
		if (!owner || !owner.discoverable) return fail(404, { error: 'Diese Familie ist nicht mehr auffindbar.', cid });
		try {
			return { done: await sendRequest(db(), user.id, owner.user_id, null, 'entdecken'), cid };
		} catch (e) {
			if (e instanceof ContactError) return fail(400, { error: e.message, cid });
			throw e;
		}
	}
};
