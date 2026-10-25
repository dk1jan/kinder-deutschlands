import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { activeFor, kreisFor, MAX_SUBSCRIPTIONS, overview, subscribe, subscriptions, unsubscribe, WarnError } from '$lib/server/warnings/store';
import { warnState } from '$lib/server/warnings/jobs';
import { tileState } from '$lib/server/import/tiles';
import { regenAt, regenText, REGEN_ATTRIBUTION } from '$lib/server/regen';

/** Regen in den nächsten 2 Stunden für bis zu 5 Kreise (Mitte des Kreises), je höchstens 3 Sekunden. */
async function regenFor(sql: ReturnType<typeof db>, list: { code: string; name: string }[]) {
	const rows = list.length ? await sql`select code, ST_Y(center) as lat, ST_X(center) as lon from regions where code = any(${list.map((k) => k.code)}) and center is not null` : [];
	const pt = new Map(rows.map((r) => [r.code as string, r]));
	return Promise.all(
		list.slice(0, 5).map(async (k) => {
			const r = pt.get(k.code);
			const rain = r ? await Promise.race([regenAt(Number(r.lat), Number(r.lon)), new Promise<null>((res) => setTimeout(() => res(null), 3000))]).catch(() => null) : null;
			return { kreis: k.code, name: k.name, known: !!rain, text: regenText(rain) };
		})
	);
}

// Wetter und Warnungen (DWD): öffentlich ansehen je Kreis; Mitglieder abonnieren bis zu 5 Regionen (Mitteilung + Push nach Wahl).
export const load: PageServerLoad = async ({ locals, url }) => {
	const sql = db();
	const member = !!locals.user && !!locals.session?.mfaVerified;
	const [ov, state, tiles] = await Promise.all([overview(sql), warnState(sql), tileState(sql).catch(() => null)]);
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
	// Regen: für die abonnierten Regionen, sonst für die angezeigte, sonst für die Wohnregion
	const rainList = mine.length ? mine.map((m) => ({ code: m.kreis, name: m.name })) : shown ? [shown] : home ? [home] : [];
	const rain = await regenFor(sql, rainList);
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
		rain,
		rainAttribution: REGEN_ATTRIBUTION,
		max: MAX_SUBSCRIPTIONS,
		tiles: !!tiles?.present
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
