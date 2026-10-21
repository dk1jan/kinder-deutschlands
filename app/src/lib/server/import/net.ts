// Netzwerkfehler verständlich machen: Node meldet nur „fetch failed“, die Ursache steckt in e.cause.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

/** Fehlercode aus einem fetch-Fehler (steckt in e.cause). */
export function netCode(e: unknown): string | undefined {
	const c = (e as { cause?: { code?: string; errors?: { code?: string }[] } })?.cause;
	return c?.code ?? c?.errors?.[0]?.code;
}

/**
 * Abruf nur über IPv4 (F-020). Manche Namensserver (z. B. bei sgx.geodatenzentrum.de) beantworten die IPv6-Anfrage
 * mit SERVFAIL; im Alpine-Container scheitert dann die ganze Auflösung mit EAI_AGAIN, obwohl die IPv4-Adresse da ist.
 * Fragt nur den A-Eintrag ab und liefert eine normale Response wie fetch.
 */
export function fetchIpv4(url: string | URL, init: RequestInit = {}): Promise<Response> {
	const u = new URL(url);
	const mod = u.protocol === 'https:' ? https : http;
	const headers: Record<string, string> = {};
	new Headers(init.headers).forEach((v, k) => (headers[k] = v));
	return new Promise((resolve, reject) => {
		const req = mod.request(
			u,
			{
				method: init.method ?? 'GET',
				headers,
				signal: init.signal ?? undefined,
				lookup: (host, opts, cb) => dns.lookup(host, { ...opts, family: 4 }, cb as never)
			},
			(res) => {
				const h = new Headers();
				for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
				const status = res.statusCode ?? 502;
				const body = status === 204 || status === 304 ? null : (Readable.toWeb(res) as ReadableStream);
				resolve(new Response(body, { status, statusText: res.statusMessage, headers: h }));
			}
		);
		req.on('error', (e) => reject(Object.assign(new TypeError('fetch failed'), { cause: e })));
		if (typeof init.body === 'string') req.write(init.body);
		req.end();
	});
}
export function netError(e: unknown, host: string): string {
	const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string; errors?: { code?: string }[] } };
	if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `${host}: Zeitüberschreitung`;
	const c = err?.cause;
	const code = netCode(e);
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
export async function fetchRetry(
	url: string | URL,
	init: RequestInit & { timeoutMs?: number } = {},
	tries = 3,
	waitMs = 20000,
	fetchImpl: typeof fetch = fetch,
	ipv4Impl: (u: string | URL, i: RequestInit) => Promise<Response> = fetchIpv4
): Promise<Response> {
	const host = new URL(url).host;
	let last = '';
	let max = tries;
	let v4 = false;
	for (let i = 0; i < max; i++) {
		try {
			const opts = { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 120000) };
			const res = await (v4 ? ipv4Impl(url, opts) : fetchImpl(url, opts));
			if (res.ok) return res;
			last = `${host}: HTTP ${res.status}`;
			if (res.status < 500 && res.status !== 429) break;
		} catch (e) {
			last = netError(e, host);
			// IPv6-Anfrage scheitert beim Namensserver (F-020): sofort noch einmal nur über IPv4
			if (!v4 && netCode(e) === 'EAI_AGAIN') {
				v4 = true;
				i--;
				continue;
			}
			// DNS-Aussetzer (F-013) halten oft ein paar Minuten an – zwei Versuche mehr mit längerer Pause
			if (/DNS/.test(last) && max === tries) max = tries + 2;
		}
		if (i < max - 1) await new Promise((r) => setTimeout(r, waitMs * (i + 1)));
	}
	throw new Error(last);
}
