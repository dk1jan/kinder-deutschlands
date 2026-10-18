import { describe, expect, it } from 'vitest';
import { renderMarkup, excerpt, firstUrl } from '../src/lib/markup';
import { checkText, holdMessage } from '../src/lib/server/community/automod';
import { checkUrl, isPrivateAddress, parseMeta, providerOf, LinkError } from '../src/lib/server/community/linkcard';
import { cleanTags } from '../src/lib/server/community/posts';
import { parseSources, slugify } from '../src/lib/server/community/knowledge';

describe('Formatierung ist sicher', () => {
	it('kein HTML, keine Skripte, keine Event-Handler', () => {
		const h = renderMarkup('<script>alert(1)</script> <img src=x onerror=alert(1)> **fett**');
		expect(h).not.toMatch(/<script|<img/);
		// „onerror“ darf nur als maskierter Text vorkommen, nie als Attribut eines echten Tags
		expect(h.replace(/<[^>]+>/g, (t) => (/onerror/i.test(t) ? 'TAG_MIT_HANDLER' : ''))).not.toContain('TAG_MIT_HANDLER');
		expect(h).toContain('&lt;script&gt;');
		expect(h).toContain('<strong>fett</strong>');
	});
	it('nur http/https-Links, mit nofollow/noopener', () => {
		expect(renderMarkup('[klick](javascript:alert(1))')).not.toContain('href="javascript');
		const h = renderMarkup('Siehe https://example.org/a?b=1&c=2.');
		expect(h).toContain('href="https://example.org/a?b=1&amp;c=2"');
		expect(h).toContain('rel="nofollow ugc noopener noreferrer"');
		expect(h).toMatch(/<\/a>\.<\/p>$/);
		expect(renderMarkup('[Text](https://x.de/"onmouseover="a)')).not.toContain('onmouseover="a');
	});
	it('Listen, Zitate, Absätze, kursiv', () => {
		const h = renderMarkup('Hallo\n\n- eins\n- zwei\n\n> Zitat\n\n1. a\n2. b\n\n*kursiv*');
		expect(h).toContain('<ul><li>eins</li><li>zwei</li></ul>');
		expect(h).toContain('<blockquote>Zitat</blockquote>');
		expect(h).toContain('<ol><li>a</li><li>b</li></ol>');
		expect(h).toContain('<em>kursiv</em>');
	});
	it('Auszug und erster Link', () => {
		expect(excerpt('**Fett** und [Link](https://a.de) '.repeat(20), 40).length).toBeLessThanOrEqual(42);
		expect(firstUrl('schau https://youtu.be/abc123def, toll')).toBe('https://youtu.be/abc123def');
		expect(firstUrl('nichts')).toBeNull();
	});
});

describe('Automatische Vormarkierung', () => {
	it('private Daten werden zurückgehalten', () => {
		for (const t of ['Ruf mich an: 0421 1234567', 'Meine Nummer +49 151 23456789', 'schreib an mama@example.org', 'IBAN DE89 3704 0044 0532 0130 00']) {
			const f = checkText(t);
			expect(f.some((x) => x.reason === 'private_daten' && x.hold), t).toBe(true);
			expect(holdMessage(f)).toMatch(/Familien-ID/);
		}
	});
	it('Jahreszahlen und Uhrzeiten sind keine Telefonnummern', () => {
		expect(checkText('Seit 2019 in Bremen, Treffen um 10:30, Kind ist 3').length).toBe(0);
	});
	it('Drohung → Priorität 1 und Zurückhalten; Beleidigung nur markieren', () => {
		const d = checkText('Ich weiß wo du wohnst');
		expect(d[0]).toMatchObject({ reason: 'drohung', priority: 1, hold: true });
		const b = checkText('Du bist so ein Arschloch');
		expect(b[0]).toMatchObject({ reason: 'beleidigung', hold: false });
		expect(checkText('Du A r s c h').length).toBe(0); // bewusst keine Übermarkierung
	});
	it('Betrug, Spam, problematische Links', () => {
		expect(checkText('Nur gegen Vorkasse per Paysafe').some((f) => f.reason === 'betrugsverdacht')).toBe(true);
		expect(checkText('https://bit.ly/abc').some((f) => f.reason === 'problematischer_link')).toBe(true);
		expect(checkText('a https://a.de b https://b.de c https://c.de d https://d.de e https://e.de').some((f) => f.reason === 'spam')).toBe(true);
		expect(checkText('Ganz normale Frage zur Kita-Eingewöhnung in Findorff?').length).toBe(0);
	});
});

describe('Linkkarten: Schutz vor Missbrauch (SSRF)', () => {
	it('interne Adressen werden erkannt', () => {
		for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '100.64.0.1'])
			expect(isPrivateAddress(ip), ip).toBe(true);
		for (const ip of ['8.8.8.8', '1.1.1.1', '2a00:1450:4001:80b::200e']) expect(isPrivateAddress(ip), ip).toBe(false);
	});
	it('nur öffentliche http(s)-Adressen auf Standardports', () => {
		for (const u of ['file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://intranet/', 'http://x.local/', 'http://a.de:8080/', 'http://user:pw@a.de/', 'gopher://a.de/'])
			expect(() => checkUrl(u), u).toThrow(LinkError);
		expect(checkUrl('https://www.youtube.com/watch?v=abc').hostname).toBe('www.youtube.com');
	});
	it('Metadaten aus HTML', () => {
		const m = parseMeta('<html><head><title>Fallback</title><meta property="og:title" content="Echter &amp; Titel"><meta name="description" content="Beschreibung"><meta property="og:image" content="/bild.jpg"></head></html>', 'https://a.de/x');
		expect(m).toMatchObject({ title: 'Echter & Titel', description: 'Beschreibung', image: 'https://a.de/bild.jpg' });
	});
	it('Anbieter und Einbettung', () => {
		expect(providerOf(new URL('https://youtu.be/dQw4w9WgXcQ'))).toEqual({ provider: 'youtube', embed: { type: 'youtube', id: 'dQw4w9WgXcQ' } });
		expect(providerOf(new URL('https://www.youtube.com/shorts/abcDEF12345')).embed?.id).toBe('abcDEF12345');
		expect(providerOf(new URL('https://vimeo.com/123456')).embed).toEqual({ type: 'vimeo', id: '123456' });
		expect(providerOf(new URL('https://www.instagram.com/p/xyz/'))).toEqual({ provider: 'instagram', embed: null });
		expect(providerOf(new URL('https://www.youtube.com/watch?v=<script>')).embed).toBeNull();
	});
});

describe('Hilfsfunktionen', () => {
	it('Schlagworte', () => {
		expect(cleanTags('#Kita, eingewöhnung  Krippe,, x, <b>')).toEqual(['kita', 'eingewöhnung', 'krippe']);
	});
	it('Quellen und Kurznamen für Wissen', () => {
		expect(parseSources('Familienportal https://familienportal.de/a\nkaputt\njavascript:alert(1)\nhttps://bmfsfj.de')).toEqual([
			{ title: 'Familienportal', url: 'https://familienportal.de/a' },
			{ title: 'bmfsfj.de', url: 'https://bmfsfj.de/' }
		]);
		expect(slugify('Kita-Platz in Bremen: Wie & wann?')).toBe('kita-platz-in-bremen-wie-wann');
		expect(slugify('Größe für Übergänge')).toBe('groesse-fuer-uebergaenge');
	});
});
