// Einfache, sichere Textformatierung für Beiträge (Server und Browser gleich).
// Erlaubt: **fett**, *kursiv*, Listen (- / 1.), Zitate (>), Absätze, Links (nur http/https, automatisch erkannt oder [Text](URL)).
// Kein HTML, keine Bilder, keine Skripte – alles andere wird als Text angezeigt.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function safeUrl(u: string): string | null {
	try {
		const p = new URL(u);
		return p.protocol === 'http:' || p.protocol === 'https:' ? p.toString() : null;
	} catch {
		return null;
	}
}

const LINK_ATTR = 'rel="nofollow ugc noopener noreferrer" target="_blank"';

function inline(raw: string): string {
	// Platzhalter für Links, damit Formatierung die URLs nicht zerlegt
	const links: string[] = [];
	let s = raw.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/g, (_, text: string, url: string) => {
		const u = safeUrl(url);
		if (!u) return _;
		links.push(`<a href="${esc(u)}" ${LINK_ATTR}>${esc(text)}</a>`);
		return `\u0000${links.length - 1}\u0000`;
	});
	s = s.replace(/https?:\/\/[^\s<>"]{2,2000}/g, (m) => {
		const trail = /[.,;:!?)]+$/.exec(m)?.[0] ?? '';
		const url = trail ? m.slice(0, -trail.length) : m;
		const u = safeUrl(url);
		if (!u) return m;
		const shown = url.replace(/^https?:\/\//, '').slice(0, 60) + (url.length > 68 ? '…' : '');
		links.push(`<a href="${esc(u)}" ${LINK_ATTR}>${esc(shown)}</a>`);
		return `\u0000${links.length - 1}\u0000${trail}`;
	});
	s = esc(s)
		.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
	return s.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

export function renderMarkup(text: string): string {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	let para: string[] = [];
	let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
	let quote: string[] = [];
	const flushPara = () => {
		if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
		list = null;
	};
	const flushQuote = () => {
		if (quote.length) out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
		quote = [];
	};
	for (const line of lines) {
		const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
		const ol = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line);
		const q = /^\s*>\s?(.*)$/.exec(line);
		if (ul || ol) {
			flushPara();
			flushQuote();
			const type = ul ? 'ul' : 'ol';
			if (!list || list.type !== type) {
				flushList();
				list = { type, items: [] };
			}
			list.items.push((ul ?? ol)![1]);
		} else if (q) {
			flushPara();
			flushList();
			quote.push(q[1]);
		} else if (!line.trim()) {
			flushPara();
			flushList();
			flushQuote();
		} else {
			flushList();
			flushQuote();
			para.push(line);
		}
	}
	flushPara();
	flushList();
	flushQuote();
	return out.join('\n');
}

/** Klartext-Auszug für Listen (ohne Formatierungszeichen). */
export function excerpt(text: string, max = 180): string {
	const t = text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*>#]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …' : t;
}

export function firstUrl(text: string): string | null {
	const m = /https?:\/\/[^\s<>"\])]{2,2000}/.exec(text);
	return m ? safeUrl(m[0].replace(/[.,;:!?]+$/, '')) : null;
}
