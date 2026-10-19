// Gemeinsames für die Radar-Seiten.
import type { Sql } from '../db';
import type { Profile } from './radar';

export function profileValues(p: Profile): Record<string, string[]> {
	return {
		name: [p.name],
		regions: p.regions,
		topics: p.topics,
		include: p.include,
		ages: p.ageGroups,
		frequency: [p.frequency],
		via_email: p.viaEmail ? ['on'] : [],
		via_push: p.viaPush ? ['on'] : []
	};
}

export async function regionNames(sql: Sql, codes: string[]) {
	if (!codes.length) return [];
	const rows = await sql`select code, name from regions where code = any(${codes})`;
	const m = new Map(rows.map((r) => [r.code as string, r.name as string]));
	return codes.filter((c) => m.has(c)).map((c) => ({ code: c, name: m.get(c)! }));
}
