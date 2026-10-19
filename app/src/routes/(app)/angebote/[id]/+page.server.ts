import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { PostError } from '$lib/server/community/posts';
import { report } from '$lib/server/community/moderation';
import { isUuid } from '$lib/server/angebote/common';
import { VALID_DAYS, confirmAvailability, getOffer } from '$lib/server/angebote/offers';
import { isSaved, toggleSaved } from '$lib/server/angebote/saved';
import type { Availability } from '$lib/angebote';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!isUuid(params.id)) error(404, 'Dieses Angebot gibt es nicht.');
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const o = await getOffer(sql, params.id, viewer);
	if (!o) error(404, 'Dieses Angebot gibt es nicht (mehr).');
	return {
		offer: {
			id: o.id as string,
			title: o.title as string,
			description: o.description as string,
			kind: o.kind as string,
			status: o.status as string,
			org: { name: o.org_name as string, slug: o.org_slug as string },
			ageMin: o.age_min as number | null,
			ageMax: o.age_max as number | null,
			scheduleText: o.schedule_text as string | null,
			startsOn: o.starts_on as Date | null,
			costText: o.cost_text as string | null,
			freikarte: o.freikarte as boolean,
			registrationUrl: o.registration_url as string | null,
			contact: o.contact as string | null,
			address: o.address as string | null,
			regionName: o.region_name as string | null,
			lat: o.lat as number | null,
			lon: o.lon as number | null,
			availability: o.effective,
			stored: o.availability as string,
			placesCount: o.effective === 'unbekannt' ? null : (o.places_count as number | null),
			confirmedAt: o.availability_confirmed_at as Date | null,
			validUntil: o.availability_until as Date | null
		},
		editor: o.editor,
		saved: viewer ? !!(await isSaved(sql, viewer, 'offer', params.id, null)) : false,
		member: !!viewer,
		validDays: VALID_DAYS
	};
};

async function run<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	merken: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		return run(async () => ({ saved: await toggleSaved(db(), user.id, 'offer', event.params.id, null) }));
	},
	verfuegbarkeit: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const n = String(f.get('places') ?? '').trim();
		return run(async () => {
			await confirmAvailability(db(), user.id, event.params.id, String(f.get('availability')) as Availability, n ? Number(n) : null, Number(f.get('days')));
			return { confirmed: true };
		});
	},
	melden: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`melden:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Meldungen.' });
		const f = await event.request.formData();
		return run(async () => {
			await report(db(), user.id, 'offer', event.params.id, String(f.get('reason') ?? ''), cleanText(f.get('message'), 500));
			return { reported: true };
		});
	}
};
