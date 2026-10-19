import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { getSettings, saveSettings } from '$lib/server/push';

const toMin = (v: FormDataEntryValue | null): number | null => {
	const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v ?? ''));
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromMin = (n: number | null) => (n === null ? '' : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`);

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const s = await getSettings(db(), user.id);
	const devices = await db()`select device_label, created_at, last_used_at from push_subscriptions where user_id = ${user.id} order by created_at desc`;
	return {
		s: { ...s, quietFrom: fromMin(s.quiet_from), quietTo: fromMin(s.quiet_to) },
		devices: devices.map((d) => ({ label: (d.device_label as string) ?? 'Gerät', since: new Date(d.created_at).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) }))
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const quiet = f.get('quiet') === 'on';
		const from = quiet ? toMin(f.get('quiet_from')) : null;
		const to = quiet ? toMin(f.get('quiet_to')) : null;
		if (quiet && (from === null || to === null || from === to)) return fail(400, { error: 'Bitte Beginn und Ende der Ruhezeit angeben (unterschiedliche Uhrzeiten).' });
		await saveSettings(db(), user.id, {
			push_chat: f.get('push_chat') === 'on',
			push_community: f.get('push_community') === 'on',
			quiet_from: from,
			quiet_to: to,
			read_receipts: f.get('read_receipts') === 'on',
			typing: f.get('typing') === 'on'
		});
		return { ok: 'Gespeichert.' };
	}
};
