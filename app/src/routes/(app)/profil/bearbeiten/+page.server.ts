import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireMember } from '$lib/server/guard';
import { ensureProfile, getProfile, updateProfile, checkLandChange } from '$lib/server/profiles';
import { cleanText } from '$lib/server/validate';
import { CHILD_AGES, PRESETS, sanitizeVisibility, type Preset } from '$lib/visibility';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async (event) => {
	const user = requireMember(event);
	const sql = db();
	await ensureProfile(sql, user.id);
	const p = (await getProfile(sql, user.id))!;
	const [region] = p.region_code ? await sql`select name from regions where code = ${p.region_code}` : [];
	return {
		profile: {
			displayName: p.display_name ?? '',
			canHelp: p.can_help ?? '',
			lookingFor: p.looking_for ?? '',
			interests: p.interests.join(', '),
			childAges: p.child_ages,
			regionCode: p.region_code ?? '',
			discoverable: p.discoverable,
			preset: p.privacy_preset,
			visibility: p.visibility,
			regionName: (region?.name as string | undefined) ?? ''
		}
	};
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireMember(event);
		const f = await event.request.formData();
		const sql = db();
		const preset = (['zurueckhaltend', 'offen', 'individuell'].includes(String(f.get('preset'))) ? f.get('preset') : 'zurueckhaltend') as Preset;
		const ages = f.getAll('child_ages').map(String).filter((a) => CHILD_AGES.some((c) => c.key === a));
		const interests = String(f.get('interests') ?? '')
			.split(/[,;\n]/)
			.map((s) => s.trim().slice(0, 40))
			.filter(Boolean)
			.slice(0, 12);
		const regionCode = cleanText(f.get('region_code'), 20);
		if (regionCode) {
			const [r] = await sql`select 1 from regions where code = ${regionCode}`;
			if (!r) return fail(400, { error: 'Unbekannte Region.' });
		}
		// F-023: Bundesland (aus der Wohnregion) höchstens einmal im Monat wechseln – sonst könnte man fremde Landes-Beiträge mitlesen
		const landCheck = await checkLandChange(sql, user.id, regionCode);
		if (landCheck) return fail(400, { error: landCheck });
		const displayName = cleanText(f.get('display_name'), 60);
		if (displayName && /[@]|\d{6,}/.test(displayName)) {
			return fail(400, { error: 'Bitte keine E-Mail-Adresse oder Telefonnummer im Anzeigenamen. Kontakt läuft über die Familien-ID.' });
		}
		const visibility = sanitizeVisibility(
			Object.fromEntries([...f.entries()].filter(([k]) => k.startsWith('vis_')).map(([k, v]) => [k.slice(4), String(v)])),
			PRESETS.zurueckhaltend
		);
		await updateProfile(sql, user.id, {
			displayName,
			canHelp: cleanText(f.get('can_help'), 500),
			lookingFor: cleanText(f.get('looking_for'), 500),
			interests,
			childAges: ages,
			regionCode,
			discoverable: f.get('discoverable') === 'on',
			preset,
			visibility
		});
		await audit(sql, { actorId: user.id, action: 'profile.updated', meta: { preset } });
		redirect(303, '/profil/vorschau?gespeichert=1');
	}
};
