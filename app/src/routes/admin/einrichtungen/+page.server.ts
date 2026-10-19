import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { requireAction } from '$lib/server/guard';
import { PostError } from '$lib/server/community/posts';
import { cleanText } from '$lib/server/validate';
import { decideOrg, setOrgStatus } from '$lib/server/angebote/orgs';
import { isUuid } from '$lib/server/angebote/common';

export const load: PageServerLoad = async (event) => {
	await requireAction(event, 'orgs.verify');
	const sql = db();
	const rows = await sql`select o.id, o.slug, o.name, o.kind, o.status, o.website, o.email, o.phone, o.address, o.application, o.decision_note, o.created_at, o.verified_at,
			r.name as region_name, p.display_name as applicant_name, p.contact_id as applicant_cid, u.email as applicant_email,
			(select count(*)::int from org_members m where m.org_id = o.id) as members
		from organizations o left join regions r on r.code = o.region_code
			left join user_profiles p on p.user_id = o.created_by left join users u on u.id = o.created_by
		order by case o.status when 'beantragt' then 0 when 'pausiert' then 1 when 'verifiziert' then 2 else 3 end, o.created_at desc limit 300`;
	return {
		orgs: rows.map((o) => ({
			id: o.id as string, slug: o.slug as string, name: o.name as string, kind: o.kind as string, status: o.status as string,
			website: o.website as string | null, email: o.email as string | null, phone: o.phone as string | null, address: o.address as string | null, regionName: o.region_name as string | null,
			role: (o.application?.role as string | undefined) ?? null, proof: o.status === 'beantragt' ? ((o.application?.proof as string | undefined) ?? null) : null,
			applicant: o.status === 'beantragt' ? { name: o.applicant_name as string | null, cid: o.applicant_cid as string | null, email: o.applicant_email as string | null } : null,
			note: o.decision_note as string | null, created: o.created_at as Date, verified: o.verified_at as Date | null, members: o.members as number
		}))
	};
};

async function run(fn: () => Promise<void>, ok: string) {
	try {
		await fn();
		return { ok };
	} catch (e) {
		if (e instanceof PostError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	entscheiden: async (event) => {
		const user = await requireAction(event, 'orgs.verify');
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		const approve = f.get('decision') === 'ja';
		return run(() => decideOrg(db(), user.id, id, approve, cleanText(f.get('note'), 500) ?? ''), approve ? 'Verifiziert.' : 'Abgelehnt.');
	},
	status: async (event) => {
		const user = await requireAction(event, 'orgs.verify');
		const f = await event.request.formData();
		const id = String(f.get('id') ?? '');
		if (!isUuid(id)) return fail(400, { error: 'Ungültig.' });
		const st = f.get('status') === 'pausiert' ? 'pausiert' : 'verifiziert';
		return run(() => setOrgStatus(db(), user.id, id, st, cleanText(f.get('note'), 500) ?? ''), st === 'pausiert' ? 'Pausiert.' : 'Wieder aktiv.');
	}
};
