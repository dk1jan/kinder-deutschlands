export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanText(v: FormDataEntryValue | null, max: number): string | null {
	const s = String(v ?? '').trim().replace(/\s+\n/g, '\n').slice(0, max);
	return s.length ? s : null;
}
