<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ListingForm from '$lib/components/alltag/ListingForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Anzeige bearbeiten – Marktplatz</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/marktplatz/{data.id}"><Icon name="zurueck" size={18} />{data.title}</a>
	<h1>Anzeige bearbeiten</h1>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}<ListingForm values={form?.values ?? data.values} region={form ? null : data.region} submit="Speichern" withImages={false} />{/key}
	<p class="muted small">Fotos änderst du auf der Seite der Anzeige.</p>
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
	.small {
		font-size: var(--fs-s);
	}
</style>
