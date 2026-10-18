import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { userCan } from './roles';
import type { Target } from './rights';

/** Admin-Zugriff: angemeldet, zweiter Faktor bestätigt, und die konkrete Aktion erlaubt. Serverseitig bei jedem Aufruf. */
export async function requireAction(event: Pick<RequestEvent, 'locals' | 'url'>, action: string, target?: Target) {
	const { locals, url } = event;
	if (!locals.user || !locals.session) redirect(303, `/anmelden?weiter=${encodeURIComponent(url.pathname)}`);
	if (!locals.session.mfaVerified) redirect(303, `/anmelden/code?weiter=${encodeURIComponent(url.pathname)}`);
	if (!(await userCan(db(), locals.user.id, action, target))) error(403, 'Dafür fehlt die Berechtigung.');
	return locals.user;
}

/** Mitgliederbereich: angemeldet (inkl. zweitem Faktor, falls eingerichtet). */
export function requireMember(event: Pick<RequestEvent, 'locals' | 'url'>) {
	const { locals, url } = event;
	if (!locals.user || !locals.session) redirect(303, `/anmelden?weiter=${encodeURIComponent(url.pathname + url.search)}`);
	if (!locals.session.mfaVerified) redirect(303, `/anmelden/code?weiter=${encodeURIComponent(url.pathname + url.search)}`);
	return locals.user;
}
