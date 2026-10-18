import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';
import { appUrl } from '$lib/server/config';
import { mailConfigured } from '$lib/server/mailer';
import { db } from '$lib/server/db';
import { placeCounts } from '$lib/server/places';

// Echter QR-Code (führt auf diese Plattform) für die Beispiel-Familien-ID auf der Startseite.
let cached: string | null = null;

export const load: PageServerLoad = async ({ url }) => {
	if (!cached) {
		cached = await QRCode.toString(appUrl() + '/', {
			type: 'svg',
			margin: 0,
			errorCorrectionLevel: 'M',
			color: { dark: '#0f2238', light: '#00000000' }
		});
	}
	const counts = await placeCounts(db()).catch(() => ({}) as Record<string, number>);
	return { qr: cached, mailOpen: mailConfigured(), deleted: url.searchParams.has('geloescht'), counts };
};
