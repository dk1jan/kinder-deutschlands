<script lang="ts">
	import LegalText from '$lib/components/LegalText.svelte';
	let { data } = $props();
	const i = $derived(data.i);
</script>

<svelte:head><title>Impressum – Kinder Deutschlands</title></svelte:head>
<div class="container page narrow">
	<h1>Impressum</h1>
	{#if !data.complete}
		<p class="draft" role="note">Die Angaben zum Anbieter werden gerade eingetragen.</p>
	{:else}
		{#if !data.checkedAt}<p class="draft" role="note">Entwurf – wird vor dem offiziellen Start rechtlich geprüft.</p>{/if}
		<h2>Anbieter</h2>
		<p>{i.provider}{#if i.represented}<br />vertreten durch {i.represented}{/if}<br />{i.street}<br />{i.city}{#if i.country}<br />{i.country}{/if}</p>
		<h2>Kontakt</h2>
		<p>E-Mail: <a href="mailto:{i.email}">{i.email}</a>{#if i.phone}<br />Telefon: {i.phone}{/if}</p>
		{#if i.register}<h2>Registereintrag</h2><p>{i.register}</p>{/if}
		{#if i.vat}<h2>Umsatzsteuer-ID</h2><p>{i.vat}</p>{/if}
		{#if i.responsible}<h2>Verantwortlich für den Inhalt</h2><p>{i.responsible}</p>{/if}
		<LegalText blocks={data.extra} />
	{/if}
	<p class="muted small">Karten: © OpenStreetMap-Mitwirkende. Quellen der Ortsdaten: <a href="/karte/quellen">Datenquellen</a>.</p>
</div>

<style>
	.narrow {
		max-width: 46rem;
	}
	h2 {
		font-size: var(--fs-l);
		margin: var(--sp-5) 0 var(--sp-2);
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
