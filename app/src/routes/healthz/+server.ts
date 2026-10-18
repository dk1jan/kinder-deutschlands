import type { RequestHandler } from './$types';

// Lebenszeichen für den Container-Healthcheck (ohne Datenbank).
export const GET: RequestHandler = () => new Response('ok', { headers: { 'cache-control': 'no-store' } });
