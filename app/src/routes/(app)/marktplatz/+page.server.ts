import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { deleteSearch, listListings, listSearches, saveSearch } from '$lib/server/alltag/market';
import { parseEuro } from '$lib/server/alltag/forms';
import { isUuid } from '$lib/server/angebote/common';
import { MARKET_CATEGORIES, MARKET_KINDS } from '$lib/alltag';

export const load: PageServerLoad = async ({ url, locals }) => {
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	if (!viewer) return { member: false as const };
	const sql = db();
	const p = url.searchParams;
	const view = p.get('ansicht') === 'meine' ? 'meine' : p.get('ansicht') === 'suchen' ? 'suchen' : 'alle';
	let region = p.get('region') || null;
	if (!region && !p.has('region') && view === 'alle') {
		const [u] = await sql`select region_code from user_profiles where user_id = ${viewer}`;
		region = (u?.region_code as string | null) ?? null;
	}
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const lat = Number(p.get('lat')), lon = Number(p.get('lon'));
	const near = Number.isFinite(lat) && Number.isFinite(lon) && lat > 47 && lat < 56 && lon > 5 && lon < 16 ? { lat, lon, km: Math.min(Math.max(Number(p.get('km')) || 10, 1), 100) } : null;
	const kinds = p.getAll('art').filter((k) => k in MARKET_KINDS);
	const category = p.get('kategorie') && p.get('kategorie')! in MARKET_CATEGORIES ? p.get('kategorie') : null;
	let maxPrice: number | null = null;
	try {
		maxPrice = parseEuro(p.get('maxpreis') ?? '');
	} catch {
		maxPrice = null;
	}
	const sort = (['neu', 'preis', 'naehe'].includes(p.get('sort') ?? '') ? p.get('sort') : 'neu') as 'neu' | 'preis' | 'naehe';
	const [items, searches] = await Promise.all([
		listListings(sql, viewer, view === 'meine' ? { mine: true } : { q: p.get('q'), category, kinds, region: near ? null : (regionRow?.code ?? null), near, maxPriceCents: maxPrice, sort }),
		listSearches(sql, viewer)
	]);
	return {
		member: true as const,
		view,
		items,
		searches,
		near: !!near,
		filters: { q: p.get('q') ?? '', category: category ?? '', kinds, region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null, maxpreis: p.get('maxpreis') ?? '', sort, km: near?.km ?? 10 }
	};
};

export const actions: Actions = {
	suchauftrag: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		try {
			await saveSearch(db(), user.id, {
				q: String(f.get('q') ?? '') || null,
				category: String(f.get('kategorie') ?? '') || null,
				kinds: f.getAll('art').map(String),
				regionCode: String(f.get('region') ?? '') || null,
				maxPriceCents: parseEuro(String(f.get('maxpreis') ?? ''))
			});
			return { saved: true };
		} catch (e) {
			if (e instanceof PostError) return fail(400, { error: e.message });
			throw e;
		}
	},
	suchauftragLoeschen: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (isUuid(id)) await deleteSearch(db(), user.id, id);
		return { deleted: true };
	}
};
