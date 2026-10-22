import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { qrSvg } from '$lib/server/qr';
import { formatContactId } from '$lib/server/contactid';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const id = event.url.searchParams.get('id') ?? '';
	const [q] = await sql`select q.token, p.contact_id from qr_tokens q join user_profiles p on p.user_id = q.user_id
		where q.id = ${id}::uuid and q.user_id = ${user.id} and q.revoked_at is null and (q.expires_at is null or q.expires_at > now())`.catch(() => []);
	if (!q) error(404, 'Diesen Code gibt es nicht oder er ist nicht mehr gültig.');
	// QR als eingebettetes SVG (kein foreignObject – druckt in allen Browsern scharf)
	const svg = await qrSvg(q.token as string, '#0f2238');
	const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 33 33';
	const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
	return { qr: { viewBox, body }, contactId: formatContactId(q.contact_id as string) };
};
