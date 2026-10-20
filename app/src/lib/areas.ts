// Bereiche der Plattform (F-001): eine Liste für „Mehr“ in der Navigation und die Kacheln auf „Entdecken“.
export interface Area {
	href: string;
	label: string;
	text: string;
	icon: string;
	color: string;
	ink: string;
	members?: boolean;
}

export const AREAS: Area[] = [
	{ href: '/veranstaltungen/heute', label: 'Was machen wir heute?', text: 'Termine und Orte für heute', icon: 'uhr', color: '#ffc53d', ink: '#0f2238' },
	{ href: '/veranstaltungen', label: 'Veranstaltungen', text: 'Liste, Kalender, Karte', icon: 'ausflug', color: '#d63d31', ink: '#ffffff' },
	{ href: '/marktplatz', label: 'Marktplatz', text: 'Kinderwagen, Kleidung, Spielzeug', icon: 'flagge', color: '#2f7d4f', ink: '#ffffff', members: true },
	{ href: '/hilfe', label: 'Familien helfen Familien', text: 'Hilfe suchen oder anbieten', icon: 'gruppe', color: '#1a5c9a', ink: '#ffffff', members: true },
	{ href: '/radar', label: 'Familienradar', text: 'Neues für deine Region', icon: 'glocke', color: '#0f2238', ink: '#ffc53d', members: true },
	{ href: '/routen', label: 'Kinderwagenrouten', text: 'Spazierwege mit Untergrund und Treppen', icon: 'route', color: '#1f7468', ink: '#ffffff' },
	{ href: '/hinweise', label: 'Hinweise & Fristen', text: 'Absagen, Sperrungen, Leistungen', icon: 'hinweis', color: '#f0c060', ink: '#0f2238' },
	{ href: '/angebote', label: 'Freie Plätze & Kurse', text: 'mit Stand und Gültigkeit', icon: 'liste', color: '#a9d4ec', ink: '#0f2238' },
	{ href: '/einrichtungen', label: 'Einrichtungen', text: 'verifizierte Partner', icon: 'schild', color: '#7b4fa3', ink: '#ffffff' },
	{ href: '/kompass', label: 'Lebenslagen-Kompass', text: 'Geburt, Kita, Trennung, Geld knapp', icon: 'entdecken', color: '#e6eef4', ink: '#0f2238' },
	{ href: '/einladungen', label: 'Einladungen', text: 'Kindergeburtstag mit Zu- und Absagen', icon: 'senden', color: '#ffc53d', ink: '#0f2238', members: true },
	{ href: '/nachrichten/treffen/neu', label: 'Treffen per QR', text: 'Spontan treffen, Raum läuft ab', icon: 'qr', color: '#d63d31', ink: '#ffffff', members: true }
];

/** Gehört dieser Pfad zu einem Bereich aus „Mehr“? (für die Markierung in der Navigation) */
export function inArea(path: string): boolean {
	return path === '/mehr' || AREAS.some((a) => path === a.href || path.startsWith(a.href + '/'));
}
