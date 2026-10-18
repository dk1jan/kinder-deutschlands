<script lang="ts">
	// Der Wimpel – Markenzeichen und Hinweis auf den Kinderwagenwimpel mit Kontakt-QR (M01).
	let { size = 32, label = '' }: { size?: number; label?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" role={label ? 'img' : undefined} aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}>
	<rect x="5" y="3" width="2.6" height="26" rx="1.3" fill="var(--ink)" />
	<path d="M7.6 4.5 28 11.2 7.6 18Z" fill="var(--signal)" />
	<path d="M7.6 4.5 28 11.2 7.6 18" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round" />
</svg>
