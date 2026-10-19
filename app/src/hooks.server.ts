import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { SESSION_COOKIE, validateSession, purgeExpiredSessions } from '$lib/server/session';
import { isSetupComplete } from '$lib/server/setup';
import { allowIndexing } from '$lib/server/config';
import { reapplyDeletions } from '$lib/server/account';
import { loadMailSettings, mailSettingsLoaded } from '$lib/server/mailsettings';
import { startScheduler } from '$lib/server/import/jobs';
import { loadAerial } from '$lib/server/aerial';
import { startChatJobs } from '$lib/server/chat/jobs';
import { startAngeboteJobs } from '$lib/server/angebote/jobs';
import { proxyMatrix } from '$lib/server/chat/proxy';

// Beim Start: Kontolöschungen aus der Löschliste erneut anwenden (wichtig nach einer Wiederherstellung).
export const init: ServerInit = async () => {
	await loadAerial(db()).catch(() => {});
	try {
		await loadMailSettings(db());
	} catch (e) {
		console.error('Mail-Einstellungen konnten nicht geladen werden:', (e as Error).message);
	}
	try {
		await reapplyDeletions(db());
	} catch (e) {
		console.error('Löschliste konnte nicht angewendet werden:', (e as Error).message);
	}
	// Datenquellen nach Zeitplan abrufen (Regionen, Kartenkacheln, Orte)
	startScheduler().catch((e) => console.error('Zeitplan konnte nicht starten:', (e as Error).message));
	startChatJobs();
	startAngeboteJobs();
};

const THEMES = new Set(['system', 'light', 'dark']);
let setupDone = false;
let lastPurge = 0;

// Diese Pfade funktionieren immer, auch vor der Einrichtung.
const OPEN_BEFORE_SETUP = [/^\/setup(\/|$)/, /^\/healthz$/, /^\/readyz$/, /^\/_app\//, /^\/favicon/, /^\/robots\.txt$/, /^\/manifest\.webmanifest$/, /^\/icon/];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	// Chat-Server (nur Client- und Medien-Schnittstelle) läuft intern und wird über die App erreicht – keine Plesk-Änderung nötig
	if (path.startsWith('/_matrix/client/') || path.startsWith('/_matrix/media/')) return proxyMatrix(event);
	// Interne Schnittstellen (Regelprüfung, Push-Gateway) nur aus dem internen Netz: Über Plesk kommt immer X-Forwarded-For
	if ((path.startsWith('/internal/') || path.startsWith('/_matrix/push/')) && (event.request.headers.has('x-forwarded-for') || event.request.headers.has('x-real-ip'))) {
		return new Response('Nicht gefunden', { status: 404 });
	}
	const themeCookie = event.cookies.get('kd_theme') ?? 'system';
	event.locals.theme = (THEMES.has(themeCookie) ? themeCookie : 'system') as App.Locals['theme'];
	event.locals.user = null;
	event.locals.session = null;

	if (path !== '/healthz' && path !== '/readyz' && !path.startsWith('/_app/') && !path.startsWith('/kacheln/') && !path.startsWith('/luftbild/') && !path.startsWith('/internal/') && !path.startsWith('/_matrix/push/')) {
		const sql = db();
		if (!mailSettingsLoaded()) await loadMailSettings(sql).catch(() => {});
		if (!setupDone) {
			setupDone = await isSetupComplete(sql);
			if (!setupDone && !OPEN_BEFORE_SETUP.some((r) => r.test(path))) {
				redirect(303, '/setup');
			}
		}
		const token = event.cookies.get(SESSION_COOKIE);
		if (token) {
			const res = await validateSession(sql, token);
			if (res) {
				event.locals.user = res.user;
				event.locals.session = res.session;
			} else {
				event.cookies.delete(SESSION_COOKIE, { path: '/' });
			}
		}
		if (Date.now() - lastPurge > 3_600_000) {
			lastPurge = Date.now();
			purgeExpiredSessions(sql).catch(() => {});
		}
	}

	const theme = event.locals.theme;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%kd.theme%', theme === 'system' ? '' : `data-theme="${theme}"`)
	});

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// Kamera (QR), Mikrofon (Sprachnachricht) und Standort (Karte, Treffpunkt) nur für die eigene Seite – der Browser fragt jeweils nach
	response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	if (!allowIndexing()) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	// Persönliche Seiten nie in geteilten Caches ablegen
	if (event.locals.user || path.startsWith('/admin') || path.startsWith('/setup')) {
		response.headers.set('Cache-Control', 'private, no-store');
	}
	return response;
};

export const handleError: HandleServerError = ({ error, status }) => {
	if (status !== 404) console.error('[fehler]', error instanceof Error ? error.message : error);
	return { message: status === 404 ? 'Diese Seite gibt es nicht.' : 'Etwas ist schiefgelaufen. Bitte später erneut versuchen.' };
};
