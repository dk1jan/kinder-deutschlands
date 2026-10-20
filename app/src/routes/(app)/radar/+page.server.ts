import type { Actions, PageServerLoad } from './$types';
import { followedPlaces, setPlaceNotify } from '$lib/server/follows';
import { isUuid } from '$lib/server/contacts';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { FREQUENCIES, profiles } from '$lib/server/angebote/radar';
import { regionNames } from '$lib/server/angebote/radarpage';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const [list, places] = await Promise.all([profiles(sql, user.id), followedPlaces(sql, user.id)]);
	return {
		places,
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

export const actions: Actions = {
	aboEnde: async (event) => {
		const user = requireMember(event);
		const id = String((await event.request.formData()).get('id') ?? '');
		if (isUuid(id)) await setPlaceNotify(db(), user.id, id, false);
		return { ok: true };
	}
};
