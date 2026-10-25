import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { rateLimit } from '$lib/server/ratelimit';
import { cleanText } from '$lib/server/validate';
import { PostError } from '$lib/server/community/posts';
import { report } from '$lib/server/community/moderation';
import { isUuid } from '$lib/server/angebote/common';
import { cancelEvent, getEvent, removeEvent, restoreOccurrence, setAttendance, whoComes } from '$lib/server/angebote/events';
import { WEATHER_STATUS, setWeatherStatus, terminWetter } from '$lib/server/angebote/wetter';
import { ATTRIBUTION as DWD_ATTRIBUTION } from '$lib/server/warnings/store';
import { REGEN_ATTRIBUTION } from '$lib/server/regen';
import { REMINDERS, isSaved, setReminder, toggleSaved } from '$lib/server/angebote/saved';
import { tileState } from '$lib/server/import/tiles';
import { eventChat, eventChatTicket } from '$lib/server/angebote/eventchat';
import { chatEnabled, ChatError } from '$lib/server/chat/synapse';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async ({ params, url, locals }) => {
	if (!isUuid(params.id)) error(404, 'Diesen Termin gibt es nicht.');
	const sql = db();
	const viewer = locals.user && locals.session?.mfaVerified ? locals.user.id : null;
	const token = url.searchParams.get('t');
	const d = await getEvent(sql, { id: viewer }, params.id, token);
	if (!d) error(404, 'Diesen Termin gibt es nicht (mehr) oder er ist nicht für dich sichtbar.');
	if (d.needsLogin) redirect(303, `/anmelden?weiter=${encodeURIComponent(url.pathname + url.search)}`);
	const am = url.searchParams.get('am');
	const upcoming = d.occurrences.filter((o) => (o.end ?? o.start).getTime() >= Date.now() - 3600_000);
	const sel = (am && DAY.test(am) ? d.occurrences.find((o) => o.date === am) : null) ?? upcoming[0] ?? d.occurrences.at(-1) ?? null;
	const occurrence = sel?.date ?? null;
	const [saved, who, tiles, chatRoom] = await Promise.all([
		viewer ? isSaved(sql, viewer, 'event', params.id, d.event.rrule ? occurrence : null) : null,
		viewer && occurrence ? whoComes(sql, viewer, params.id, occurrence) : [],
		d.event.lat !== null ? tileState(sql).catch(() => null) : null,
		viewer && occurrence && chatEnabled() ? eventChat(sql, params.id, occurrence) : null
	]);
	// F-056: Wetterwarnung zur Terminzeit (DWD ab Stufe 2) und Entscheidung des Veranstalters
	const wetter =
		sel && !sel.cancelled && d.event.status === 'aktiv' ? await terminWetter(sql, params.id, sel.date, sel.start, sel.end, d.event.allDay).catch(() => null) : null;
	return {
		...d,
		wetter: wetter ? { ...wetter, attribution: DWD_ATTRIBUTION, regenAttribution: REGEN_ATTRIBUTION, options: WEATHER_STATUS } : null,
		occurrences: d.occurrences.map((o) => ({ date: o.date, start: o.start.toISOString(), end: o.end?.toISOString() ?? null, cancelled: o.cancelled })),
		selected: sel ? { date: sel.date, start: sel.start.toISOString(), end: sel.end?.toISOString() ?? null, cancelled: sel.cancelled || d.event.status === 'abgesagt' } : null,
		saved: saved ? { remindAt: saved.remindAt?.toISOString() ?? null } : null,
		who,
		member: !!viewer,
		reminders: REMINDERS,
		tiles: !!tiles?.present,
		token: token ?? null,
		chat: chatEnabled() ? { roomId: chatRoom } : null
	};
};

async function guarded<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

function occ(f: FormData): string | null {
	const v = String(f.get('am') ?? '');
	return DAY.test(v) ? v : null;
}

export const actions: Actions = {
	merken: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return guarded(async () => ({ saved: await toggleSaved(db(), user.id, 'event', event.params.id, f.get('serie') === '1' ? occ(f) : null) }));
	},
	erinnern: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return guarded(async () => {
			const at = await setReminder(db(), user.id, 'event', event.params.id, f.get('serie') === '1' ? occ(f) : null, String(f.get('offset') ?? ''), f.get('base') === 'frist' ? 'frist' : 'beginn');
			return { reminded: at ? at.toISOString() : null };
		});
	},
	teilnahme: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const s = String(f.get('status') ?? '');
		const o = occ(f);
		if (!o) return fail(400, { error: 'Bitte einen Tag wählen.' });
		return guarded(async () => {
			await setAttendance(db(), user.id, event.params.id, o, s === 'interessiert' || s === 'komme_mit' ? s : null, f.get('show_me') === 'on');
			return { attendance: true };
		});
	},
	chat: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const o = occ(f);
		if (!o) return fail(400, { error: 'Ungültiges Datum.' });
		try {
			return { chatRoom: await eventChatTicket(db(), user.id, event.params.id, o) };
		} catch (e) {
			if (e instanceof PostError || e instanceof ChatError) return fail(400, { error: e.message });
			throw e;
		}
	},
	melden: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		if (!rateLimit(`melden:${user.id}`, 30, 24 * 3600 * 1000)) return fail(429, { error: 'Heute schon viele Meldungen.' });
		const f = await event.request.formData();
		return guarded(async () => {
			await report(db(), user.id, 'event', event.params.id, String(f.get('reason') ?? ''), cleanText(f.get('message'), 500) || null);
			return { reported: true };
		});
	},
	absagen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		return guarded(async () => {
			await cancelEvent(db(), user.id, event.params.id, f.get('scope') === 'tag' ? occ(f) : null, cleanText(f.get('note'), 300) ?? '');
			return { cancelled: true };
		});
	},
	wetter: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const o = occ(f);
		if (!o) return fail(400, { error: 'Ungültiges Datum.' });
		const st = String(f.get('status') ?? '');
		return guarded(async () => {
			await setWeatherStatus(db(), user.id, event.params.id, o, st === 'findet_statt' || st === 'drinnen' ? st : null, cleanText(f.get('note'), 200) ?? '');
			return { weather: st === 'findet_statt' || st === 'drinnen' ? 'gesetzt' : 'zurueck' };
		});
	},
	wiederherstellen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		const o = occ(f);
		if (!o) return fail(400, { error: 'Ungültiges Datum.' });
		return guarded(async () => {
			await restoreOccurrence(db(), user.id, event.params.id, o);
			return { restored: true };
		});
	},
	entfernen: async (event) => {
		const user = requireMember(event);
		if (!isUuid(event.params.id)) error(404);
		const f = await event.request.formData();
		if (f.get('sicher') !== 'on') return fail(400, { error: 'Bitte bestätigen.' });
		const r = await guarded(async () => {
			await removeEvent(db(), user.id, event.params.id);
			return null;
		});
		if (r) return r;
		redirect(303, '/veranstaltungen?entfernt=1');
	}
};
