// Weiterleitung der Matrix-Client- und Medien-Schnittstelle an den internen Chat-Server.
// Nur diese Pfade; Admin-Schnittstelle (/_synapse) und Föderation bleiben von außen unerreichbar.
import type { RequestEvent } from '@sveltejs/kit';
import { chatEnabled, synapseUrl } from './synapse';

const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer', 'host', 'content-length']);

export async function proxyMatrix(event: RequestEvent): Promise<Response> {
	if (!chatEnabled()) return Response.json({ errcode: 'M_UNRECOGNIZED', error: 'Chat ist nicht eingerichtet.' }, { status: 404 });
	const url = synapseUrl() + event.url.pathname + event.url.search;
	const headers = new Headers();
	for (const [k, v] of event.request.headers) if (!HOP.has(k) && k !== 'cookie' && !k.startsWith('x-forwarded')) headers.set(k, v);
	// Chat-Server begrenzt Anfragen je Adresse – echte Adresse weitergeben
	let ip = '';
	try {
		ip = event.getClientAddress();
	} catch {
		/* unbekannt */
	}
	if (ip) headers.set('x-forwarded-for', ip);
	headers.set('x-forwarded-proto', event.url.protocol.replace(':', ''));
	const method = event.request.method;
	const hasBody = method !== 'GET' && method !== 'HEAD';
	try {
		// Synapse verlangt Content-Length (z. B. beim Hochladen) – Anfrageinhalt daher gepuffert weitergeben (max. BODY_SIZE_LIMIT)
		const body = hasBody ? new Uint8Array(await event.request.arrayBuffer()) : undefined;
		if (body) headers.set('content-length', String(body.byteLength));
		const res = await fetch(url, {
			method,
			headers,
			body,
			redirect: 'manual',
			signal: AbortSignal.timeout(120_000)
		});
		const out = new Headers();
		for (const [k, v] of res.headers) if (!HOP.has(k) && k !== 'set-cookie' && k !== 'content-encoding') out.set(k, v);
		out.set('cache-control', out.get('cache-control') ?? 'no-store');
		out.set('x-content-type-options', 'nosniff');
		// Medien des Chat-Servers sind verschlüsselt oder Profilbilder – nie als Seite ausführen
		if (event.url.pathname.includes('/media/')) out.set('content-security-policy', "default-src 'none'; sandbox");
		return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
	} catch (e) {
		return Response.json({ errcode: 'M_UNAVAILABLE', error: 'Chat-Server nicht erreichbar.' }, { status: 502 });
	}
}
