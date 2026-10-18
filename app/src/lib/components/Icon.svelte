<script lang="ts">
	import { ICONS } from '$lib/icons';
	// Schlichte Linien-Symbole, 24×24, Strichstärke 1.75. Immer dekorativ (aria-hidden) – Text steht daneben.
	let { name, size = 24 }: { name: string; size?: number } = $props();
	const paths = ICONS;
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
	stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
	<path d={paths[name] ?? ''} />
</svg>
