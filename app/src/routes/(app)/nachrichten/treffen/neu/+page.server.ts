import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { tileState } from '$lib/server/import/tiles';
import { TREFFEN_HOURS } from '$lib/server/chat/rooms';
import { isUuid } from '$lib/server/contacts';
import { displayName } from '$lib/places';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const sql = db();
	const tiles = await tileState(sql).catch(() => null);
	// „Treffen hier“ vom Ort aus: Name und Treffpunkt vorausfüllen (öffentlicher Ort, keine Wohnadresse)
	const ort = event.url.searchParams.get('ort');
	let place: { name: string; lon: number; lat: number } | null = null;
	if (ort && isUuid(ort)) {
		const [p] = await sql`select p.kind, p.name, r.name as region_name, ST_X(p.location) as lon, ST_Y(p.location) as lat
			from places p left join regions r on r.code = p.region_code where p.id = ${ort} and p.status = 'aktiv'`;
		if (p) place = { name: displayName(p.kind, p.name, p.region_name), lon: p.lon, lat: p.lat };
	}
	return { tiles: !!tiles?.present, hours: [...TREFFEN_HOURS], center: (place ? [place.lon, place.lat] : [8.8017, 53.0793]) as [number, number], place };
};
