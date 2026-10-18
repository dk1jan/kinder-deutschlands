<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const state = $derived(form?.done ?? (data.info.consent === 'erteilt' ? 'ja' : data.info.consent === 'abgelehnt' ? 'nein' : null));
</script>

<svelte:head><title>Zustimmung – Wissen</title></svelte:head>

<div class="page">
	<h1>Darf dein Beitrag ins Wissen?</h1>
	<p>Die Redaktion möchte deinen Beitrag <strong>„{data.info.postTitle}“</strong> zu einem geprüften Wissenseintrag aufbereiten. Dabei wird der Text überarbeitet, mit Quellen ergänzt und ohne deinen Namen veröffentlicht – je nach Eintrag nur für Mitglieder oder öffentlich.</p>
	{#if state === 'ja'}<Notice kind="ok">Danke! Du hast zugestimmt.</Notice>
	{:else if state === 'nein'}<Notice kind="info">Du hast abgelehnt – der Entwurf wird nicht veröffentlicht.</Notice>
	{:else}
		<form method="POST" class="row">
			<button class="btn" name="yes" value="1">Ja, einverstanden</button>
			<button class="btn secondary" name="yes" value="0">Nein</button>
		</form>
	{/if}
</div>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--sp-6) var(--gutter) var(--sp-7);
	}
	.row {
		display: flex;
		gap: var(--sp-2);
	}
</style>
