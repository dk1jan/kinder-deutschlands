// Ein Termin (oder eine ganze Reihe) als Kalenderdatei zum Übernehmen in den eigenen Kalender.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { appUrl } from '$lib/server/config';
import { isUuid } from '$lib/server/angebote/common';
import { getEvent } from '$lib/server/angebote/events';
import { buildIcs } from '$lib/server/angebote/ics';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!isUuid(params.id)) error(404);
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const d = await getEvent(db(), { id: viewer }, params.id, url.searchParams.get('t'));
	if (!d || d.needsLogin) error(404, 'Diesen Termin gibt es nicht oder er ist nicht für dich sichtbar.');
	const e = d.event;
	const am = url.searchParams.get('am');
	const one = am ? d.occurrences.find((o) => o.date === am) : null;
	const link = `${appUrl()}/veranstaltungen/${e.id}${one ? `?am=${one.date}` : ''}`;
	const location = [e.place?.name, e.address, e.regionName].filter(Boolean).join(', ');
	const description = [e.description, e.org ? `Veranstalter: ${e.org.name}` : '', link].filter(Boolean).join('\n\n');
	const ics = buildIcs([
		one
			? { uid: `${e.id}-${one.date}@kinder-deutschlands`, title: e.title, description, location, url: link, start: one.start, end: one.end, allDay: e.allDay, cancelled: one.cancelled || e.status === 'abgesagt', updated: e.updatedAt, lat: e.lat, lon: e.lon }
			: { uid: `${e.id}@kinder-deutschlands`, title: e.title, description, location, url: link, start: e.startsAt, end: e.endsAt, allDay: e.allDay, rrule: e.rrule, exdates: e.exdates, cancelled: e.status === 'abgesagt', updated: e.updatedAt, lat: e.lat, lon: e.lon }
	]);
	const name = e.title.replace(/[^A-Za-z0-9ÄÖÜäöüß -]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'termin';
	return new Response(ics, {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}.ics"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
