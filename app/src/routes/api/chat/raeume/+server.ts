// Räume anmelden und verwalten (Direktchat, Gruppe, Treffen). Der Browser legt den verschlüsselten Raum an,
// die App prüft über den Chat-Server, dass er dem Konto gehört.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { appUrl } from '$lib/server/config';
import { ChatError } from '$lib/server/chat/synapse';
import * as rooms from '$lib/server/chat/rooms';

const str = (x: unknown) => (typeof x === 'string' ? x : '');

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	const action = str(b.action);
	const roomId = str(b.roomId);
	return chatApi(event, async (sql, userId) => {
		const peerOf = async () => {
			const [p] = await sql`select user_id from user_profiles where contact_id = ${str(b.peer).toUpperCase().replace(/[^0-9A-Z]/g, '')}`;
			if (!p) throw new ChatError('Kontakt nicht gefunden.');
			return p.user_id as string;
		};
		switch (action) {
			case 'direkt-suchen':
				return { roomId: await rooms.directRoom(sql, userId, await peerOf()) };
			case 'direkt':
				return rooms.registerDirect(sql, userId, await peerOf(), roomId);
			case 'direkt-ersetzen':
				await rooms.retireDirect(sql, userId, roomId);
				return { ok: true };
			case 'gruppe':
				await rooms.registerGroup(sql, userId, roomId);
				return { ok: true };
			case 'treffen': {
				const token = await rooms.registerTreffen(sql, userId, roomId, Number(b.hours));
				return { url: `${appUrl()}/t/${token}` };
			}
			case 'qr-neu': {
				const token = await rooms.renewToken(sql, userId, roomId);
				return { url: `${appUrl()}/t/${token}` };
			}
			case 'behalten':
				await rooms.keepTreffen(sql, userId, roomId);
				return { ok: true };
			case 'beenden':
				await rooms.endTreffen(sql, userId, roomId);
				return { ok: true };
			case 'hinweis':
				return { sent: await rooms.nudge(sql, userId, await peerOf()) };
			case 'info':
				return { rooms: await rooms.roomMeta(sql, userId, Array.isArray(b.roomIds) ? b.roomIds.map(String) : []) };
			default:
				error(400, 'Unbekannte Aktion.');
		}
	});
};
