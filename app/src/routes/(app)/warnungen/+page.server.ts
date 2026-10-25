import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { activeFor, kreisFor, MAX_SUBSCRIPTIONS, overview, subscribe, subscriptions, unsubscribe, WarnError } from '$lib/server/warnings/store';
import { ninaState, warnState } from '$lib/server/warnings/jobs';
import { tileState } from '$lib/server/import/tiles';

// Amtliche Wetterwarnungen (DWD): öffentlich ansehen je Kreis; Mitglieder abonnieren bis zu 5 Regionen (Mitteilung + Push nach Wahl).
export const load: PageServerLoad = async ({ locals, url }) => {
	const sql = db();
	const member = !!locals.user && !!locals.session?.mfaVerified;
	const [ov, state, nina, tiles] = await Promise.all([overview(sql), warnState(sql), ninaState(sql), tileState(sql).catch(() => null)]);
	const code = url.searchParams.get('region');
	const shown = code && code.length <= 40 ? await kreisFor(sql, code) : null;
	const shownWarnings = shown ? await activeFor(sql, shown.code) : [];
	let mine: { kreis: string; name: string; label: string | null; minLevel: number; push: boolean; warnings: Awaited<ReturnType<typeof activeFor>> }[] = [];
	let home: { code: string; name: string } | null = null;
	let pushDevices = 0;
	if (member) {
		const uid = locals.user!.id;
		const subs = await subscriptions(sql, uid);
		mine = await Promise.all(subs.map(async (s) => ({ ...s, warnings: await activeFor(sql, s.kreis) })));
		const [p] = await sql`select region_code from user_profiles where user_id = ${uid}`;
		home = p?.region_code ? await kreisFor(sql, p.region_code) : null;
		if (home && subs.some((s) => s.kreis === home!.code)) home = null;
		[{ n: pushDevices }] = await sql`select count(*)::int as n from push_subscriptions where user_id = ${uid}`;
	}
	const lastOk = state.last_ok ? new Date(state.last_ok) : null;
	return {
		member,
		overview: ov,
		stand: lastOk,
		stale: !lastOk || Date.now() - lastOk.getTime() > 45 * 60_000,
		shown,
		shownWarnings,
		mine,
		home,
		pushDevices,
		max: MAX_SUBSCRIPTIONS,
		tiles: !!tiles?.present,
		ninaStand: nina.last_ok ? new Date(nina.last_ok) : null
	};
};

export const actions: Actions = {
	abonnieren: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		try {
			const k = await subscribe(db(), user.id, String(f.get('region') ?? ''), Number(f.get('min_level') ?? 2), f.get('push') === 'on', String(f.get('label') ?? '') || null);
			return { ok: `Abonniert: ${k.name}. Neue Warnungen bekommst du ab jetzt als Mitteilung${f.get('push') === 'on' ? ' und als Push' : ''}.` };
		} catch (e) {
			if (e instanceof WarnError) return fail(400, { error: e.message });
			throw e;
		}
	},
	aendern: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		try {
			await subscribe(db(), user.id, String(f.get('kreis') ?? ''), Number(f.get('min_level') ?? 2), f.get('push') === 'on', null);
			return { ok: 'Gespeichert.' };
		} catch (e) {
			if (e instanceof WarnError) return fail(400, { error: e.message });
			throw e;
		}
	},
	abbestellen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		await unsubscribe(db(), user.id, String(f.get('kreis') ?? ''));
		return { ok: 'Abo beendet.' };
	}
};
