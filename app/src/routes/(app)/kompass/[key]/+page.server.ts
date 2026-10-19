import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { situation } from '$lib/server/alltag/compass';
import { userCan } from '$lib/server/roles';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	// Region nur aus der Adresse (nicht aus dem Profil), damit nichts über die Lebenslage am Konto hängt
	const region = url.searchParams.get('region') || null;
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const s = await situation(sql, params.key, { region: regionRow?.code ?? null, member: !!viewer, viewerId: viewer });
	if (!s) error(404, 'Diese Lebenslage gibt es nicht.');
	return { s, member: !!viewer, region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null, editor: viewer ? await userCan(sql, viewer, 'compass.edit') : false };
};
