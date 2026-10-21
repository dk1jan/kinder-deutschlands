// F-020: Abrufe weichen auf IPv4 aus, wenn die Namensauflösung mit EAI_AGAIN scheitert (IPv6-Anfrage bekommt SERVFAIL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchIpv4, fetchRetry, netCode, netError } from '../src/lib/server/import/net';
import { overpass } from '../src/lib/server/import/osm';

const dnsFail = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'EAI_AGAIN' } });

describe('Netz: IPv4-Rückfall (F-020)', () => {
	let srv: http.Server;
	let port = 0;
	beforeAll(async () => {
		srv = http.createServer((req, res) => {
			let body = '';
			req.on('data', (c) => (body += c));
			req.on('end', () => {
				res.writeHead(req.url === '/fehlt' ? 404 : 200, { 'content-type': 'application/json', 'x-test': 'ja' });
				res.end(JSON.stringify({ method: req.method, path: req.url, body, accept: req.headers.accept ?? null }));
			});
		});
		await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
		port = (srv.address() as AddressInfo).port;
	});
	afterAll(() => srv.close());

	it('fetchIpv4 liefert eine normale Response (Status, Kopfzeilen, Inhalt, POST)', async () => {
		const r = await fetchIpv4(`http://localhost:${port}/a?b=1`, { headers: { accept: 'application/json' } });
		expect(r.ok).toBe(true);
		expect(r.headers.get('x-test')).toBe('ja');
		expect(await r.json()).toEqual({ method: 'GET', path: '/a?b=1', body: '', accept: 'application/json' });
		const p = await fetchIpv4(`http://localhost:${port}/p`, { method: 'POST', body: 'data=x' });
		expect((await p.json()).body).toBe('data=x');
		const n = await fetchIpv4(`http://localhost:${port}/fehlt`);
		expect(n.status).toBe(404);
	});

	it('fetchIpv4 meldet Fehler wie fetch (Ursache in cause)', async () => {
		const e = await fetchIpv4('http://127.0.0.1:1/').catch((x) => x);
		expect(netCode(e)).toBe('ECONNREFUSED');
		expect(netError(e, 'h')).toBe('h: Verbindung abgelehnt');
	});

	it('fetchRetry: EAI_AGAIN → sofort über IPv4, ohne Wartezeit', async () => {
		let normal = 0;
		let v4 = 0;
		const t0 = Date.now();
		const r = await fetchRetry(
			'https://sgx.example/x',
			{},
			3,
			60_000,
			(async () => {
				normal++;
				throw dnsFail();
			}) as typeof fetch,
			async () => {
				v4++;
				return new Response('ok');
			}
		);
		expect(await r.text()).toBe('ok');
		expect([normal, v4]).toEqual([1, 1]);
		expect(Date.now() - t0).toBeLessThan(1000);
	});

	it('fetchRetry: anderer Fehler → kein IPv4-Umweg', async () => {
		let v4 = 0;
		const e = await fetchRetry(
			'https://x.example/',
			{},
			1,
			1,
			(async () => {
				throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
			}) as typeof fetch,
			async () => {
				v4++;
				return new Response('');
			}
		).catch((x) => x);
		expect(String(e.message)).toMatch(/Verbindung abgelehnt/);
		expect(v4).toBe(0);
	});

	it('Overpass mit eingespeistem fetch bleibt unverändert (kein Umweg in Tests)', async () => {
		const els = await overpass('[out:json];', {
			userAgent: 't',
			endpoints: ['https://o.example/api'],
			fetchImpl: (async () => new Response(JSON.stringify({ elements: [{ type: 'node', id: 1 }] }))) as typeof fetch
		});
		expect(els).toHaveLength(1);
	});
});
