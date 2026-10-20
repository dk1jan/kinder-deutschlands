// Nachricht der Verwaltung an ein Mitglied (F-007): als Mitteilung im App-Postfach (Glocke), ohne E-Mail,
// adressiert über die Familien-ID oder einen Moderationsfall. Protokolliert (wer, an wen, Länge – nicht der Text).
import type { Sql } from './db';
import { userCan } from './roles';
import { audit } from './audit';
import { notify, PostError } from './community/posts';
import { normalizeContactId } from './contactid';

export async function canMessage(sql: Sql, actorId: string): Promise<boolean> {
	return (await userCan(sql, actorId, 'users.view')) || (await userCan(sql, actorId, 'users.restrict'));
}

export async function messageUser(sql: Sql, actorId: string, target: { contactId?: string; userId?: string }, text: string, opts: { caseId?: string } = {}) {
	const t = text.trim().replace(/\r/g, '');
	if (t.length < 5) throw new PostError('Bitte eine Nachricht schreiben (mindestens 5 Zeichen).');
	if (t.length > 800) throw new PostError('Höchstens 800 Zeichen.');
	let userId = target.userId ?? null;
	if (!userId && target.contactId) {
		const cid = normalizeContactId(target.contactId);
		const [p] = cid ? await sql`select p.user_id from user_profiles p join users u on u.id = p.user_id and u.status <> 'deleted' where p.contact_id = ${cid}` : [];
		userId = (p?.user_id as string) ?? null;
	}
	if (!userId) throw new PostError('Diese Familien-ID gibt es nicht.');
	if (userId === actorId) throw new PostError('An dich selbst geht das nicht.');
	const [{ n }] = await sql`select count(*)::int as n from audit_log where actor_id = ${actorId} and action = 'user.messaged' and at > now() - interval '1 day'`;
	if (n >= 100) throw new PostError('Heute schon sehr viele Nachrichten verschickt.');
	await notify(sql, userId, 'verwaltung', `Nachricht der Verwaltung: ${t}`, '/profil/mitteilungen');
	await audit(sql, { actorId, action: 'user.messaged', targetType: 'user', targetId: userId, meta: { chars: t.length, case: opts.caseId ?? null } });
}
