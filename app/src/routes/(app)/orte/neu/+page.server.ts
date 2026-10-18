import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { nearbySameKind, suggestPlace } from '$lib/server/places';
import { tileState } from '$lib/server/import/tiles';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { audit } from '$lib/server/audit';
import { featuresFor, isKind } from '$lib/places';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const lon = Number(event.url.searchParams.get('lon'));
	const lat = Number(event.url.searchParams.get('lat'));
	const ok = Number.isFinite(lon) && Number.isFinite(lat) && lon > 5 && lon < 16 && lat > 47 && lat < 56;
	const tiles = await tileState(db());
	return { center: (ok ? [lon, lat] : [8.8017, 53.0793]) as [number, number], tiles: !!tiles?.present };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const kind = String(f.get('kind') ?? '');
		const lon = Number(f.get('lon'));
		const lat = Number(f.get('lat'));
		const name = cleanText(f.get('name'), 120);
		const description = cleanText(f.get('description'), 800);
		const openingHours = cleanText(f.get('opening_hours'), 200);
		const values = { kind, lon, lat, name, description, openingHours, features: f.getAll('features').map(String) };
		if (!isKind(kind)) return fail(400, { error: 'Bitte wähle, was für ein Ort das ist.', values });
		if (!(lon > 5.8 && lon < 15.1 && lat > 47.2 && lat < 55.1)) return fail(400, { error: 'Bitte setze die Markierung auf der Karte (innerhalb Deutschlands).', values });
		const allowed = new Set(featuresFor(kind).map(([k]) => k));
		const features = Object.fromEntries(values.features.filter((k) => allowed.has(k)).map((k) => [k, true]));
		const sql = db();
		if (f.get('bestaetigt') !== 'ja') {
			const dup = await nearbySameKind(sql, kind, lon, lat);
			if (dup.length) return fail(409, { duplicates: dup, values });
		}
		if (!rateLimit(`vorschlag:${user.id}`, 10, 24 * 60 * 60 * 1000)) return fail(429, { error: 'Heute sind schon viele Vorschläge von dir eingegangen. Danke! Bitte morgen weiter.', values });
		const id = await suggestPlace(sql, user.id, { kind, name, lon, lat, description, features, openingHours });
		await audit(sql, { actorId: user.id, action: 'place.suggested', targetType: 'place', targetId: id, meta: { kind } });
		redirect(303, `/orte/${id}`);
	}
};
