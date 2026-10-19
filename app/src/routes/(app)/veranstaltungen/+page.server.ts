import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { listOccurrences } from '$lib/server/angebote/events';
import { berlinParts, berlinToUtc } from '$lib/server/angebote/recurrence';
import { tileState } from '$lib/server/import/tiles';
import { AGE_GROUPS, EVENT_KINDS } from '$lib/angebote';

const day = 86_400_000;

export const load: PageServerLoad = async ({ url, locals }) => {
	const sql = db();
	const viewer = { id: locals.user && locals.session?.mfaVerified ? locals.user.id : null };
	const p = url.searchParams;
	const view = (['liste', 'kalender', 'karte'].includes(p.get('ansicht') ?? '') ? p.get('ansicht') : 'liste') as 'liste' | 'kalender' | 'karte';
	const now = new Date();
	const c = berlinParts(now);
	const today = berlinToUtc({ y: c.y, m: c.m, d: c.d, h: 0, mi: 0 });
	let from = today, to = new Date(today.getTime() + 30 * day);
	let month = p.get('monat') ?? `${c.y}-${String(c.m).padStart(2, '0')}`;
	const zeitraum = p.get('zeitraum') ?? '30';
	if (view === 'kalender') {
		const m = /^(\d{4})-(\d{2})$/.exec(month);
		const y = m ? +m[1] : c.y, mo = m ? +m[2] : c.m;
		month = `${y}-${String(mo).padStart(2, '0')}`;
		from = berlinToUtc({ y, m: mo, d: 1, h: 0, mi: 0 });
		to = berlinToUtc({ y: mo === 12 ? y + 1 : y, m: mo === 12 ? 1 : mo + 1, d: 1, h: 0, mi: 0 });
	} else if (zeitraum === 'heute') to = new Date(today.getTime() + day);
	else if (zeitraum === 'wochenende') {
		const wd = (new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay() + 6) % 7; // 0 = Montag
		const sat = new Date(today.getTime() + Math.max(0, 5 - wd) * day);
		from = wd >= 5 ? today : sat;
		to = new Date((wd >= 5 ? today.getTime() + (7 - wd) * day : sat.getTime() + 2 * day));
	} else if (zeitraum === '7') to = new Date(today.getTime() + 7 * day);
	else if (zeitraum === '90') to = new Date(today.getTime() + 90 * day);
	const kinds = p.getAll('art').filter((k) => k in EVENT_KINDS);
	const ages = p.getAll('alter').filter((a) => a in AGE_GROUPS);
	const region = p.get('region') || null;
	const [regionRow] = region ? await sql`select code, name from regions where code = ${region}` : [];
	const items = await listOccurrences(sql, viewer, {
		from,
		to,
		region: regionRow?.code ?? null,
		kinds,
		ages,
		free: p.get('kostenlos') === '1',
		setting: p.get('wo') === 'drinnen' || p.get('wo') === 'draussen' ? p.get('wo') : null,
		freikarte: p.get('freikarte') === '1',
		q: p.get('q'),
		limit: view === 'kalender' ? 600 : 300
	});
	const tiles = view === 'karte' ? await tileState(sql).catch(() => null) : null;
	return {
		view,
		zeitraum,
		month,
		filters: { region: regionRow ? { code: regionRow.code as string, name: regionRow.name as string } : null, kinds, ages, kostenlos: p.get('kostenlos') === '1', wo: p.get('wo') ?? '', freikarte: p.get('freikarte') === '1', q: p.get('q') ?? '' },
		items: items.map((i) => ({ ...i, start: i.start.toISOString(), end: i.end?.toISOString() ?? null })),
		member: !!viewer.id,
		tiles: !!tiles?.present
	};
};
