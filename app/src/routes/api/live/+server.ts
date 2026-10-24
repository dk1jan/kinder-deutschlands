import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rateLimit } from '$lib/server/ratelimit';
import { LiveError, ownShare, startShare, stopShare, updatePosition } from '$lib/server/live';

// F-037: eigene Live-Freigabe. Nur Mitglieder (mit abgeschlossener Anmeldung). Nie zwischenspeichern.
const H = { 'cache-control': 'private, no-store' };
function who(locals: App.Locals) {
	if (!locals.user || !locals.session?.mfaVerified) error(401, 'Bitte anmelden.');
	return locals.user.id;
}
const view = (o: Awaited<ReturnType<typeof ownShare>>) => json({ active: !!o, share: o ? { audience: o.audience, expiresAt: o.expiresAt.toISOString() } : null }, { headers: H });

export const GET: RequestHandler = async ({ locals }) => view(await ownShare(db(), who(locals)));

/** Start: {audience, minutes, lon, lat}; Positionsupdate: {lon, lat} (Ablaufzeit bleibt). */
export const POST: RequestHandler = async ({ locals, request, getClientAddress }) => {
	const id = who(locals);
	if (!rateLimit(`live:${id}:${getClientAddress()}`, 30, 60_000)) error(429, 'Zu viele Anfragen.');
	const b = (await request.json().catch(() => null)) as { audience?: string; minutes?: number; lon?: number; lat?: number } | null;
	if (!b) error(400, 'Ungültige Anfrage.');
	try {
		if (b.audience !== undefined) return view(await startShare(db(), id, { audience: String(b.audience), minutes: Number(b.minutes), lon: Number(b.lon), lat: Number(b.lat) }));
		return view(await updatePosition(db(), id, Number(b.lon), Number(b.lat)));
	} catch (e) {
		if (e instanceof LiveError) error(400, e.message);
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ locals }) => {
	await stopShare(db(), who(locals));
	return view(null);
};
