<script lang="ts">
	// Schlichte Linien-Symbole, 24×24, Strichstärke 1.75. Immer dekorativ (aria-hidden) – Text steht daneben.
	let { name, size = 24 }: { name: string; size?: number } = $props();
	const paths: Record<string, string> = {
		entdecken: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.6 5.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z',
		karte: 'M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Zm0 0v14m6-12v14',
		community: 'M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm16 4h0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3',
		nachrichten: 'M3.5 6.5h17v11h-17v-11Zm0 0 8.5 6.5 8.5-6.5',
		profil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5',
		hinweis: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 5v.5m0 2.5v5',
		fehler: 'M12 3.5 21 19.5H3L12 3.5Zm0 6v4.5m0 2.5v.5',
		ok: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm-4 8.7 2.8 2.8L16.5 9.3',
		schild: 'M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6L12 3Z',
		system: 'M4 5h16v11H4V5Zm4 15h8m-4-4v4',
		nutzer: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3.2 3-5 6-5s5.4 1.8 6 5m1-9a3 3 0 1 0 0-6m2 15c-.3-1.8-1.2-3.2-2.5-4',
		protokoll: 'M7 3.5h8l3.5 3.5v13.5h-11.5v-17Zm8 0v3.5h3.5M9.5 11h6m-6 3.5h6m-6 3.5h4',
		zurueck: 'M14.5 5.5 8 12l6.5 6.5'
	};
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
	stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
	<path d={paths[name] ?? ''} />
</svg>
