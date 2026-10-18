import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { favorites, mySuggestions } from '$lib/server/places';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [fav, mine] = await Promise.all([favorites(sql, user.id), mySuggestions(sql, user.id)]);
	return { fav, mine };
};
