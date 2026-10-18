<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	// Zustände nie nur über Farbe: Symbol + Wort + Farbe.
	let { kind = 'info', title, children }: { kind?: 'info' | 'error' | 'ok' | 'warn'; title?: string; children?: Snippet } =
		$props();
	const word = { info: 'Hinweis', error: 'Fehler', ok: 'Erledigt', warn: 'Achtung' };
	const icon = { info: 'hinweis', error: 'fehler', ok: 'ok', warn: 'fehler' };
</script>

<div class="notice {kind}" role={kind === 'error' ? 'alert' : 'status'}>
	<Icon name={icon[kind]} />
	<p><strong>{title ?? word[kind]}</strong>{@render children?.()}</p>
</div>
