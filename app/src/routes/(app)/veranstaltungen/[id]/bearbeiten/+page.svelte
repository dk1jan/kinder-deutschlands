<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import EventForm from '$lib/components/angebote/EventForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Termin bearbeiten – Kinder Deutschlands</title></svelte:head>

<div class="neu">
	<a class="back" href="/veranstaltungen/{data.id}"><Icon name="zurueck" size={18} />{data.title}</a>
	<h1>Termin bearbeiten</h1>
	<p class="lead">Veranstalter: {data.ownerLabel}. Wer den Termin gemerkt oder zugesagt hat, erfährt von der Änderung.</p>
	{#if data.imported}<Notice kind="info" title="Aus einer Quelle übernommen">Titel, Beschreibung, Zeit und Ort, die du hier änderst, werden beim nächsten Abruf nicht mehr überschrieben.</Notice>{/if}
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}
		<EventForm values={form?.values ?? data.values} owners={[{ value: data.owner, label: data.ownerLabel }]} owner={data.owner} region={form ? null : data.region} place={data.place} tiles={data.tiles} center={data.center} submit="Änderungen speichern" edit />
	{/key}
</div>

<style>
	.neu {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-3) 0 var(--sp-2);
	}
	.lead {
		color: var(--ink-2);
		margin: 0 0 var(--sp-5);
	}
</style>
