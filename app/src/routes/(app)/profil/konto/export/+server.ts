import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { exportAccount } from '$lib/server/account';
import { audit } from '$lib/server/audit';

// Download aller eigenen Daten als JSON (Auskunft/Datenübertragbarkeit).
export const GET: RequestHandler = async (event) => {
	const user = requireMember(event);
	const sql = db();
	const data = await exportAccount(sql, user.id);
	await audit(sql, { actorId: user.id, action: 'account.exported' });
	const day = new Date().toISOString().slice(0, 10);
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="kinder-deutschlands-meine-daten-${day}.json"`,
			'cache-control': 'private, no-store'
		}
	});
};
