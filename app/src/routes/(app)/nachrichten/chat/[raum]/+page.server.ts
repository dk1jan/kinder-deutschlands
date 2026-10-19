import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { tileState } from '$lib/server/import/tiles';
import { REPORT_REASONS } from '$lib/server/community/moderation';
import { REASON_LABEL } from '$lib/server/community/automod';

export const load: PageServerLoad = async (event) => {
	requireMember(event);
	const tiles = await tileState(db()).catch(() => null);
	return {
		roomId: event.params.raum,
		tiles: !!tiles?.present,
		center: [8.8017, 53.0793] as [number, number],
		reasons: REPORT_REASONS.map((k) => ({ key: k, label: REASON_LABEL[k] ?? k }))
	};
};
