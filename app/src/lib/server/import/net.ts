// Netzwerkfehler verständlich machen: Node meldet nur „fetch failed“, die Ursache steckt in e.cause.
export function netError(e: unknown, host: string): string {
	const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string; errors?: { code?: string }[] } };
	if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `${host}: Zeitüberschreitung`;
	const c = err?.cause;
	const code = c?.code ?? c?.errors?.[0]?.code;
	const map: Record<string, string> = {
		ENOTFOUND: 'Name nicht auflösbar (DNS)',
		EAI_AGAIN: 'DNS vorübergehend nicht erreichbar',
		ECONNREFUSED: 'Verbindung abgelehnt',
		ECONNRESET: 'Verbindung abgebrochen',
		ETIMEDOUT: 'Zeitüberschreitung beim Verbinden',
		UND_ERR_CONNECT_TIMEOUT: 'Zeitüberschreitung beim Verbinden',
		UND_ERR_SOCKET: 'Verbindung abgebrochen',
		ENETUNREACH: 'Netz nicht erreichbar (IPv6?)',
		EHOSTUNREACH: 'Server nicht erreichbar',
		UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'Zertifikatskette unvollständig',
		UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'Zertifikat nicht prüfbar (fehlende Zwischenzertifikate)',
		CERT_HAS_EXPIRED: 'Zertifikat abgelaufen',
		SELF_SIGNED_CERT_IN_CHAIN: 'Zertifikat nicht vertrauenswürdig'
	};
	const detail = code ? `${map[code] ?? code}` : (c?.message ?? err?.message ?? 'unbekannter Fehler');
	return `${host}: ${detail}`.slice(0, 300);
}

/** fetch mit Wiederholung bei Netzwerkfehlern und 5xx/429 (Wartezeit wächst). */
export async function fetchRetry(url: string | URL, init: RequestInit & { timeoutMs?: number } = {}, tries = 3, waitMs = 20000, fetchImpl: typeof fetch = fetch): Promise<Response> {
	const host = new URL(url).host;
	let last = '';
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 120000) });
			if (res.ok) return res;
			last = `${host}: HTTP ${res.status}`;
			if (res.status < 500 && res.status !== 429) break;
		} catch (e) {
			last = netError(e, host);
		}
		if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs * (i + 1)));
	}
	throw new Error(last);
}
