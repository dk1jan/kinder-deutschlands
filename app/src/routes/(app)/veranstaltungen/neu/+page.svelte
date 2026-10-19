<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import EventForm from '$lib/components/angebote/EventForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Termin eintragen – Kinder Deutschlands</title></svelte:head>

<div class="neu">
	<a class="back" href="/veranstaltungen"><Icon name="zurueck" size={18} />Veranstaltungen</a>
	<h1>Termin eintragen</h1>
	<p class="lead">Flohmarkt, Laternenlaufen, Spielgruppe? Einrichtungen veröffentlichen offen, Mitglieder im Netzwerk oder nur per Link.</p>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}
		<EventForm values={form?.values ?? data.values} owners={data.owners} owner={form?.values?.owner?.[0] ?? data.owner} place={data.place} tiles={data.tiles} center={data.center} submit="Termin veröffentlichen" />
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
