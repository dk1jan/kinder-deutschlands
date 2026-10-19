// Chat-Geräte des eigenen Kontos anzeigen und abmelden (ohne zusätzliche Passwortabfrage – Anmeldung ist schon geprüft).
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { deleteDevice, ensureAccount, listDevices, ChatError } from '$lib/server/chat/synapse';
import { audit } from '$lib/server/audit';

export const GET: RequestHandler = (event) =>
	chatApi(event, async (sql, userId) => ({ devices: await listDevices(sql, await ensureAccount(sql, userId)) }));

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(event, async (sql, userId) => {
		const lp = await ensureAccount(sql, userId);
		const id = String(b.deviceId ?? '');
		if (!(await listDevices(sql, lp)).some((d) => d.id === id)) throw new ChatError('Gerät nicht gefunden.');
		await deleteDevice(sql, lp, id);
		await audit(sql, { actorId: userId, action: 'chat.device.removed' });
		return { ok: true };
	});
};
