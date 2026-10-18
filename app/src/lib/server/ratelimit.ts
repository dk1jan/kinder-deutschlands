// Einfache Begrenzung im Speicher (eine App-Instanz). Bei mehreren Instanzen später nach Valkey verlagern.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
	const now = Date.now();
	const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
	if (hits.length >= max) {
		buckets.set(key, hits);
		return false;
	}
	hits.push(now);
	buckets.set(key, hits);
	if (buckets.size > 10_000) {
		for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
	}
	return true;
}
