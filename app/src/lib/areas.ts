// Bereiche der Plattform (F-001, F-016): eine Liste für das Menü (Desktop-Aufklapper, Handy-Menü),
// die Seite „Mehr“ und die Übersicht „Was es hier alles gibt“ auf der Startseite.
export type GroupId = 'entdecken' | 'community' | 'wissen';

export interface Area {
	href: string;
	label: string;
	text: string;
	icon: string;
	color: string;
	ink: string;
	group: GroupId;
	members?: boolean;
}

export interface Group {
	id: GroupId;
	label: string;
	/** Ziel beim Klick auf den Gruppennamen. Entdecken = Startseite, Community = Community-Seite (D-073). */
	href: string;
	icon: string;
}

export const GROUPS: Group[] = [
	{ id: 'entdecken', label: 'Entdecken', href: '/', icon: 'entdecken' },
	{ id: 'community', label: 'Community', href: '/community', icon: 'community' },
	{ id: 'wissen', label: 'Wissen', href: '/mehr#wissen', icon: 'hinweis' }
];

export const AREAS: Area[] = [
	{ href: '/veranstaltungen/heute', label: 'Was machen wir heute?', text: 'Termine und Orte für heute', icon: 'uhr', color: '#ffc53d', ink: '#0f2238', group: 'entdecken' },
	{ href: '/veranstaltungen', label: 'Veranstaltungen', text: 'Liste, Kalender, Karte', icon: 'ausflug', color: '#d63d31', ink: '#ffffff', group: 'entdecken' },
	{ href: '/routen', label: 'Kinderwagenrouten', text: 'Spazierwege mit Untergrund und Treppen', icon: 'route', color: '#1f7468', ink: '#ffffff', group: 'entdecken' },
	{ href: '/angebote', label: 'Freie Plätze & Kurse', text: 'mit Stand und Gültigkeit', icon: 'liste', color: '#a9d4ec', ink: '#0f2238', group: 'entdecken' },
	{ href: '/einrichtungen', label: 'Einrichtungen', text: 'verifizierte Partner', icon: 'schild', color: '#7b4fa3', ink: '#ffffff', group: 'entdecken' },
	{ href: '/hilfe', label: 'Familien helfen Familien', text: 'Hilfe suchen oder anbieten', icon: 'gruppe', color: '#1a5c9a', ink: '#ffffff', group: 'community', members: true },
	{ href: '/marktplatz', label: 'Marktplatz', text: 'Kinderwagen, Kleidung, Spielzeug', icon: 'flagge', color: '#2f7d4f', ink: '#ffffff', group: 'community', members: true },
	{ href: '/einladungen', label: 'Einladungen', text: 'Kindergeburtstag mit Zu- und Absagen', icon: 'senden', color: '#ffc53d', ink: '#0f2238', group: 'community', members: true },
	{ href: '/nachrichten/treffen/neu', label: 'Treffen per QR', text: 'Spontan treffen, Raum läuft ab', icon: 'qr', color: '#d63d31', ink: '#ffffff', group: 'community', members: true },
	{ href: '/warnungen', label: 'Wetter und Warnungen', text: 'Regen, Unwetter vom DWD, Push für deine Region', icon: 'warnung', color: '#d63d31', ink: '#ffffff', group: 'wissen' },
	{ href: '/hinweise', label: 'Hinweise & Fristen', text: 'Absagen, Sperrungen, Leistungen', icon: 'hinweis', color: '#f0c060', ink: '#0f2238', group: 'wissen' },
	{ href: '/kompass', label: 'Lebenslagen-Kompass', text: 'Geburt, Kita, Trennung, Geld knapp', icon: 'entdecken', color: '#e6eef4', ink: '#0f2238', group: 'wissen' },
	{ href: '/radar', label: 'Familienradar', text: 'Neues für deine Region', icon: 'glocke', color: '#0f2238', ink: '#ffc53d', group: 'wissen', members: true }
];

export const areasOf = (g: GroupId) => AREAS.filter((a) => a.group === g);

/** Link für Gäste: Mitgliederbereiche führen zur Anmeldung und danach zurück. */
export const areaHref = (a: Area, member: boolean) => (a.members && !member ? `/anmelden?weiter=${encodeURIComponent(a.href)}` : a.href);

const under = (path: string, href: string) => path === href || path.startsWith(href + '/');

/** Zu welcher Gruppe gehört dieser Pfad? (für die Markierung im Menü) */
export function groupOf(path: string): GroupId | null {
	if (path === '/') return 'entdecken';
	if (under(path, '/community')) return 'community';
	// längster Treffer gewinnt (/veranstaltungen/heute vor /veranstaltungen)
	const hit = AREAS.filter((a) => under(path, a.href)).sort((a, b) => b.href.length - a.href.length)[0];
	return hit?.group ?? null;
}

/** Gehört dieser Pfad zu einem Bereich aus dem Menü? */
export function inArea(path: string): boolean {
	return path === '/mehr' || AREAS.some((a) => under(path, a.href));
}
