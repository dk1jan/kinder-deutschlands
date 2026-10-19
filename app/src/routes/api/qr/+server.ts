// QR-Code als SVG – nur für Beitrittslinks von Treffen dieser Plattform (kein allgemeiner QR-Dienst).
import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import type { RequestHandler } from './$types';
import { appUrl } from '$lib/server/config';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user || !locals.session?.mfaVerified) error(401, 'Bitte anmelden.');
	const d = url.searchParams.get('d') ?? '';
	if (!d.startsWith(appUrl() + '/t/') || d.length > 200) error(400, 'Nicht erlaubt.');
	const svg = await QRCode.toString(d, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f2238', light: '#ffffff' } });
	return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'private, no-store' } });
};
