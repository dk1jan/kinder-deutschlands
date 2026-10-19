// Regelprüfung für den Chat-Server (nur internes Netz, mit gemeinsamem Geheimnis).
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { safeEqual } from '$lib/server/crypto';
import { chatSecret } from '$lib/server/chat/synapse';
import { checkRule, type CheckRequest } from '$lib/server/chat/rules';

export const POST: RequestHandler = async ({ request }) => {
	const auth = request.headers.get('authorization') ?? '';
	if (!safeEqual(auth, `Bearer ${chatSecret('module')}`)) return new Response('Nicht erlaubt', { status: 403 });
	let body: CheckRequest;
	try {
		body = (await request.json()) as CheckRequest;
	} catch {
		return Response.json({ allow: false });
	}
	if (!['invite', 'join', 'send'].includes(body?.action)) return Response.json({ allow: false });
	try {
		return Response.json(await checkRule(db(), body));
	} catch (e) {
		console.error('[chat] Regelprüfung:', (e as Error).message);
		return Response.json({ allow: false });
	}
};
