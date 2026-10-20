// Gruppenanrufe (D-072): Beitritts-Token und Status. Nur angemeldete Mitglieder der Gruppe bzw. des Treffens.
import type { RequestHandler } from './$types';
import { body, chatApi } from '$lib/server/chat/api';
import { callStatus, joinCall } from '$lib/server/livekit';

const str = (x: unknown) => (typeof x === 'string' ? x : '');

export const GET: RequestHandler = async (event) =>
	chatApi(event, (sql, userId) => callStatus(sql, userId, event.url.searchParams.get('raum') ?? ''));

export const POST: RequestHandler = async (event) => {
	const b = await body(event);
	return chatApi(event, (sql, userId) => joinCall(sql, userId, str(b.roomId), str(b.deviceId)));
};
