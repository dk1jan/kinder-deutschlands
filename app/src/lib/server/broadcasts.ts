// Rundnachrichten (Jan 24.10., REQUIREMENTS „regionale Systemmitteilungen“): Das Team schreibt alle Mitglieder oder
// einzelne Regionen an (Länder, Kreise, Städte, Stadtteile – jeweils mit allem darunter). Zustellung als Mitteilung in
// der Glocke; Push nur an Personen, die „Wichtiges sofort“ eingeschaltet haben. Eigenes Recht `broadcast.send`
// (Rolle „Rundnachrichten“): global = überall, Region = nur diese Region und darunter.
import type { Sql } from './db';
import { can, roleAllows } from './rights';
import { loadAssignments, loadPermissions, regionPath } from './roles';
import { audit } from './audit';

export class BroadcastError extends Error {}

export interface BroadcastInput {
	title: string;
	body: string;
	link: string | null;
	all: boolean;
	regions: string[];
	push: boolean;
}

export const MAX_REGIONS = 20;
const LINK_OK = /^(\/(?!\/)[\w\-./?=&%#äöüÄÖÜß]*|https:\/\/[^\s<>"]+)$/;

/** Was darf die Person? any = irgendwo, all = an alle (globales Recht), regions = zugewiesene Regionen. */
export async function broadcastRights(sql: Sql, userId: string): Promise<{ any: boolean; all: boolean; regions: { code: string; name: string }[] }> {
	const [perms, assignments] = await Promise.all([loadPermissions(sql), loadAssignments(sql, userId)]);
	const now = new Date();
	const active = assignments.filter((a) => (!a.expires_at || a.expires_at > now) && roleAllows(perms, a.role_key, 'broadcast.send'));
	const all = can(assignments, perms, 'broadcast.send');
	const codes = [...new Set(active.filter((a) => a.scope_type === 'region' && a.scope_id).map((a) => a.scope_id as string))];
	const regions = codes.length ? await sql`select code, name from regions where code = any(${codes}) order by name` : [];
	return { any: all || active.length > 0, all, regions: regions.map((r) => ({ code: r.code as string, name: r.name as string })) };
}

function recipientsQuery(sql: Sql, all: boolean, regions: string[]) {
	return sql`select u.id from users u left join user_profiles p on p.user_id = u.id
		where u.status = 'active' and ${all ? sql`true` : sql`p.region_code in (with recursive sub as (select code from regions where code = any(${regions})
			union all select r.code from regions r join sub on r.parent_code = sub.code) select code from sub)`}`;
}

/** Anzahl der Empfänger – unter 5 nur als „weniger als 5“ (wie in der Statistik, keine Rückschlüsse auf Einzelne). */
export async function countRecipients(sql: Sql, all: boolean, regions: string[]): Promise<number> {
	const [{ n }] = await sql`select count(*)::int as n from (${recipientsQuery(sql, all, regions)}) x`;
	return n as number;
}
export const fuzzyCount = (n: number) => (n === 0 ? 'niemand' : n < 5 ? 'weniger als 5' : n.toLocaleString('de-DE'));

function clean(i: BroadcastInput): BroadcastInput {
	const title = i.title.trim().replace(/\s+/g, ' ');
	const body = i.body.trim().replace(/\r/g, '');
	const link = i.link?.trim() || null;
	if (title.length < 3 || title.length > 120) throw new BroadcastError('Der Titel braucht 3 bis 120 Zeichen.');
	if (body.length < 3 || body.length > 2000) throw new BroadcastError('Der Text braucht 3 bis 2 000 Zeichen.');
	if (link && (link.length > 500 || !LINK_OK.test(link))) throw new BroadcastError('Link bitte als Seite der Plattform (z. B. /karte) oder mit https:// angeben.');
	const regions = [...new Set(i.regions.map((r) => r.trim()).filter(Boolean))];
	if (!i.all && !regions.length) throw new BroadcastError('Bitte „Ganz Deutschland“ oder mindestens eine Region wählen.');
	if (regions.length > MAX_REGIONS) throw new BroadcastError(`Höchstens ${MAX_REGIONS} Regionen auf einmal.`);
	return { title, body, link, all: i.all, regions: i.all ? [] : regions, push: i.push };
}

/** Prüft Recht und Regionen. Liefert die bereinigte Eingabe. */
export async function checkBroadcast(sql: Sql, userId: string, raw: BroadcastInput): Promise<BroadcastInput> {
	const i = clean(raw);
	const [perms, assignments] = await Promise.all([loadPermissions(sql), loadAssignments(sql, userId)]);
	if (i.all) {
		if (!can(assignments, perms, 'broadcast.send')) throw new BroadcastError('Für Nachrichten an alle fehlt das Recht – nur an deine Regionen möglich.');
		return i;
	}
	const known = await sql`select code from regions where code = any(${i.regions})`;
	if (known.length !== i.regions.length) throw new BroadcastError('Eine der gewählten Regionen gibt es nicht.');
	for (const code of i.regions) {
		if (!can(assignments, perms, 'broadcast.send', { regionPath: await regionPath(sql, code) })) {
			const [r] = await sql`select name from regions where code = ${code}`;
			throw new BroadcastError(`Für „${r?.name ?? code}“ fehlt dir das Recht.`);
		}
	}
	return i;
}

export async function sendBroadcast(sql: Sql, userId: string, raw: BroadcastInput): Promise<{ id: string; recipients: number }> {
	const i = await checkBroadcast(sql, userId, raw);
	const [{ n }] = await sql`select count(*)::int as n from broadcasts where created_by = ${userId} and created_at > now() - interval '1 day'`;
	if (n >= 10) throw new BroadcastError('Heute schon 10 Rundnachrichten verschickt – bitte morgen weiter.');
	const id = await sql.begin(async (tx) => {
		const t = tx as unknown as Sql;
		const [b] = await t`insert into broadcasts (title, body, link, all_members, regions, push, created_by)
			values (${i.title}, ${i.body}, ${i.link}, ${i.all}, ${i.regions}, ${i.push}, ${userId}) returning id`;
		const bid = b.id as string;
		const ins = await t`insert into broadcast_recipients (broadcast_id, user_id) select ${bid}, x.id from (${recipientsQuery(t, i.all, i.regions)}) x returning user_id`;
		await t`insert into notifications (user_id, kind, text, link)
			select user_id, 'rundnachricht', ${('Vom Team: ' + i.title).slice(0, 300)}, ${'/rundnachricht/' + bid} from broadcast_recipients where broadcast_id = ${bid}`;
		await t`update broadcasts set recipients = ${ins.length} where id = ${bid}`;
		return bid;
	});
	const [{ recipients }] = await sql`select recipients from broadcasts where id = ${id}`;
	await audit(sql, { actorId: userId, action: 'broadcast.sent', targetType: 'broadcast', targetId: id, meta: { all: i.all, regions: i.regions.join(','), recipients, push: i.push } });
	if (i.push) void pushBroadcast(sql, id, i.title).catch((e) => console.error('[rundnachricht] Push:', (e as Error).message));
	return { id, recipients: recipients as number };
}

/** Push nur an Empfänger mit „Wichtiges sofort“ (push_urgent) und angemeldetem Gerät; Ruhezeiten gelten. */
export async function pushBroadcast(sql: Sql, id: string, title: string): Promise<number> {
	const { pushNotice } = await import('./push');
	const rows = await sql`select r.user_id from broadcast_recipients r join notification_settings s on s.user_id = r.user_id and s.push_urgent
		where r.broadcast_id = ${id} and exists(select 1 from push_subscriptions ps where ps.user_id = r.user_id)`;
	for (const r of rows) await pushNotice(sql, r.user_id as string, `/rundnachricht/${id}`, { kind: 'wichtig', body: `Vom Team: ${title}`.slice(0, 120) });
	return rows.length;
}

export async function listBroadcasts(sql: Sql, limit = 50) {
	const rows = await sql`select b.id, b.title, b.all_members, b.regions, b.push, b.recipients, b.created_at,
			(select count(*)::int from broadcast_recipients r where r.broadcast_id = b.id and r.read_at is not null) as opened,
			(select string_agg(name, ', ' order by name) from regions where code = any(b.regions)) as region_names,
			p.contact_id
		from broadcasts b left join user_profiles p on p.user_id = b.created_by order by b.created_at desc limit ${limit}`;
	return rows.map((r) => ({
		id: r.id as string,
		title: r.title as string,
		target: r.all_members ? 'Ganz Deutschland' : ((r.region_names as string) ?? (r.regions as string[]).join(', ')),
		push: r.push as boolean,
		recipients: r.recipients as number,
		opened: r.opened as number,
		createdAt: r.created_at as Date,
		by: r.contact_id ? `${String(r.contact_id).slice(0, 3)}-${String(r.contact_id).slice(3, 6)}-${String(r.contact_id).slice(6)}` : '–'
	}));
}

/** Eine Rundnachricht lesen: nur Empfänger (dann als gelesen markiert) oder wer Rundnachrichten schicken darf. */
export async function readBroadcast(sql: Sql, userId: string, id: string) {
	const [b] = await sql`select id, title, body, link, all_members, created_at from broadcasts where id = ${id}`;
	if (!b) return null;
	const [r] = await sql`update broadcast_recipients set read_at = coalesce(read_at, now()) where broadcast_id = ${id} and user_id = ${userId} returning 1 as x`;
	if (!r && !(await broadcastRights(sql, userId)).any) return null;
	return { id: b.id as string, title: b.title as string, body: b.body as string, link: b.link as string | null, createdAt: b.created_at as Date };
}
