<script lang="ts">
	// Direktchat mit einem Kontakt öffnen oder anlegen, dann weiterleiten.
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { openDirect } from '$lib/chat/actions';
	let { data } = $props();
	let error = $state('');
	onMount(async () => {
		try {
			const id = await openDirect(data.mit);
			await goto(`/nachrichten/chat/${encodeURIComponent(id)}`, { replaceState: true });
		} catch (e) {
			error = (e as Error).message || 'Chat konnte nicht geöffnet werden.';
		}
	});
</script>

<svelte:head><title>Chat öffnen – Nachrichten</title></svelte:head>
<div class="container page narrow">
	{#if error}
		<h1>Chat nicht möglich</h1>
		<p role="alert">{error}</p>
		<a class="btn secondary" href="/nachrichten?ansicht=kontakte">Zu den Kontakten</a>
	{:else}
		<p role="status">Unterhaltung wird geöffnet und verschlüsselt …</p>
	{/if}
</div>
