import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getWarning } from '$lib/server/warnings/store';

// Eine amtliche Warnung im Wortlaut (öffentlich, wie beim DWD).
export const load: PageServerLoad = async ({ params }) => {
	const id = params.id;
	if (!/^[\w.:-]{5,200}$/.test(id)) error(404, 'Warnung nicht gefunden.');
	const w = await getWarning(db(), id);
	if (!w) error(404, 'Warnung nicht gefunden – sie ist vermutlich abgelaufen.');
	return { w };
};
