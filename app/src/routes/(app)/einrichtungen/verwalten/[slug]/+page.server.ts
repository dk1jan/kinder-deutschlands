import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { cleanText } from '$lib/server/validate';
import { addMember, followerBucket, orgMembers, orgRole, removeMember, updateOrg } from '$lib/server/angebote/orgs';
import { VALID_DAYS, confirmAvailability, effectiveAvailability, endOffer, saveOffer } from '$lib/server/angebote/offers';
import { archiveNotice, createNotice } from '$lib/server/angebote/notices';
import { formValues, noticeFromForm, offerFromForm, orgFromForm } from '$lib/server/angebote/forms';
import { isUuid } from '$lib/server/angebote/common';
import { tileState } from '$lib/server/import/tiles';
import type { Availability } from '$lib/angebote';

async function ctx(event: Pick<RequestEvent, 'locals' | 'url' | 'params'>) {
	const user = requireMember(event);
	const sql = db();
	const [o] = await sql`select o.*, ST_Y(o.location) as lat, ST_X(o.location) as lon, r.name as region_name from organizations o left join regions r on r.code = o.region_code where o.slug = ${event.params.slug}`;
	if (!o) error(404, 'Einrichtung nicht gefunden.');
	const role = await orgRole(sql, user.id, o.id);
	if (!role) error(403, 'Du pflegst diese Einrichtung nicht (oder sie ist pausiert).');
	return { user, sql, o, role };
}

export const load: PageServerLoad = async (event) => {
	const { user, sql, o, role } = await ctx(event);
	const tab = ['profil', 'team', 'angebote', 'hinweise', 'termine'].includes(event.url.searchParams.get('tab') ?? '') ? event.url.searchParams.get('tab')! : 'angebote';
	const [members, offers, notices, events, followers, source, tiles] = await Promise.all([
		orgMembers(sql, user.id, o.id),
		sql`select * from offers where org_id = ${o.id} and status in ('aktiv', 'beendet') order by status, title`,
		sql`select id, kind, title, deadline, valid_until, status, created_at from notices where org_id = ${o.id} and status = 'aktiv' order by created_at desc limit 50`,
		sql`select id, title, starts_at, rrule, status, origin from events where org_id = ${o.id} and status not in ('entfernt') and coalesce(series_until, ends_at, starts_at) > now() - interval '1 day' order by starts_at limit 100`,
		sql`select count(*)::int as n from org_followers where org_id = ${o.id}`,
		sql`select key, last_run_at, last_success_at, last_error, paused from data_sources where key = ${`org-ics-${o.slug}`.slice(0, 60)}`,
		tileState(sql).catch(() => null)
	]);
	const editId = event.url.searchParams.get('angebot');
	const edit = editId && isUuid(editId) ? offers.find((x) => x.id === editId) : null;
	return {
		tab,
		role,
		org: { id: o.id as string, slug: o.slug as string, name: o.name as string, status: o.status as string, icsUrl: o.ics_url as string | null },
		orgValues: {
			name: [o.name], kind: [o.kind], description: [o.description ?? ''], topics: o.topics ?? [], address: o.address ? [o.address] : [], region_code: o.region_code ? [o.region_code] : [],
			lat: o.lat !== null ? [String(o.lat)] : [], lon: o.lon !== null ? [String(o.lon)] : [], website: o.website ? [o.website] : [], email: o.email ? [o.email] : [], phone: o.phone ? [o.phone] : []
		} as Record<string, string[]>,
		region: o.region_code ? { code: o.region_code as string, name: o.region_name as string } : null,
		members: members.map((m) => ({ userId: m.user_id as string, role: m.role as string, contactId: m.contact_id as string, name: (m.display_name as string | null) ?? 'Mitglied', me: m.user_id === user.id })),
		offers: offers.map((f) => ({
			id: f.id as string, title: f.title as string, status: f.status as string, kind: f.kind as string,
			availability: effectiveAvailability(f as never), stored: f.availability as string, placesCount: f.places_count as number | null,
			confirmedAt: f.availability_confirmed_at as Date | null, validUntil: f.availability_until as Date | null
		})),
		editOffer: edit
			? ({ id: [edit.id], title: [edit.title], description: [edit.description ?? ''], kind: [edit.kind], topics: edit.topics ?? [], age_min: edit.age_min !== null ? [String(edit.age_min)] : [], age_max: edit.age_max !== null ? [String(edit.age_max)] : [],
				schedule_text: edit.schedule_text ? [edit.schedule_text] : [], starts_on: edit.starts_on ? [new Date(edit.starts_on).toISOString().slice(0, 10)] : [], cost_text: edit.cost_text ? [edit.cost_text] : [],
				freikarte: edit.freikarte ? ['on'] : [], registration_url: edit.registration_url ? [edit.registration_url] : [], contact: edit.contact ? [edit.contact] : [], address: edit.address ? [edit.address] : [] } as Record<string, string[]>)
			: null,
		notices: notices.map((n) => ({ id: n.id as string, kind: n.kind as string, title: n.title as string, deadline: n.deadline as Date | null, validUntil: n.valid_until as Date | null })),
		events: events.map((e) => ({ id: e.id as string, title: e.title as string, start: (e.starts_at as Date).toISOString(), recurring: !!e.rrule, status: e.status as string })),
		followers: followerBucket(followers[0].n as number),
		source: source[0] ? { lastRun: source[0].last_run_at as Date | null, lastOk: source[0].last_success_at as Date | null, error: source[0].last_error as string | null, paused: source[0].paused as boolean } : null,
		validDays: VALID_DAYS,
		tiles: !!tiles?.present
	};
};

async function run<T>(fn: () => Promise<T>, f?: FormData) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message, values: f ? formValues(f) : undefined });
		throw e;
	}
}

export const actions: Actions = {
	profil: async (event) => {
		const { user, sql, o } = await ctx(event);
		const f = await event.request.formData();
		return run(async () => {
			await updateOrg(sql, user.id, o.id, { ...orgFromForm(f), icsUrl: cleanText(f.get('ics_url'), 500) });
			return { ok: 'Profil gespeichert.' };
		}, f);
	},
	mitglied: async (event) => {
		const { user, sql, o } = await ctx(event);
		const f = await event.request.formData();
		return run(async () => {
			await addMember(sql, user.id, o.id, String(f.get('contact_id') ?? ''), f.get('role') === 'admin' ? 'admin' : 'redaktion');
			return { ok: 'Person hinzugefügt.' };
		});
	},
	austragen: async (event) => {
		const { user, sql, o } = await ctx(event);
		const f = await event.request.formData();
		const id = String(f.get('user_id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		return run(async () => {
			await removeMember(sql, user.id, o.id, id);
			return { ok: 'Ausgetragen.' };
		});
	},
	angebot: async (event) => {
		const { user, sql, o } = await ctx(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		return run(async () => {
			await saveOffer(sql, user.id, o.id, isUuid(id) ? id : null, offerFromForm(f));
			return { ok: isUuid(id) ? 'Angebot gespeichert.' : 'Angebot angelegt. Bitte jetzt die Verfügbarkeit bestätigen.' };
		}, f);
	},
	verfuegbarkeit: async (event) => {
		const { user, sql } = await ctx(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		const n = String(f.get('places') ?? '').trim();
		return run(async () => {
			await confirmAvailability(sql, user.id, id, String(f.get('availability')) as Availability, n ? Number(n) : null, Number(f.get('days')));
			return { ok: 'Verfügbarkeit bestätigt.' };
		});
	},
	beenden: async (event) => {
		const { user, sql } = await ctx(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		return run(async () => {
			await endOffer(sql, user.id, id);
			return { ok: 'Angebot beendet.' };
		});
	},
	hinweis: async (event) => {
		const { user, sql, o } = await ctx(event);
		const f = await event.request.formData();
		return run(async () => {
			await createNotice(sql, user.id, { ...noticeFromForm(f), regionCode: noticeFromForm(f).regionCode ?? o.region_code }, { orgId: o.id });
			return { ok: 'Hinweis veröffentlicht.' };
		}, f);
	},
	archivieren: async (event) => {
		const { user, sql } = await ctx(event);
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		return run(async () => {
			await archiveNotice(sql, user.id, id);
			return { ok: 'Hinweis beendet.' };
		});
	}
};
