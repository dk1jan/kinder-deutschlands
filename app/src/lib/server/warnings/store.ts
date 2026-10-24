// Wetterwarnungen speichern, Kreisen zuordnen, Abonnenten benachrichtigen (Glocke + Push nach Wahl).
// Regeln: nur neue Warnungen lösen eine Mitteilung aus; eine Aktualisierung (CAP „references“) nur, wenn die Stufe steigt.
// Beim allerersten Abruf werden laufende Warnungen nur übernommen, nicht verschickt (sonst Mitteilungsflut nach dem Ausrollen).
import type { Sql } from '../db';
import { notify } from '../community/posts';
import { kreisFromWarncell, levelOf, LEVEL_LABEL, type CapAlert } from './cap';

export const ATTRIBUTION = 'Quelle: Deutscher Wetterdienst (DWD), opendata.dwd.de, Lizenz CC BY 4.0 – Warntexte unverändert übernommen';
export const MAX_SUBSCRIPTIONS = 5;

export class WarnError extends Error {}

const ts = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null);

/**
 * Kreise einer Warnung. Erst über die Warnzelle („1“ + Kreisschlüssel + „000“) – aber nur, wenn das Warngebiet die
 * Kreisfläche auch trifft (Schutz, falls die Zellen-Regel für einzelne Gebiete nicht stimmt). Sonst über die Fläche
 * des Warngebiets gegen die Kreisgrenzen (mindestens 5 % des Warngebiets im Kreis).
 */
export async function kreiseOf(sql: Sql, a: CapAlert): Promise<string[]> {
	const out = new Set<string>();
	for (const ar of a.areas) {
		const wkts = ar.polygons.filter((r) => r.length >= 4 && r.length <= 5000).map((r) => `POLYGON((${r.map(([x, y]) => `${x} ${y}`).join(',')}))`);
		const cells = [...new Set((ar.geocodes.WARNCELLID ?? []).map(kreisFromWarncell).filter((x): x is string => !!x))];
		let hit: string[] = [];
		if (cells.length) {
			const rows = await sql`select r.code from regions r where r.code = any(${cells}) and r.level = 'kreis'
				and (r.geom is null or ${wkts.length === 0} or exists(select 1 from unnest(${wkts}::text[]) w
					where ST_Intersects(r.geom, ST_MakeValid(ST_GeomFromText(w, 4326)))))`.catch(() => []);
			hit = rows.map((r) => r.code as string);
		}
		if (!hit.length) {
			for (const wkt of wkts) {
				const rows = await sql`
					with p as (select ST_MakeValid(ST_GeomFromText(${wkt}, 4326)) as g)
					select r.code from regions r, p where r.level = 'kreis' and r.geom is not null and r.geom && p.g
						and ST_Area(ST_Intersection(r.geom, p.g)) > 0.05 * greatest(ST_Area(p.g), 1e-9)`.catch(() => []);
				hit.push(...rows.map((r) => r.code as string));
			}
		}
		for (const k of hit) out.add(k);
	}
	return [...out];
}

export interface IngestResult {
	neu: number;
	aktiv: number;
	beendet: number;
	mitteilungen: number;
}

/** Eine Momentaufnahme übernehmen. notifyNew = false beim ersten Lauf. */
export async function ingest(sql: Sql, alerts: CapAlert[], opts: { notifyNew: boolean }): Promise<IngestResult> {
	const res: IngestResult = { neu: 0, aktiv: 0, beendet: 0, mitteilungen: 0 };
	const now = Date.now();
	const fresh: { a: CapAlert; level: number; kreise: string[] }[] = [];
	const ids: string[] = [];
	for (const a of alerts) {
		if (a.msgType === 'Cancel') continue;
		const exp = ts(a.expires);
		if (exp && exp.getTime() < now) continue;
		ids.push(a.identifier);
		const level = levelOf(a.severity);
		const [have] = await sql`select 1 as x from warnings where id = ${a.identifier}`;
		if (have) {
			await sql`update warnings set last_seen = now(), ended_at = null where id = ${a.identifier}`;
			continue;
		}
		const kreise = await kreiseOf(sql, a);
		await sql.begin(async (tx) => {
			const t = tx as unknown as Sql;
			await t`insert into warnings (id, provider, msg_type, event, event_group, severity, level, urgency, headline, description, instruction, sender_name, web,
					sent, onset, expires, refs, area_desc)
				values (${a.identifier}, 'dwd', ${a.msgType}, ${a.event}, ${a.eventGroup}, ${['Minor', 'Moderate', 'Severe', 'Extreme'].includes(a.severity) ? a.severity : 'Unknown'}, ${level},
					${a.urgency}, ${a.headline.slice(0, 300)}, ${a.description?.slice(0, 6000) ?? null}, ${a.instruction?.slice(0, 6000) ?? null}, ${a.senderName}, ${a.web},
					${ts(a.sent) ?? new Date()}, ${ts(a.onset) ?? ts(a.effective)}, ${ts(a.expires)}, ${a.references},
					${a.areas.map((x) => x.desc).filter(Boolean).join(', ').slice(0, 2000) || null})`;
			for (const k of kreise) await t`insert into warning_areas (warning_id, kreis_code) values (${a.identifier}, ${k}) on conflict do nothing`;
		});
		res.neu++;
		fresh.push({ a, level, kreise });
	}
	res.aktiv = ids.length;
	// Was nicht mehr in der Momentaufnahme steht, ist vorbei (aufgehoben, abgelaufen, ersetzt)
	const ended = await sql`update warnings set ended_at = now() where provider = 'dwd' and ended_at is null and not (id = any(${ids})) returning id`;
	res.beendet = ended.length;
	if (opts.notifyNew) for (const f of fresh) res.mitteilungen += await deliver(sql, f.a, f.level, f.kreise);
	else if (fresh.length) {
		// Erster Lauf: als „schon zugestellt“ merken, damit Aktualisierungen später nicht als neu gelten
		await sql`insert into warning_deliveries (warning_id, user_id)
			select a.warning_id, s.user_id from warning_areas a join warning_subscriptions s on s.kreis_code = a.kreis_code
			where a.warning_id = any(${fresh.map((f) => f.a.identifier)}) on conflict do nothing`;
	}
	return res;
}

/** Mitteilung (und ggf. Push) an Abonnenten der betroffenen Kreise ab ihrer Mindeststufe. */
async function deliver(sql: Sql, a: CapAlert, level: number, kreise: string[]): Promise<number> {
	if (!kreise.length || level < 1) return 0;
	const subs = await sql`
		select s.user_id, bool_or(s.push) as push, min(coalesce(s.label, r.name)) as where_name
		from warning_subscriptions s join users u on u.id = s.user_id and u.status = 'active' left join regions r on r.code = s.kreis_code
		where s.kreis_code = any(${kreise}) and s.min_level <= ${level}
		group by s.user_id`;
	let n = 0;
	for (const s of subs) {
		// Schon über eine frühere Fassung derselben Warnung informiert, und die Stufe ist nicht gestiegen? Dann still übernehmen.
		const [prev] = a.references.length
			? await sql`select max(w.level)::int as lvl from warning_deliveries d join warnings w on w.id = d.warning_id
				where d.user_id = ${s.user_id} and d.warning_id = any(${a.references})`
			: [{ lvl: null }];
		const [ins] = await sql`insert into warning_deliveries (warning_id, user_id) values (${a.identifier}, ${s.user_id}) on conflict do nothing returning 1 as x`;
		if (!ins) continue;
		if (prev?.lvl != null && prev.lvl >= level) continue;
		const label = LEVEL_LABEL[level] ?? 'Warnung';
		const text = `${label} für ${s.where_name}: ${a.headline}`;
		const link = `/warnungen/${encodeURIComponent(a.identifier)}`;
		await notify(sql, s.user_id as string, 'warnung', text, link, { noPush: true });
		if (s.push) {
			const { pushNotice } = await import('../push');
			// Abo mit Push ist die Einwilligung; Ruhezeiten gelten – außer bei extremem Unwetter (Stufe 4)
			await pushNotice(sql, s.user_id as string, link, { force: true, kind: 'warnung', body: text.slice(0, 160), ignoreQuiet: level >= 4 }).catch(() => {});
		}
		n++;
	}
	return n;
}

/** Aufräumen: beendete Warnungen nach 30 Tagen, Zustellvermerke nach 60 Tagen. */
export async function purgeWarnings(sql: Sql) {
	await sql`delete from warnings where ended_at < now() - interval '30 days'`;
	await sql`delete from warning_deliveries where at < now() - interval '60 days'`;
}

// ---------- Lesen ----------

export interface WarningView {
	id: string;
	level: number;
	levelLabel: string;
	event: string | null;
	headline: string;
	description: string | null;
	instruction: string | null;
	areaDesc: string | null;
	onset: Date | null;
	expires: Date | null;
	sent: Date;
	web: string | null;
	ended: boolean;
}

const view = (w: Record<string, unknown>): WarningView => ({
	id: w.id as string,
	level: w.level as number,
	levelLabel: LEVEL_LABEL[w.level as number] ?? 'Hinweis',
	event: w.event as string | null,
	headline: w.headline as string,
	description: w.description as string | null,
	instruction: w.instruction as string | null,
	areaDesc: w.area_desc as string | null,
	onset: w.onset as Date | null,
	expires: w.expires as Date | null,
	sent: w.sent as Date,
	web: w.web as string | null,
	ended: !!w.ended_at || (!!w.expires && (w.expires as Date).getTime() < Date.now())
});

const ACTIVE = (sql: Sql) => sql`w.ended_at is null and (w.expires is null or w.expires > now())`;

/** Aktive Warnungen für einen Kreis (höchste Stufe zuerst). */
export async function activeFor(sql: Sql, kreis: string): Promise<WarningView[]> {
	const rows = await sql`select w.* from warnings w join warning_areas a on a.warning_id = w.id
		where a.kreis_code = ${kreis} and ${ACTIVE(sql)} order by w.level desc, w.onset nulls first limit 50`;
	return rows.map(view);
}

export async function getWarning(sql: Sql, id: string) {
	const [w] = await sql`select * from warnings where id = ${id}`;
	if (!w) return null;
	const kreise = await sql`select r.code, r.name from warning_areas a join regions r on r.code = a.kreis_code where a.warning_id = ${id} order by r.name limit 400`;
	return { ...view(w), kreise: kreise.map((k) => ({ code: k.code as string, name: k.name as string })) };
}

/** Überblick für Startseite und Warnseite: aktive Warnungen nach Stufe, Kreise je Stufe. */
export async function overview(sql: Sql) {
	const rows = await sql`select w.level, count(distinct w.id)::int as n, count(distinct a.kreis_code)::int as kreise
		from warnings w left join warning_areas a on a.warning_id = w.id where ${ACTIVE(sql)} group by w.level`;
	const [last] = await sql`select max(last_seen) as t from warnings`;
	const byLevel: Record<number, { n: number; kreise: number }> = {};
	for (const r of rows) byLevel[r.level as number] = { n: r.n as number, kreise: r.kreise as number };
	return { byLevel, stand: (last?.t as Date | null) ?? null };
}

/** Kreis zu einer gewählten Region (Stadtteil/Gemeinde/Kreis; Hamburg/Berlin auch als Land). */
export async function kreisFor(sql: Sql, code: string): Promise<{ code: string; name: string } | null> {
	const [r] = await sql`select k.code, k.name from regions k where k.code = kd_kreis_of(${code})`;
	return r ? { code: r.code as string, name: r.name as string } : null;
}

// ---------- Abos ----------

export async function subscriptions(sql: Sql, userId: string) {
	const rows = await sql`select s.kreis_code, r.name, s.label, s.min_level, s.push from warning_subscriptions s join regions r on r.code = s.kreis_code
		where s.user_id = ${userId} order by s.created_at`;
	return rows.map((r) => ({ kreis: r.kreis_code as string, name: r.name as string, label: r.label as string | null, minLevel: r.min_level as number, push: r.push as boolean }));
}

export async function subscribe(sql: Sql, userId: string, regionCode: string, minLevel: number, push: boolean, label: string | null) {
	if (!Number.isInteger(minLevel) || minLevel < 1 || minLevel > 4) throw new WarnError('Bitte eine Stufe wählen.');
	const k = await kreisFor(sql, regionCode);
	if (!k) throw new WarnError('Für diese Auswahl gibt es keinen Kreis – bitte eine Stadt, Gemeinde oder einen Kreis wählen (in Bremen: Bremen oder Bremerhaven).');
	const [{ n }] = await sql`select count(*)::int as n from warning_subscriptions where user_id = ${userId} and kreis_code <> ${k.code}`;
	if (n >= MAX_SUBSCRIPTIONS) throw new WarnError(`Höchstens ${MAX_SUBSCRIPTIONS} Regionen.`);
	const l = label?.trim().slice(0, 40) || null;
	await sql`insert into warning_subscriptions (user_id, kreis_code, label, min_level, push) values (${userId}, ${k.code}, ${l}, ${minLevel}, ${push})
		on conflict (user_id, kreis_code) do update set min_level = excluded.min_level, push = excluded.push, label = coalesce(excluded.label, warning_subscriptions.label)`;
	// Was gerade schon läuft, nicht noch einmal als „neu“ melden – steht ja auf der Seite
	await sql`insert into warning_deliveries (warning_id, user_id) select a.warning_id, ${userId} from warning_areas a join warnings w on w.id = a.warning_id
		where a.kreis_code = ${k.code} and w.ended_at is null on conflict do nothing`;
	return k;
}

export async function unsubscribe(sql: Sql, userId: string, kreis: string) {
	await sql`delete from warning_subscriptions where user_id = ${userId} and kreis_code = ${kreis}`;
}
