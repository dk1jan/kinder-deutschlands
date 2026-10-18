// Bewertungen und Fotos für Orte (M11/M13, D-025). Bewertungen sind Erfahrungen, keine Sicherheitszertifikate.
// Fotos erscheinen erst nach Freigabe durch die Moderation (öffentliche Seiten, Schutz von Kindern).
import type { Sql } from '../db';
import { checkText, holdMessage } from './automod';
import { storeImage } from './media';
import { mutedUntil, PostError } from './posts';

export async function placeExperiences(sql: Sql, placeId: string, viewerId: string | null) {
	const [agg] = await sql`select count(*)::int as n, round(avg(stars)::numeric, 1)::float as avg from place_reviews where place_id = ${placeId} and status = 'sichtbar'`;
	const reviews = await sql`select v.id, v.user_id, v.stars, v.body, v.created_at, v.updated_at, r.name as region from place_reviews v
		left join user_profiles p on p.user_id = v.user_id left join regions r on r.code = p.region_code and (p.visibility->>'region') in ('alle', 'mitglieder')
		where v.place_id = ${placeId} and v.status = 'sichtbar' and v.body is not null and v.body <> '' order by v.updated_at desc limit 50`;
	const photos = await sql`select id, width, height, alt from media where place_id = ${placeId} and purpose = 'ort' and status = 'sichtbar' order by created_at desc limit 24`;
	const [mine] = viewerId ? await sql`select stars, body, status from place_reviews where place_id = ${placeId} and user_id = ${viewerId}` : [];
	const [pendingPhotos] = viewerId ? await sql`select count(*)::int as n from media where place_id = ${placeId} and owner_id = ${viewerId} and status = 'pruefung'` : [{ n: 0 }];
	return {
		count: agg.n as number,
		avg: agg.avg as number | null,
		reviews: reviews.map((r) => ({ id: r.id as string, stars: r.stars as number, body: r.body as string, region: r.region as string | null, at: r.updated_at as Date, own: r.user_id === viewerId })),
		photos: photos.map((p) => ({ id: p.id as string, width: p.width as number, height: p.height as number, alt: p.alt as string | null })),
		mine: mine ? { stars: mine.stars as number, body: (mine.body as string) ?? '', status: mine.status as string } : null,
		pendingPhotos: (pendingPhotos?.n as number) ?? 0
	};
}

export async function saveReview(sql: Sql, userId: string, placeId: string, stars: number, body: string | null) {
	if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new PostError('Bitte 1 bis 5 Sterne wählen.');
	if (body && body.length > 2000) throw new PostError('Text höchstens 2 000 Zeichen.');
	if (await mutedUntil(sql, userId)) throw new PostError('Du kannst gerade nichts schreiben (zeitweise eingeschränkt).');
	const [p] = await sql`select region_code from places where id = ${placeId} and status = 'aktiv'`;
	if (!p) throw new PostError('Ort nicht gefunden.');
	const flags = body ? checkText(body) : [];
	const held = holdMessage(flags);
	const [r] = await sql`insert into place_reviews (place_id, user_id, stars, body, status) values (${placeId}, ${userId}, ${stars}, ${body}, ${held ? 'pruefung' : 'sichtbar'})
		on conflict (place_id, user_id) do update set stars = excluded.stars, body = excluded.body, status = excluded.status, updated_at = now() returning id`;
	for (const f of flags)
		await sql`insert into mod_cases (target_type, target_id, source, reason, message, priority, region_code) values ('review', ${r.id}, 'automatisch', ${f.reason}, ${f.detail}, ${f.priority}, ${p.region_code})`;
	return held;
}

export async function deleteReview(sql: Sql, userId: string, placeId: string) {
	await sql`delete from place_reviews where place_id = ${placeId} and user_id = ${userId}`;
}

export async function addPlacePhoto(sql: Sql, userId: string, placeId: string, data: Buffer, alt: string | null) {
	const [p] = await sql`select region_code from places where id = ${placeId} and status = 'aktiv'`;
	if (!p) throw new PostError('Ort nicht gefunden.');
	const [{ n }] = await sql`select count(*)::int as n from media where owner_id = ${userId} and purpose = 'ort' and created_at > now() - interval '1 day'`;
	if (n >= 10) throw new PostError('Heute schon viele Fotos – danke! Bitte morgen weiter.');
	const id = await storeImage(sql, data, { ownerId: userId, purpose: 'ort', placeId, alt, status: 'pruefung', maxSide: 1600 });
	await sql`insert into mod_cases (target_type, target_id, source, reason, priority, region_code) values ('media', ${id}, 'automatisch', 'neues_ortsfoto', 3, ${p.region_code})`;
	return id;
}
