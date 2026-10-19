// Statistik (M24): Zeitraum mit Vergleich zum Vorzeitraum, optional nach Region. Nur Zählungen – keine
// Einzelpersonen, keine Inhalte, keine Chat-Inhalte. Kleine Zahlen (1–4) werden bei Regionsfilter als „< 5“ gezeigt,
// damit sich niemand herausrechnen lässt. Was nicht gemessen wird (z. B. Seitenaufrufe), steht als „nicht erfasst“ da.
import type { Sql } from './db';
import { subtree } from './angebote/common';
import { REASON_LABEL } from './community/automod';
import { KINDS, type Kind } from '$lib/places';
import { MARKET_CATEGORIES } from '$lib/alltag';

const OTHER_REASONS: Record<string, string> = { falsch: 'Falsche Angabe', sonstiges: 'Sonstiges' };

export const PERIODS = { '7': 7, '30': 30, '90': 90, '365': 365 } as const;

export interface Metric {
	key: string;
	label: string;
	now: number | null;
	before: number | null;
	note?: string;
}
export interface Group {
	title: string;
	metrics: Metric[];
	rows?: { label: string; value: number }[];
	rowsTitle?: string;
}

/** Zählung im Zeitraum [from, to) und im gleich langen Zeitraum davor. */
async function pair(sql: Sql, q: (from: Date, to: Date) => Promise<number>, days: number): Promise<[number, number]> {
	const to = new Date();
	const from = new Date(to.getTime() - days * 86_400_000);
	const prev = new Date(from.getTime() - days * 86_400_000);
	return [await q(from, to), await q(prev, from)];
}
const n = (r: { n: number }[]) => Number(r[0]?.n ?? 0);

export async function statistics(sql: Sql, days: number, region: string | null): Promise<Group[]> {
	const reg = (col: string) => (region ? sql`and ${sql(col)} in ${subtree(sql, region)}` : sql``);
	const m = async (key: string, label: string, q: (from: Date, to: Date) => Promise<number>, note?: string): Promise<Metric> => {
		const [a, b] = await pair(sql, q, days);
		return { key, label, now: a, before: b, note };
	};
	const groups: Group[] = [];

	// ---------- Mitglieder ----------
	groups.push({
		title: 'Mitglieder',
		metrics: [
			await m('reg', 'Neue Konten (bestätigt)', async (f, t) => n(await sql`select count(*)::int as n from users u left join user_profiles p on p.user_id = u.id
				where u.email_verified_at >= ${f} and u.email_verified_at < ${t} ${reg('p.region_code')}`)),
			await m('active', 'Aktive Mitglieder (angemeldet im Zeitraum)', async (f, t) => n(await sql`select count(*)::int as n from users u left join user_profiles p on p.user_id = u.id
				where u.status = 'active' and u.last_login_at >= ${f} and u.last_login_at < ${t} ${reg('p.region_code')}`), 'letzte Anmeldung je Konto'),
			await m('return', 'Wiedergekommen (Konto älter als 30 Tage, im Zeitraum angemeldet)', async (f, t) => n(await sql`select count(*)::int as n from users u left join user_profiles p on p.user_id = u.id
				where u.status = 'active' and u.created_at < ${new Date(f.getTime() - 30 * 86_400_000)} and u.last_login_at >= ${f} and u.last_login_at < ${t} ${reg('p.region_code')}`)),
			await m('deleted', 'Konten gelöscht', async (f, t) => (region ? -1 : n(await sql`select count(*)::int as n from audit_log where action = 'account.deleted' and at >= ${f} and at < ${t}`)), region ? 'nicht nach Region (Daten sind gelöscht)' : undefined)
		]
	});
	if (!region) {
		const regs = await sql`select coalesce(l.name, 'ohne Angabe') as label, count(*)::int as value from user_profiles p join users u on u.id = p.user_id and u.status = 'active'
			left join lateral (with recursive up as (select code, parent_code, level, name from regions where code = p.region_code
				union all select r.code, r.parent_code, r.level, r.name from regions r join up on r.code = up.parent_code) select name from up where level = 'land' limit 1) l on true
			group by 1 order by 2 desc limit 20`;
		groups[0].rows = regs.map((r) => ({ label: r.label as string, value: r.value as number }));
		groups[0].rowsTitle = 'Wohnregion (Bundesland, aus dem Profil, freiwillig)';
	}

	// ---------- Community ----------
	groups.push({
		title: 'Community',
		metrics: [
			await m('posts', 'Beiträge', async (f, t) => n(await sql`select count(*)::int as n from posts where created_at >= ${f} and created_at < ${t} and status <> 'entfernt' ${reg('region_code')}`)),
			await m('comments', 'Antworten', async (f, t) => n(await sql`select count(*)::int as n from comments c join posts p on p.id = c.post_id where c.created_at >= ${f} and c.created_at < ${t} and c.status <> 'entfernt' ${reg('p.region_code')}`)),
			await m('helpful', 'Hilfreiche Antworten (mind. eine Markierung)', async (f, t) => n(await sql`select count(*)::int as n from comments c join posts p on p.id = c.post_id where c.helpful > 0 and c.created_at >= ${f} and c.created_at < ${t} ${reg('p.region_code')}`), 'nach Datum der Antwort'),
			await m('solved', 'Gelöste Fragen', async (f, t) => n(await sql`select count(*)::int as n from posts where kind = 'frage' and solved_comment is not null and activity_at >= ${f} and activity_at < ${t} ${reg('region_code')}`), 'nach letzter Aktivität'),
			await m('groups', 'Gruppen mit mindestens 3 Beiträgen', async (f, t) => n(await sql`select count(*)::int as n from (select group_id from posts where group_id is not null and created_at >= ${f} and created_at < ${t} group by group_id having count(*) >= 3) x`), region ? 'Gruppen ohne Region' : undefined),
			await m('subs', 'Neue Regions-Abos', async (f, t) => n(await sql`select count(*)::int as n from subscriptions where kind = 'region' and created_at >= ${f} and created_at < ${t} ${region ? sql`and key in ${subtree(sql, region)}` : sql``}`))
		]
	});

	// ---------- Kommunikation (nur Technik) ----------
	groups.push({
		title: 'Kommunikation (nur technische Zahlen, keine Inhalte)',
		metrics: region
			? [{ key: 'chat', label: 'Chat', now: null, before: null, note: 'nicht nach Region' }]
			: [
					await m('chatacc', 'Neue Chat-Konten', async (f, t) => n(await sql`select count(*)::int as n from chat_accounts where created_at >= ${f} and created_at < ${t}`)),
					await m('dm', 'Neue Direktchats', async (f, t) => n(await sql`select count(*)::int as n from chat_rooms where kind = 'direkt' and created_at >= ${f} and created_at < ${t}`)),
					await m('grp', 'Neue Gruppenchats', async (f, t) => n(await sql`select count(*)::int as n from chat_rooms where kind = 'gruppe' and created_at >= ${f} and created_at < ${t}`)),
					await m('tr', 'Treffen-, Einladungs- und Event-Chats', async (f, t) => n(await sql`select count(*)::int as n from chat_rooms where kind = 'treffen' and created_at >= ${f} and created_at < ${t}`)),
					{ key: 'calls', label: 'Anrufe', now: null, before: null, note: 'nicht erfasst – Anrufe laufen verschlüsselt zwischen den Geräten' }
				]
	});

	// ---------- Moderation ----------
	const reasons = await sql`select reason as label, count(*)::int as value from mod_cases where created_at >= ${new Date(Date.now() - days * 86_400_000)} ${reg('region_code')} group by reason order by 2 desc`;
	groups.push({
		title: 'Moderation',
		metrics: [
			await m('cases', 'Neue Fälle', async (f, t) => n(await sql`select count(*)::int as n from mod_cases where created_at >= ${f} and created_at < ${t} ${reg('region_code')}`)),
			await m('auto', 'davon automatisch markiert', async (f, t) => n(await sql`select count(*)::int as n from mod_cases where source = 'automatisch' and created_at >= ${f} and created_at < ${t} ${reg('region_code')}`)),
			await m('decided', 'Entschieden', async (f, t) => n(await sql`select count(*)::int as n from mod_cases where decided_at >= ${f} and decided_at < ${t} ${reg('region_code')}`)),
			await m('wait', 'Bearbeitungszeit (Median, Stunden)', async (f, t) => Number((await sql`select coalesce(round(extract(epoch from percentile_cont(0.5) within group (order by decided_at - created_at)) / 3600), 0)::int as n
				from mod_cases where decided_at >= ${f} and decided_at < ${t} ${reg('region_code')}`)[0]?.n ?? 0)),
			await m('appeals', 'Einsprüche', async (f, t) => n(await sql`select count(*)::int as n from mod_cases where source = 'einspruch' and created_at >= ${f} and created_at < ${t} ${reg('region_code')}`)),
			await m('corrected', 'Korrigierte Entscheidungen (nach Einspruch wiederhergestellt)', async (f, t) => n(await sql`select count(*)::int as n from mod_cases where source = 'einspruch' and decision = 'wiederherstellen' and decided_at >= ${f} and decided_at < ${t} ${reg('region_code')}`))
		],
		rows: reasons.map((r) => ({ label: REASON_LABEL[r.label] ?? OTHER_REASONS[r.label] ?? String(r.label), value: r.value as number })),
		rowsTitle: 'Gründe im Zeitraum'
	});

	// ---------- Orte ----------
	const [pl] = await sql`select count(*)::int as total,
			count(*) filter (where opening_hours is not null)::int as hours,
			count(*) filter (where name is not null)::int as named,
			count(*) filter (where checked_at > now() - interval '365 days')::int as checked
		from places where status = 'aktiv' ${reg('region_code')}`;
	const kinds = await sql`select kind as label, count(*)::int as value from places where status = 'aktiv' ${reg('region_code')} group by kind order by 2 desc`;
	groups.push({
		title: 'Orte und Daten',
		metrics: [
			{ key: 'places', label: 'Aktive Orte (Stand jetzt)', now: pl.total, before: null },
			{ key: 'named', label: 'mit Namen', now: pl.named, before: null, note: pl.total ? `${Math.round((100 * pl.named) / pl.total)} %` : undefined },
			{ key: 'hours', label: 'mit Öffnungszeiten', now: pl.hours, before: null, note: pl.total ? `${Math.round((100 * pl.hours) / pl.total)} %` : undefined },
			{ key: 'checked', label: 'in den letzten 12 Monaten geprüft/abgeglichen', now: pl.checked, before: null, note: pl.total ? `${Math.round((100 * pl.checked) / pl.total)} %` : undefined },
			await m('reviews', 'Neue Bewertungen', async (f, t) => n(await sql`select count(*)::int as n from place_reviews r join places p on p.id = r.place_id where r.created_at >= ${f} and r.created_at < ${t} and r.status = 'sichtbar' ${reg('p.region_code')}`)),
			await m('importfail', 'Fehlgeschlagene Datenabrufe', async (f, t) => (region ? -1 : n(await sql`select count(*)::int as n from import_runs where status = 'fehler' and started_at >= ${f} and started_at < ${t}`)), region ? 'nicht nach Region' : undefined)
		],
		rows: kinds.map((k) => ({ label: KINDS[k.label as Kind]?.label ?? String(k.label), value: k.value as number })),
		rowsTitle: 'Orte nach Art'
	});

	// ---------- Angebote ----------
	groups.push({
		title: 'Veranstaltungen, Angebote, Radar',
		metrics: [
			await m('events', 'Neue Termine', async (f, t) => n(await sql`select count(*)::int as n from events where created_at >= ${f} and created_at < ${t} and status <> 'entfernt' ${reg('region_code')}`)),
			await m('saved', 'Gemerkte Termine', async (f, t) => n(await sql`select count(*)::int as n from saved_items s join events e on e.id = s.item_id where s.kind = 'event' and s.created_at >= ${f} and s.created_at < ${t} ${reg('e.region_code')}`)),
			await m('att', 'Zusagen („Ich komme“)', async (f, t) => n(await sql`select count(*)::int as n from event_attendance a join events e on e.id = a.event_id where a.status = 'komme_mit' and a.created_at >= ${f} and a.created_at < ${t} ${reg('e.region_code')}`)),
			{ key: 'views', label: 'Aufrufe von Terminen, Weiterleitungen zur Buchung', now: null, before: null, note: 'nicht erfasst (kein Tracking)' },
			await m('radar', 'Radar-Zusammenfassungen verschickt', async (f, t) => (region ? -1 : n(await sql`select count(*)::int as n from radar_profiles where last_sent_at >= ${f} and last_sent_at < ${t}`)), region ? 'nicht nach Region' : 'Profile mit Versand im Zeitraum'),
			{ key: 'radarp', label: 'Aktive Radar-Profile (Stand jetzt)', now: region ? null : n(await sql`select count(*)::int as n from radar_profiles where not paused`), before: null, note: region ? 'nicht nach Region' : undefined }
		]
	});

	// ---------- Marktplatz ----------
	const cats = await sql`select category as label, count(*)::int as value from market_listings where created_at >= ${new Date(Date.now() - days * 86_400_000)} and status <> 'entfernt' ${reg('region_code')} group by category order by 2 desc`;
	groups.push({
		title: 'Marktplatz und Hilfe',
		metrics: [
			await m('listings', 'Neue Anzeigen', async (f, t) => n(await sql`select count(*)::int as n from market_listings where created_at >= ${f} and created_at < ${t} and status <> 'entfernt' ${reg('region_code')}`)),
			await m('given', 'Als abgegeben gemeldet', async (f, t) => n(await sql`select count(*)::int as n from market_listings where status = 'abgegeben' and updated_at >= ${f} and updated_at < ${t} ${reg('region_code')}`), 'von Anbietenden selbst gemeldet – keine Verkaufszahlen'),
			await m('help', 'Neue Hilfe-Einträge', async (f, t) => n(await sql`select count(*)::int as n from help_posts where created_at >= ${f} and created_at < ${t} and status <> 'entfernt' ${reg('region_code')}`)),
			await m('helpdone', 'Hilfe-Einträge erledigt', async (f, t) => n(await sql`select count(*)::int as n from help_posts where status = 'erledigt' and updated_at >= ${f} and updated_at < ${t} ${reg('region_code')}`))
		],
		rows: cats.map((c) => ({ label: (MARKET_CATEGORIES as Record<string, string>)[c.label] ?? String(c.label), value: c.value as number })),
		rowsTitle: 'Neue Anzeigen nach Kategorie'
	});

	// Kleine Zahlen bei Regionsfilter verbergen
	if (region) {
		for (const g of groups) {
			for (const x of g.metrics) {
				if (x.now !== null && x.now > 0 && x.now < 5 && x.key !== 'wait') x.now = -2;
				if (x.before !== null && x.before > 0 && x.before < 5 && x.key !== 'wait') x.before = -2;
			}
			if (g.rows) g.rows = g.rows.filter((r) => r.value >= 5);
		}
	}
	for (const g of groups) for (const x of g.metrics) if (x.now === -1) (x.now = null), (x.before = null);
	return groups;
}
