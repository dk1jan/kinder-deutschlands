import { error, type RequestEvent } from '@sveltejs/kit';
import { appUrl } from './config';

/** JSON-Endpunkte nur vom eigenen Origin (zusätzlich zur Same-Origin-Policy des Browsers). */
export function requireSameOrigin(event: RequestEvent) {
	const origin = event.request.headers.get('origin');
	if (origin !== new URL(appUrl()).origin) error(403, 'Anfrage von fremder Herkunft.');
}
