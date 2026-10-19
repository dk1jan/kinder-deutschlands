import type { Sql } from '../db';
import { PostError } from '../community/posts';

/** Feinste Region (Stadtteil vor Gemeinde vor Kreis vor Land), die den Punkt enthält. */
export async function regionAt(sql: Sql, lon: number, lat: number): Promise<string | null> {
	const [r] = await sql`select r.code from regions r where r.geom is not null and ST_Covers(r.geom, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
		order by case r.level when 'stadtteil' then 1 when 'gemeinde' then 2 when 'kreis' then 3 when 'land' then 4 else 5 end limit 1`;
	return (r?.code as string) ?? null;
}

/** SQL-Teil: Region mit allen Unterregionen (z. B. Stadt Bremen inkl. Stadtteile). */
export function subtree(sql: Sql, code: string) {
	return sql`(with recursive s as (select code from regions where code = ${code} union all select r.code from regions r join s on r.parent_code = s.code) select code from s)`;
}

/** Alle übergeordneten Regionen (für „was in meiner Region gilt“: Land-, Kreis-, Stadtteilhinweise). */
export function ancestors(sql: Sql, code: string) {
	return sql`(with recursive a as (select code, parent_code from regions where code = ${code} union all select r.code, r.parent_code from regions r join a on r.code = a.parent_code) select code from a)`;
}

export function cleanUrl(u: string | null | undefined, what = 'Link'): string | null {
	const v = (u ?? '').trim();
	if (!v) return null;
	try {
		const url = new URL(v);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
		return url.toString().slice(0, 500);
	} catch {
		throw new PostError(`${what} bitte als vollständige Adresse mit https:// angeben.`);
	}
}

export function intOrNull(v: unknown, min: number, max: number): number | null {
	if (v === null || v === undefined || v === '') return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n < min || n > max) throw new PostError(`Zahl zwischen ${min} und ${max} angeben.`);
	return n;
}

export const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
