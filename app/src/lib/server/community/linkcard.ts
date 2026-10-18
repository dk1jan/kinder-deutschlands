// Linkkarten (M07): Titel/Beschreibung/Vorschaubild eines Links serverseitig holen – ohne fremde Skripte im Browser.
// Schutz gegen Missbrauch (SSRF): nur http/https, Standardports, keine internen/privaten Adressen (auch nach Weiterleitung),
// feste IP je Verbindung (kein DNS-Rebinding), Größen- und Zeitgrenzen.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

export interface LinkCard {
	url: string;
	host: string;
	title: string | null;
	description: string | null;
	site: string | null;
	image: string | null; // externe Bild-URL – wird nur serverseitig geladen und als eigenes Bild gespeichert
	provider: 'youtube' | 'vimeo' | 'instagram' | 'tiktok' | 'facebook' | 'web';
	embed: { type: 'youtube' | 'vimeo'; id: string } | null;
	ok: boolean;
}

export function isPrivateAddress(ip: string): boolean {
	if (isIP(ip) === 4) {
		const [a, b] = ip.split('.').map(Number);
		return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
	}
	const v = ip.toLowerCase();
	if (v === '::1' || v === '::') return true;
	if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
	return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
}

export class LinkError extends Error {}

export function checkUrl(raw: string): URL {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		throw new LinkError('Ungültiger Link.');
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new LinkError('Nur http- und https-Links.');
	if (u.username || u.password) throw new LinkError('Links mit Zugangsdaten sind nicht erlaubt.');
	if (u.port && !['80', '443'].includes(u.port)) throw new LinkError('Ungewöhnlicher Port.');
	const h = u.hostname.replace(/^\[|\]$/g, '');
	if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !isIP(h)) throw new LinkError('Interne Adresse.');
	if (isIP(h) && isPrivateAddress(h)) throw new LinkError('Interne Adresse.');
	return u;
}

async function resolvePublic(host: string): Promise<{ address: string; family: number }> {
	const h = host.replace(/^\[|\]$/g, '');
	if (isIP(h)) return { address: h, family: isIP(h) };
	const all = await lookup(h, { all: true, verbatim: true });
	if (!all.length) throw new LinkError('Adresse nicht gefunden.');
	if (all.some((a) => isPrivateAddress(a.address))) throw new LinkError('Interne Adresse.');
	return all[0];
}

/** Einmal holen, mit fest gewählter (geprüfter) IP. Weiterleitungen werden einzeln geprüft. */
export async function safeGet(raw: string, opts: { maxBytes: number; accept: string; timeoutMs?: number; hops?: number }): Promise<{ url: string; type: string; body: Buffer }> {
	let current = checkUrl(raw);
	for (let hop = 0; hop <= (opts.hops ?? 3); hop++) {
		const ip = await resolvePublic(current.hostname);
		const lib = current.protocol === 'https:' ? https : http;
		const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
			const req = lib.request(
				current,
				{
					method: 'GET',
					headers: { 'user-agent': 'Mozilla/5.0 (compatible; KinderDeutschlandsLinkkarte/1.0)', accept: opts.accept, 'accept-language': 'de,en;q=0.7' },
					lookup: (_h, _o, cb) => (cb as (e: null, a: string, f: number) => void)(null, ip.address, ip.family),
					timeout: opts.timeoutMs ?? 6000
				},
				resolve
			);
			req.on('timeout', () => req.destroy(new LinkError('Zeitüberschreitung.')));
			req.on('error', reject);
			req.end();
		});
		if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
			res.resume();
			current = checkUrl(new URL(res.headers.location, current).toString());
			continue;
		}
		if (!res.statusCode || res.statusCode >= 400) {
			res.resume();
			throw new LinkError(`Seite antwortet mit ${res.statusCode}.`);
		}
		const type = String(res.headers['content-type'] ?? '');
		const chunks: Buffer[] = [];
		let size = 0;
		await new Promise<void>((resolve, reject) => {
			res.on('data', (c: Buffer) => {
				size += c.length;
				if (size > opts.maxBytes) {
					res.destroy();
					resolve();
					return;
				}
				chunks.push(c);
			});
			res.on('end', () => resolve());
			res.on('error', reject);
		});
		return { url: current.toString(), type, body: Buffer.concat(chunks) };
	}
	throw new LinkError('Zu viele Weiterleitungen.');
}

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&#x27;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/\s+/g, ' ')
		.trim();

export function parseMeta(html: string, base: string) {
	const head = html.slice(0, 300000);
	const meta = (name: string) => {
		const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
		const tag = re.exec(head)?.[0];
		const c = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : undefined;
		return c ? decode(c) : null;
	};
	const title = meta('og:title') ?? meta('twitter:title') ?? (/<title[^>]*>([^<]{1,300})<\/title>/i.exec(head)?.[1] ? decode(/<title[^>]*>([^<]{1,300})<\/title>/i.exec(head)![1]) : null);
	let image = meta('og:image') ?? meta('twitter:image');
	if (image) {
		try {
			image = new URL(image, base).toString();
		} catch {
			image = null;
		}
	}
	return {
		title: title?.slice(0, 200) ?? null,
		description: (meta('og:description') ?? meta('description') ?? meta('twitter:description'))?.slice(0, 400) ?? null,
		site: meta('og:site_name')?.slice(0, 80) ?? null,
		image
	};
}

export function providerOf(u: URL): Pick<LinkCard, 'provider' | 'embed'> {
	const h = u.hostname.replace(/^www\.|^m\./, '');
	if (h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com') {
		const id = h === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') ?? /^\/(?:shorts|embed|live)\/([^/?]+)/.exec(u.pathname)?.[1] ?? '');
		return { provider: 'youtube', embed: /^[A-Za-z0-9_-]{6,20}$/.test(id) ? { type: 'youtube', id } : null };
	}
	if (h === 'vimeo.com') {
		const id = /^\/(\d{4,12})/.exec(u.pathname)?.[1];
		return { provider: 'vimeo', embed: id ? { type: 'vimeo', id } : null };
	}
	if (h === 'instagram.com') return { provider: 'instagram', embed: null };
	if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return { provider: 'tiktok', embed: null };
	if (h === 'facebook.com' || h === 'fb.watch') return { provider: 'facebook', embed: null };
	return { provider: 'web', embed: null };
}

/** Linkkarte erzeugen. Schlägt der Abruf fehl, gibt es eine ehrliche Minimalkarte (nur Adresse). */
export async function buildCard(raw: string): Promise<LinkCard> {
	const u = checkUrl(raw);
	const p = providerOf(u);
	const base: LinkCard = { url: u.toString(), host: u.hostname.replace(/^www\./, ''), title: null, description: null, site: null, image: null, ...p, ok: false };
	try {
		const r = await safeGet(u.toString(), { maxBytes: 600_000, accept: 'text/html,application/xhtml+xml' });
		if (!/html/i.test(r.type)) return base;
		const m = parseMeta(r.body.toString('utf8'), r.url);
		return { ...base, ...m, ok: !!m.title };
	} catch {
		return base;
	}
}
