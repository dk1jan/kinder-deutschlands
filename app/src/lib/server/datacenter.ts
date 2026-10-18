// Daten- und Redaktionszentrale (M24/M23): Quellen, Läufe, Prüffälle, Ortspflege. Alle Änderungen landen im Protokoll.
import type { Sql } from './db';
import { audit } from './audit';
import { displayName, featuresFor, isKind, type Kind } from '$lib/places';
import { tileState, validBbox } from './import/tiles';
import { assignRegions } from './import/engine';

export class DataError extends Error {}

export async function overview(sql: Sql) {
	const [sources, [pending], kinds, regions, tiles, running] = await Promise.all([
		sql`select s.*, (select row_to_json(r) from (select id, status, started_at, finished_at, counts, message from import_runs
				where source_key = s.key order by id desc limit 1) r) as last_run,
			(select count(*)::int from place_sources ps where ps.source_key = s.key and ps.gone_at is null) as live
			from data_sources s order by case s.kind when 'regionen' then 1 when 'karte' then 2 else 3 end, s.name`,
		sql`select
			(select count(*)::int from places where status = 'pruefung') as vorschlaege,
			(select count(*)::int from place_duplicates where status = 'offen') as dubletten,
			(select count(*)::int from place_reports where status = 'offen') as meldungen,
			(select count(*)::int from import_runs where status = 'vorschau') as vorschau`,
		sql`select kind, status, count(*)::int as n from places group by kind, status`,
		sql`select level, count(*)::int as n, count(geom)::int as mit_geom from regions group by level`,
		tileState(sql),
		sql`select source_key from import_runs where status = 'laeuft'`
	]);
	return { sources, pending, kinds, regions, tiles, running: running.map((r) => r.source_key as string) };
}

export async function sourceDetail(sql: Sql, key: string) {
	const [src] = await sql`select * from data_sources where key = ${key}`;
	if (!src) return null;
	const runs = await sql`select id, trigger, status, started_at, finished_at, counts, message, applied_at from import_runs
		where source_key = ${key} order by id desc limit 30`;
	return { src, runs };
}

const AREAS = ['DE-HB', 'DE-NI'];
const LAENDER = ['03', '04'];

export async function updateSource(sql: Sql, key: string, f: FormData, actorId: string) {
	const [src] = await sql`select * from data_sources where key = ${key}`;
	if (!src) throw new DataError('Quelle nicht gefunden.');
	const interval = Number(f.get('interval_hours'));
	const maxRemoval = Number(f.get('max_removal_pct'));
	if (!Number.isInteger(interval) || interval < 6 || interval > 8760) throw new DataError('Rhythmus: 6 bis 8760 Stunden.');
	if (!Number.isInteger(maxRemoval) || maxRemoval < 0 || maxRemoval > 100) throw new DataError('Entfernen-Grenze: 0 bis 100 %.');
	const config = { ...(src.config as Record<string, unknown>) };
	if (config.type === 'osm') {
		const areas = f.getAll('areas').map(String).filter((a) => AREAS.includes(a));
		if (!areas.length) throw new DataError('Mindestens ein Gebiet wählen.');
		config.areas = areas;
	}
	if (config.type === 'vg250') {
		const l = f.getAll('laender').map(String).filter((a) => LAENDER.includes(a));
		if (!l.length) throw new DataError('Mindestens ein Land wählen.');
		config.laender = l;
	}
	if (config.type === 'protomaps') {
		const bbox = String(f.get('bbox') ?? '').replace(/\s/g, '');
		const mz = Number(f.get('maxzoom'));
		if (!validBbox(bbox)) throw new DataError('Gebiet als „West,Süd,Ost,Nord“ angeben, z. B. 6.6,51.29,11.62,53.9.');
		if (!Number.isInteger(mz) || mz < 10 || mz > 15) throw new DataError('Zoomstufe 10 bis 15.');
		config.bbox = bbox;
		config.maxzoom = mz;
	}
	const notes = String(f.get('notes') ?? '').trim().slice(0, 1000) || null;
	const contact = String(f.get('contact') ?? '').trim().slice(0, 200) || null;
	await sql`update data_sources set interval_hours = ${interval}, max_removal_pct = ${maxRemoval}, auto_apply = ${f.get('auto_apply') === 'on'},
		notes = ${notes}, contact = ${contact}, config = ${sql.json(config as never)},
		next_run_at = least(next_run_at, coalesce(last_success_at, now()) + make_interval(hours => ${interval}))
		where key = ${key}`;
	await audit(sql, { actorId, action: 'data.source.updated', targetType: 'source', targetId: key, meta: { interval, maxRemoval, config: JSON.stringify(config) } });
}

export async function setPaused(sql: Sql, key: string, paused: boolean, actorId: string) {
	await sql`update data_sources set paused = ${paused} where key = ${key}`;
	await audit(sql, { actorId, action: paused ? 'data.source.paused' : 'data.source.resumed', targetType: 'source', targetId: key });
}

export async function runItems(sql: Sql, runId: number) {
	const [run] = await sql`select r.*, s.name as source_name from import_runs r join data_sources s on s.key = r.source_key where r.id = ${runId}`;
	if (!run) return null;
	const items = await sql`select i.external_id, i.action, i.name, i.data->>'kind' as kind, i.data->>'url' as url, ps.place_id
		from import_items i left join place_sources ps on ps.source_key = ${run.source_key} and ps.external_id = i.external_id
		where i.run_id = ${runId} order by i.action, i.name nulls last limit 600`;
	return { run, items };
}

// ---------- Prüffälle ----------

export async function reviewQueue(sql: Sql) {
	const [suggestions, duplicates, reports] = await Promise.all([
		sql`select p.id, p.kind, p.name, p.description, p.features, p.created_at, r.name as region_name, ST_X(p.location) as lon, ST_Y(p.location) as lat,
				(select count(*)::int from places o where o.kind = p.kind and o.status = 'aktiv' and o.id <> p.id
					and ST_DWithin(o.location::geography, p.location::geography, 80)) as nearby
			from places p left join regions r on r.code = p.region_code where p.status = 'pruefung' order by p.created_at limit 100`,
		sql`select d.place_a, d.place_b, d.distance_m, d.detected_at,
				a.name as a_name, a.kind as a_kind, ra.name as a_region, (select string_agg(s.source_key || ':' || s.external_id, ', ') from place_sources s where s.place_id = a.id) as a_src,
				b.name as b_name, b.kind as b_kind, rb.name as b_region, (select string_agg(s.source_key || ':' || s.external_id, ', ') from place_sources s where s.place_id = b.id) as b_src
			from place_duplicates d join places a on a.id = d.place_a join places b on b.id = d.place_b
			left join regions ra on ra.code = a.region_code left join regions rb on rb.code = b.region_code
			where d.status = 'offen' order by d.distance_m limit 100`,
		sql`select rp.id, rp.kind, rp.message, rp.created_at, p.id as place_id, p.kind as place_kind, p.name as place_name, r.name as region_name,
				(select n.id from place_notices n where n.report_id = rp.id and n.ended_at is null) as notice_id
			from place_reports rp join places p on p.id = rp.place_id left join regions r on r.code = p.region_code
			where rp.status = 'offen' order by rp.created_at limit 100`
	]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type R = Record<string, any>;
	return {
		suggestions: (suggestions as unknown as R[]).map((s) => ({ ...s, display: displayName(s.kind, s.name, s.region_name) }) as R),
		duplicates: (duplicates as unknown as R[]).map((d) => ({ ...d, a_display: displayName(d.a_kind, d.a_name, d.a_region), b_display: displayName(d.b_kind, d.b_name, d.b_region) }) as R),
		reports: (reports as unknown as R[]).map((r) => ({ ...r, place_display: displayName(r.place_kind, r.place_name, r.region_name) }) as R)
	};
}

export async function decideSuggestion(sql: Sql, id: string, approve: boolean, actorId: string, note: string | null) {
	const r = await sql`update places set status = ${approve ? 'aktiv' : 'abgelehnt'}, confirmation = 'community', checked_at = now(), updated_at = now()
		where id = ${id} and status = 'pruefung'`;
	if (!r.count) throw new DataError('Vorschlag nicht (mehr) offen.');
	await audit(sql, { actorId, action: approve ? 'place.approved' : 'place.rejected', targetType: 'place', targetId: id, reason: note ?? undefined });
}

/** Zusammenführen: „keep“ bleibt, „drop“ wird verwiesen. Quellen, Merkliste, Meldungen und Hinweise ziehen mit um. */
export async function mergePlaces(sql: Sql, keep: string, drop: string, actorId: string) {
	if (keep === drop) throw new DataError('Ein Ort kann nicht mit sich selbst zusammengeführt werden.');
	await sql.begin(async (tx) => {
		const rows = await tx`select id, kind, status from places where id in (${keep}, ${drop}) for update`;
		if (rows.length !== 2) throw new DataError('Ort nicht gefunden.');
		if (rows.some((r) => r.status === 'zusammengefuehrt')) throw new DataError('Einer der Orte wurde bereits zusammengeführt.');
		await tx`update place_sources set place_id = ${keep} where place_id = ${drop}`;
		await tx`insert into place_favorites (user_id, place_id, created_at) select user_id, ${keep}, created_at from place_favorites where place_id = ${drop} on conflict do nothing`;
		await tx`delete from place_favorites where place_id = ${drop}`;
		await tx`update place_reports set place_id = ${keep} where place_id = ${drop}`;
		await tx`update place_notices set place_id = ${keep} where place_id = ${drop}`;
		await tx`update places set status = 'zusammengefuehrt', merged_into = ${keep}, updated_at = now() where id = ${drop}`;
		await tx`update places set status = case when status in ('pruefung', 'archiviert') then 'aktiv' else status end, updated_at = now() where id = ${keep}`;
		await tx`update place_duplicates set status = 'zusammengefuehrt', decided_by = ${actorId}, decided_at = now()
			where (place_a = ${keep} and place_b = ${drop}) or (place_a = ${drop} and place_b = ${keep})`;
		// Weitere offene Paare des verwiesenen Ortes auf den bleibenden umlenken
		await tx`delete from place_duplicates where status = 'offen' and (place_a = ${drop} or place_b = ${drop})`;
		await audit(tx as unknown as Sql, { actorId, action: 'place.merged', targetType: 'place', targetId: keep, meta: { merged: drop } });
	});
}

export async function markDistinct(sql: Sql, a: string, b: string, actorId: string) {
	const [x, y] = a < b ? [a, b] : [b, a];
	const r = await sql`update place_duplicates set status = 'verschieden', decided_by = ${actorId}, decided_at = now()
		where place_a = ${x} and place_b = ${y} and status = 'offen'`;
	if (!r.count) throw new DataError('Prüffall nicht (mehr) offen.');
	await audit(sql, { actorId, action: 'place.duplicate.distinct', targetType: 'place', targetId: x, meta: { other: y } });
}

/** Meldung bearbeiten. Bei Defekt/Sperrung: Hinweis bestätigen (Redaktion/amtlich) oder beenden. */
export async function handleReport(sql: Sql, id: string, decision: 'erledigt' | 'abgelehnt', notice: 'bestaetigen' | 'amtlich' | 'beenden' | null, text: string | null, sourceUrl: string | null, actorId: string) {
	await sql.begin(async (tx) => {
		const [rp] = await tx`update place_reports set status = ${decision}, handled_by = ${actorId}, handled_at = now(), resolution = ${text}
			where id = ${id} and status = 'offen' returning place_id, kind`;
		if (!rp) throw new DataError('Meldung nicht (mehr) offen.');
		if (notice === 'beenden' || decision === 'abgelehnt') {
			await tx`update place_notices set ended_at = now() where report_id = ${id} and ended_at is null`;
		} else if ((notice === 'bestaetigen' || notice === 'amtlich') && (rp.kind === 'defekt' || rp.kind === 'gesperrt')) {
			await tx`update place_notices set ended_at = now() where report_id = ${id} and ended_at is null`;
			await tx`insert into place_notices (place_id, kind, origin, text, source_url, report_id, created_by)
				values (${rp.place_id}, ${rp.kind}, ${notice === 'amtlich' ? 'amtlich' : 'redaktion'}, ${text}, ${sourceUrl}, ${id}, ${actorId})`;
		}
		await audit(tx as unknown as Sql, { actorId, action: 'place.report.handled', targetType: 'place', targetId: rp.place_id, meta: { decision, notice } });
	});
}

// ---------- Ortspflege ----------

export async function placeForEdit(sql: Sql, id: string) {
	const [p] = await sql`select p.*, ST_X(p.location) as lon, ST_Y(p.location) as lat, r.name as region_name from places p
		left join regions r on r.code = p.region_code where p.id = ${id}`;
	if (!p) return null;
	const [sources, notices, history] = await Promise.all([
		sql`select s.source_key, s.external_id, s.external_url, s.first_seen_at, s.last_seen_at, s.gone_at, d.name from place_sources s
			join data_sources d on d.key = s.source_key where s.place_id = ${id}`,
		sql`select id, kind, origin, text, created_at, valid_until, ended_at from place_notices where place_id = ${id} order by created_at desc limit 20`,
		sql`select at, action, meta from audit_log where target_type = 'place' and target_id = ${id} order by at desc limit 30`
	]);
	return { p, sources, notices, history };
}

const STATUSES = ['aktiv', 'archiviert', 'abgelehnt'];
const CONFIRMS = ['importiert', 'community', 'redaktion', 'anbieter'];

/** Redaktionelle Änderung. Geänderte Felder werden gesperrt, damit der nächste Import sie nicht überschreibt. */
export async function editPlace(sql: Sql, id: string, f: FormData, actorId: string) {
	const [cur] = await sql`select * from places where id = ${id}`;
	if (!cur) throw new DataError('Ort nicht gefunden.');
	const kind = String(f.get('kind') ?? cur.kind);
	if (!isKind(kind)) throw new DataError('Ungültige Art.');
	const name = String(f.get('name') ?? '').trim().slice(0, 200) || null;
	const description = String(f.get('description') ?? '').trim().slice(0, 2000) || null;
	const opening = String(f.get('opening_hours') ?? '').trim().slice(0, 255) || null;
	let website = String(f.get('website') ?? '').trim().slice(0, 500) || null;
	if (website && !/^https?:\/\/[^\s]+$/i.test(website)) throw new DataError('Webseite muss mit http:// oder https:// beginnen.');
	const status = String(f.get('status') ?? cur.status);
	const confirmation = String(f.get('confirmation') ?? cur.confirmation);
	if (!STATUSES.includes(status) && status !== cur.status) throw new DataError('Ungültiger Status.');
	if (!CONFIRMS.includes(confirmation)) throw new DataError('Ungültige Bestätigung.');
	const features: Record<string, unknown> = { ...(cur.features as Record<string, unknown>) };
	const locked = new Set<string>(cur.locked_fields ?? []);
	for (const [key] of featuresFor(kind as Kind)) {
		const v = String(f.get(`f_${key}`) ?? '');
		const before = features[key];
		const next = v === 'ja' ? true : v === 'nein' ? false : undefined;
		if (next !== before) {
			if (next === undefined) delete features[key];
			else features[key] = next;
			locked.add(`features.${key}`);
		}
	}
	const changed: string[] = [];
	const cmp = (field: string, a: unknown, b: unknown) => {
		if ((a ?? null) !== (b ?? null)) {
			changed.push(field);
			locked.add(field);
		}
	};
	cmp('name', cur.name, name);
	cmp('opening_hours', cur.opening_hours, opening);
	cmp('website', cur.website, website);
	if ((cur.description ?? null) !== description) changed.push('description');
	if (cur.kind !== kind) changed.push('kind');
	await sql`update places set kind = ${kind}, name = ${name}, description = ${description}, opening_hours = ${opening}, website = ${website},
		features = ${sql.json(features as never)}, status = ${status}, confirmation = ${confirmation}, locked_fields = ${[...locked]},
		checked_at = now(), updated_at = now() where id = ${id}`;
	await audit(sql, { actorId, action: 'place.edited', targetType: 'place', targetId: id, meta: { changed: changed.join(','), status, confirmation } });
}

export async function unlockAll(sql: Sql, id: string, actorId: string) {
	await sql`update places set locked_fields = '{}' where id = ${id}`;
	await audit(sql, { actorId, action: 'place.unlocked', targetType: 'place', targetId: id });
}

export async function addNotice(sql: Sql, placeId: string, kind: string, origin: string, text: string | null, sourceUrl: string | null, days: number | null, actorId: string) {
	if (!['defekt', 'gesperrt'].includes(kind) || !['redaktion', 'amtlich'].includes(origin)) throw new DataError('Ungültiger Hinweis.');
	if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new DataError('Quelle muss ein Link sein.');
	await sql`insert into place_notices (place_id, kind, origin, text, source_url, created_by, valid_until)
		values (${placeId}, ${kind}, ${origin}, ${text}, ${sourceUrl}, ${actorId}, ${days ? sql`now() + make_interval(days => ${days})` : null})`;
	await audit(sql, { actorId, action: 'place.notice.added', targetType: 'place', targetId: placeId, meta: { kind, origin } });
}

export async function endNotice(sql: Sql, noticeId: string, actorId: string) {
	const [n] = await sql`update place_notices set ended_at = now() where id = ${noticeId} and ended_at is null returning place_id`;
	if (n) await audit(sql, { actorId, action: 'place.notice.ended', targetType: 'place', targetId: n.place_id });
}

export async function reassignAllRegions(sql: Sql) {
	await assignRegions(sql);
}
