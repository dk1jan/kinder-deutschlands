<script lang="ts">
	import LegalText from '$lib/components/LegalText.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Datenschutz – Kinder Deutschlands</title></svelte:head>
<div class="container page narrow">
	<h1>Datenschutzerklärung</h1>
	{#if !data.checkedAt}<p class="draft" role="note">Entwurf – dieser Text wird vor dem offiziellen Start noch rechtlich geprüft.</p>{/if}
	<LegalText blocks={data.blocks} />
	{#if data.checkedAt}<p class="muted small">Stand: {new Date(data.checkedAt).toLocaleDateString('de-DE')}</p>{/if}
</div>

<style>
	.narrow {
		max-width: 46rem;
	}
	.draft {
		padding: var(--sp-3) var(--sp-4);
		border-left: 5px solid var(--yellow);
		background: var(--surface);
		border-radius: var(--radius-s);
		font-weight: 650;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
