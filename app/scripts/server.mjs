// Startet die App (SvelteKit, adapter-node) und reicht /livekit/rtc… an den Medienserver LiveKit weiter
// (Signalisierung der Gruppenanrufe per WebSocket, D-072). So braucht es keine zweite Domain und keine
// Änderung am nginx-Block in Plesk. Nur der Signalweg geht hierüber – die Medien laufen direkt über UDP/TCP 49210.
// Weitergereicht wird ausschließlich /livekit/rtc…; die Verwaltungs-Schnittstelle von LiveKit bleibt intern.
import http from 'node:http';
import net from 'node:net';
import { handler } from '../build/handler.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const LK = process.env.LIVEKIT_URL ? new URL(process.env.LIVEKIT_URL) : null;
const PREFIX = '/livekit';

/** /livekit/rtc… → /rtc… ; alles andere nicht. */
function livekitPath(url) {
	if (!url || !url.startsWith(PREFIX + '/rtc')) return null;
	const rest = url.slice(PREFIX.length);
	if (/\.\.|%2e|%2f|\/\/|\\/i.test(rest.split('?')[0])) return null;
	return /^\/rtc(\/|\?|$)/.test(rest) ? rest : null;
}

function forwardHttp(req, res, path) {
	const up = http.request(
		{ host: LK.hostname, port: Number(LK.port || 80), method: req.method, path, headers: { ...req.headers, host: LK.host }, timeout: 15000 },
		(r) => {
			res.writeHead(r.statusCode ?? 502, r.headers);
			r.pipe(res);
		}
	);
	up.on('error', () => {
		if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('Medienserver nicht erreichbar');
	});
	up.on('timeout', () => up.destroy());
	req.pipe(up);
}

const server = http.createServer((req, res) => {
	const path = LK && livekitPath(req.url);
	if (path && req.method === 'GET') return forwardHttp(req, res, path);
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Nicht gefunden');
	});
});

server.on('upgrade', (req, socket, head) => {
	const path = LK && livekitPath(req.url);
	if (!path || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
		socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
		return;
	}
	const up = net.connect(Number(LK.port || 80), LK.hostname);
	up.setNoDelay(true);
	socket.setNoDelay(true);
	const close = () => {
		socket.destroy();
		up.destroy();
	};
	up.on('error', close);
	socket.on('error', close);
	up.on('connect', () => {
		const lines = [`${req.method} ${path} HTTP/1.1`];
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			const k = req.rawHeaders[i];
			lines.push(`${k}: ${k.toLowerCase() === 'host' ? LK.host : req.rawHeaders[i + 1]}`);
		}
		up.write(lines.join('\r\n') + '\r\n\r\n');
		if (head?.length) up.write(head);
		socket.pipe(up).pipe(socket);
	});
	up.on('close', () => socket.destroy());
	socket.on('close', () => up.destroy());
});

// Lange Verbindungen (Chat-Sync, WebSocket) nicht vorzeitig kappen
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(PORT, HOST, () => console.log(`[server] läuft auf ${HOST}:${PORT}${LK ? ', Gruppenanrufe über ' + LK.host : ''}`));

let closing = false;
function shutdown() {
	if (closing) return;
	closing = true;
	server.close(() => process.exit(0));
	server.closeIdleConnections?.();
	setTimeout(() => process.exit(0), Number(process.env.SHUTDOWN_TIMEOUT || 30) * 1000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
