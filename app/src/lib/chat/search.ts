// Suche im Chat (M02): nur in den Nachrichten, die dieses Gerät schon entschlüsselt geladen hat.
// Nichts wird an den Server geschickt – der kennt die Inhalte nicht (Ende-zu-Ende-Verschlüsselung).

/** Durchsuchbarer Text einer Nachricht (Text, Hinweis, Dateiname). Standort, Umfragen usw. bleiben außen vor. */
export function searchableText(content: Record<string, unknown> | undefined | null): string {
	if (!content) return '';
	const t = content.msgtype;
	if (t === 'm.text' || t === 'm.notice' || t === 'm.emote' || t === 'm.file' || t === 'm.image' || t === 'm.audio' || t === 'm.video')
		return typeof content.body === 'string' ? content.body : '';
	return '';
}

const fold = (s: string) => s.toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

export function matches(text: string, q: string): boolean {
	const n = fold(q.trim());
	return n.length >= 2 && fold(text).includes(n);
}

/** Ausschnitt um den ersten Treffer, aufgeteilt in Teile [vorher, Treffer, nachher] – zum Hervorheben ohne HTML. */
export function snippet(text: string, q: string, radius = 50): [string, string, string] | null {
	const n = fold(q.trim());
	if (n.length < 2) return null;
	const f = fold(text);
	// fold() kann die Länge ändern (ß → ss); Position deshalb über gefaltete Präfixe auf das Original abbilden
	const at = f.indexOf(n);
	if (at < 0) return null;
	let start = 0;
	while (start < text.length && fold(text.slice(0, start + 1)).length <= at) start++;
	let end = start;
	while (end < text.length && fold(text.slice(start, end)).length < n.length) end++;
	const from = Math.max(0, start - radius);
	const to = Math.min(text.length, end + radius);
	return [(from > 0 ? '…' : '') + text.slice(from, start), text.slice(start, end), text.slice(end, to) + (to < text.length ? '…' : '')];
}
