import type { RequestHandler } from './$types';
import { allowIndexing } from '$lib/server/config';

// Testbetrieb: nichts indexieren. Mitgliederbereiche sind zusätzlich serverseitig geschützt.
export const GET: RequestHandler = () => {
	const body = allowIndexing()
		? 'User-agent: *\nDisallow: /admin\nDisallow: /setup\nDisallow: /profil\nDisallow: /nachrichten\n'
		: 'User-agent: *\nDisallow: /\n';
	return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
