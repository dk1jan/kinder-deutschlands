import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { tileState } from '$lib/server/import/tiles';
import { TREFFEN_HOURS } from '$lib/server/chat/rooms';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const tiles = await tileState(db()).catch(() => null);
	return { tiles: !!tiles?.present, hours: [...TREFFEN_HOURS], center: [8.8017, 53.0793] as [number, number] };
};
