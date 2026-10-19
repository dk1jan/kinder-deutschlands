import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { FREQUENCIES, profiles } from '$lib/server/angebote/radar';
import { regionNames } from '$lib/server/angebote/radarpage';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const list = await profiles(sql, user.id);
	return {
		profiles: await Promise.all(
			list.map(async (p) => ({
				id: p.id,
				name: p.name,
				paused: p.paused,
				regions: (await regionNames(sql, p.regions)).map((r) => r.name),
				frequency: FREQUENCIES[p.frequency as keyof typeof FREQUENCIES] ?? p.frequency,
				channels: [p.viaEmail ? 'E-Mail' : '', p.viaPush ? 'Push' : ''].filter(Boolean),
				lastSentAt: p.lastSentAt
			}))
		)
	};
};
