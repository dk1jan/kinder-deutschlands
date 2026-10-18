// Gemeinsame Anzeigetexte der Community (Browser und Server).
export const GROUP_KIND_UI = {
	offen: { label: 'Offene Gruppe', icon: '○', text: 'Alle Mitglieder können lesen und schreiben.' },
	beitritt: { label: 'Gruppe mit Beitritt', icon: '◐', text: 'Lesen und schreiben nach Beitrittsanfrage.' },
	geschuetzt: { label: 'Geschützte Gruppe', icon: '🔒', text: 'Nur geprüfte Mitglieder, eigener Gruppenname, für andere unsichtbar.' }
} as const;
