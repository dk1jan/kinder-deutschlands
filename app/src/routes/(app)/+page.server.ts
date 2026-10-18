import QRCode from 'qrcode';
import type { PageServerLoad } from './$types';
import { appUrl } from '$lib/server/config';

// Echter QR-Code (führt auf diese Plattform) für die Beispiel-Familien-ID auf der Startseite.
let cached: string | null = null;

export const load: PageServerLoad = async () => {
	if (!cached) {
		cached = await QRCode.toString(appUrl() + '/', {
			type: 'svg',
			margin: 0,
			errorCorrectionLevel: 'M',
			color: { dark: '#0f2238', light: '#00000000' }
		});
	}
	return { qr: cached };
};
