// Formulare → Eingaben für Marktplatz, Hilfe, Einladungen.
import { PostError } from '../community/posts';
import { localToDate } from '../angebote/forms';
import { isUuid } from '../angebote/common';
import type { ListingInput } from './market';
import type { HelpInput } from './help';
import type { InvitationInput } from './invitations';

const str = (f: FormData, k: string, max = 8000) => String(f.get(k) ?? '').trim().slice(0, max);
const opt = (f: FormData, k: string, max = 500) => str(f, k, max) || null;
const int = (f: FormData, k: string, min: number, max: number): number | null => {
	const v = str(f, k, 10);
	if (!v) return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n < min || n > max) throw new PostError(`Zahl zwischen ${min} und ${max} angeben.`);
	return n;
};

/** „12“, „12,50“, „12.50 €“ → Cent. Leer → null. */
export function parseEuro(v: string): number | null {
	const t = v.replace(/€|eur|\s/gi, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
	if (!t) return null;
	if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) throw new PostError('Preis bitte als Zahl angeben, z. B. 25 oder 12,50.');
	return Math.round(Number(t) * 100);
}

export function listingFromForm(f: FormData): ListingInput {
	return {
		kind: str(f, 'kind', 20),
		category: str(f, 'category', 30),
		title: str(f, 'title', 140),
		description: str(f, 'description', 4000),
		priceCents: parseEuro(str(f, 'price', 20)),
		negotiable: f.get('negotiable') === 'on',
		condition: opt(f, 'condition', 20),
		sizeText: opt(f, 'size', 60),
		ageMin: int(f, 'age_min', 0, 18),
		ageMax: int(f, 'age_max', 0, 18),
		regionCode: opt(f, 'region_code', 30),
		safetyAck: f.get('safety_ack') === 'on',
		privateSeller: f.get('private') === 'on'
	};
}

export async function imagesFromForm(f: FormData, field = 'images') {
	const out: { data: Buffer; alt: string | null }[] = [];
	const files = f.getAll(field).filter((x): x is File => x instanceof File && x.size > 0);
	if (files.length && f.get('no_people') !== 'on') throw new PostError('Bitte bestätigen, dass auf den Fotos keine Personen (auch keine Kinder) erkennbar sind.');
	for (const file of files) {
		if (file.size > 12 * 1024 * 1024) throw new PostError('Ein Bild ist zu groß (höchstens 12 MB).');
		out.push({ data: Buffer.from(await file.arrayBuffer()), alt: null });
	}
	return out;
}

export function helpFromForm(f: FormData): HelpInput {
	return { kind: str(f, 'kind', 20), category: str(f, 'category', 30), title: str(f, 'title', 140), body: str(f, 'body', 3000), regionCode: opt(f, 'region_code', 30) };
}

export function invitationFromForm(f: FormData): InvitationInput {
	const start = localToDate(str(f, 'start', 20));
	if (!start) throw new PostError('Bitte Beginn angeben.');
	const end = str(f, 'end', 20) ? localToDate(str(f, 'end', 20)) : null;
	const until = str(f, 'rsvp_until', 10) ? localToDate(`${str(f, 'rsvp_until', 10)}T23:59`) : null;
	const placeId = str(f, 'place_id', 40);
	return {
		title: str(f, 'title', 140),
		message: str(f, 'message', 3000),
		startsAt: start,
		endsAt: end,
		placeText: opt(f, 'place_text', 300),
		addressAfterRsvp: f.get('address_after_rsvp') === 'on',
		placeId: isUuid(placeId) ? placeId : null,
		rsvpUntil: until,
		maxGuests: int(f, 'max_guests', 1, 200),
		guestsSeeList: f.get('guests_see_list') === 'on'
	};
}
