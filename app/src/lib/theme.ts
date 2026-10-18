/** Wendet das Farbschema sofort an (ohne Neuladen). Der Server liefert es beim nächsten Aufruf bereits richtig aus. */
export function applyTheme(theme: string) {
	const root = document.documentElement;
	if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
	else root.removeAttribute('data-theme');
}
