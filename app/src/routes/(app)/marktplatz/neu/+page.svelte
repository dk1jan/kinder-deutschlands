<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ListingForm from '$lib/components/alltag/ListingForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Anzeige aufgeben – Marktplatz</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/marktplatz"><Icon name="zurueck" size={18} />Marktplatz</a>
	<h1>Anzeige aufgeben</h1>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}<ListingForm values={form?.values ?? {}} region={form ? (form.region ?? null) : data.region} submit="Anzeige veröffentlichen" />{/key}
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
</style>
