// CAP 1.2 (Common Alerting Protocol) lesen – nur die Felder, die wir für Wetterwarnungen brauchen.
// Bewusst ohne XML-Bibliothek: CAP ist flach und gut definiert; Entitäten werden dekodiert, Text bleibt unverändert.

export interface CapArea {
	desc: string;
	/** Ringe als [lon, lat] */
	polygons: [number, number][][];
	geocodes: Record<string, string[]>;
}

export interface CapAlert {
	identifier: string;
	sender: string | null;
	sent: string;
	status: string;
	msgType: string;
	references: string[];
	event: string | null;
	eventGroup: string | null;
	urgency: string | null;
	severity: string;
	headline: string;
	description: string | null;
	instruction: string | null;
	senderName: string | null;
	web: string | null;
	effective: string | null;
	onset: string | null;
	expires: string | null;
	areas: CapArea[];
}

const ENT: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function decode(s: string): string {
	return s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) =>
			e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m)
		)
		.trim();
}

/** Alle Vorkommen eines Elements (mit oder ohne Namensraum-Präfix) – nur direkte Inhalte, keine Verschachtelung gleichen Namens. */
function all(xml: string, tag: string): string[] {
	const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'g');
	return [...xml.matchAll(re)].map((m) => m[1]);
}
const one = (xml: string, tag: string): string | null => {
	const v = all(xml, tag)[0];
	return v === undefined ? null : decode(v) || null;
};

function pairs(xml: string, tag: string): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	for (const block of all(xml, tag)) {
		const k = one(block, 'valueName');
		const v = one(block, 'value');
		if (k && v !== null) (out[k] ??= []).push(v);
	}
	return out;
}

/** „lat,lon lat,lon …“ → Ring [lon, lat][] */
export function parsePolygon(s: string): [number, number][] | null {
	const pts = s
		.trim()
		.split(/\s+/)
		.map((p) => p.split(',').map(Number))
		.filter((p) => p.length === 2 && p.every(Number.isFinite))
		.map(([lat, lon]) => [lon, lat] as [number, number]);
	if (pts.length < 3) return null;
	const [a, b] = [pts[0], pts[pts.length - 1]];
	if (a[0] !== b[0] || a[1] !== b[1]) pts.push([a[0], a[1]]);
	return pts.length >= 4 ? pts : null;
}

/** Eine CAP-Meldung. Bei mehreren Sprachen gewinnt Deutsch. */
export function parseCap(xml: string): CapAlert | null {
	const identifier = one(xml, 'identifier');
	const sent = one(xml, 'sent');
	if (!identifier || !sent) return null;
	const infos = all(xml, 'info');
	const info = infos.find((i) => /^de/i.test(one(i, 'language') ?? '')) ?? infos[0];
	if (!info) return null;
	const codes = pairs(info, 'eventCode');
	// references: „sender,identifier,sent sender,identifier,sent …“
	const references = (one(xml, 'references') ?? '')
		.split(/\s+/)
		.map((r) => r.split(',')[1])
		.filter((x): x is string => !!x);
	return {
		identifier,
		sender: one(xml, 'sender'),
		sent,
		status: one(xml, 'status') ?? 'Actual',
		msgType: one(xml, 'msgType') ?? 'Alert',
		references,
		event: one(info, 'event'),
		eventGroup: codes.GROUP?.[0] ?? null,
		urgency: one(info, 'urgency'),
		severity: one(info, 'severity') ?? 'Unknown',
		headline: one(info, 'headline') ?? one(info, 'event') ?? 'Warnung',
		description: one(info, 'description'),
		instruction: one(info, 'instruction'),
		senderName: one(info, 'senderName'),
		web: one(info, 'web'),
		effective: one(info, 'effective'),
		onset: one(info, 'onset'),
		expires: one(info, 'expires'),
		areas: all(info, 'area').map((a) => ({
			desc: one(a, 'areaDesc') ?? '',
			polygons: all(a, 'polygon').map((p) => parsePolygon(decode(p))).filter((p): p is [number, number][] => !!p),
			geocodes: pairs(a, 'geocode')
		}))
	};
}

export const LEVEL: Record<string, number> = { Minor: 1, Moderate: 2, Severe: 3, Extreme: 4 };
export const levelOf = (severity: string) => LEVEL[severity] ?? 0;
export const LEVEL_LABEL: Record<number, string> = {
	0: 'Hinweis',
	1: 'Wetterwarnung',
	2: 'Markante Wetterwarnung',
	3: 'Unwetterwarnung',
	4: 'Extremes Unwetter'
};

/** DWD-Warnzellen der Kreise: „1“ + fünfstelliger Kreisschlüssel + „000“ (z. B. 101055000 = Kreis Ostholstein). */
export function kreisFromWarncell(id: string): string | null {
	const m = /^1(\d{5})000$/.exec(id.trim());
	return m ? m[1] : null;
}
