<script lang="ts">
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import OfferCard from '$lib/components/angebote/OfferCard.svelte';
	import { AGE_GROUPS, OFFER_KINDS } from '$lib/angebote';
	let { data } = $props();
</script>

<svelte:head><title>Freie Plätze & Kurse – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<h1>Freie Plätze & Kurse</h1>
	<p class="lead">Elternkurse, Babyschwimmen, Ferienprogramme und Betreuung von verifizierten Einrichtungen. Jede Platzangabe hat einen Stand und ein Ablaufdatum – danach steht dort „Verfügbarkeit unbekannt“.</p>

	<details class="filters" open={!!(data.filters.q || data.filters.kinds.length || data.filters.ages.length || data.filters.region || data.filters.frei)}>
		<summary>Filter</summary>
		<form method="GET" class="ff">
			<input type="search" name="q" value={data.filters.q} placeholder="Suche" aria-label="Suche" />
			<div class="field"><label for="region">Region</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
			<fieldset class="row"><legend>Art</legend>{#each Object.entries(OFFER_KINDS) as [k, l]}<label class="pill"><input type="checkbox" name="art" value={k} checked={data.filters.kinds.includes(k)} /> {l}</label>{/each}</fieldset>
			<fieldset class="row"><legend>Alter</legend>{#each Object.entries(AGE_GROUPS) as [k, a]}<label class="pill"><input type="checkbox" name="alter" value={k} checked={data.filters.ages.includes(k)} /> {a.label}</label>{/each}</fieldset>
			<label class="pill"><input type="checkbox" name="frei" value="1" checked={data.filters.frei} /> nur mit bestätigten freien Plätzen</label>
			<div><button class="btn small">Anzeigen</button> <a class="btn small secondary" href="/angebote">Zurücksetzen</a></div>
		</form>
	</details>

	{#if data.offers.length}
		<div class="grid">{#each data.offers as o (o.id)}<OfferCard {o} />{/each}</div>
	{:else}
		<p class="empty">Keine Angebote gefunden. Angebote erscheinen, sobald verifizierte Einrichtungen sie eintragen. <a href="/einrichtungen/antrag">Einrichtung anmelden</a></p>
	{/if}
</div>

<style>
	.lead {
		color: var(--ink-2);
		max-width: 48rem;
	}
	.filters {
		margin: var(--sp-4) 0;
	}
	.filters summary {
		cursor: pointer;
		font-weight: 700;
		min-height: 44px;
	}
	.ff {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		max-width: 56rem;
	}
	.row {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	legend {
		font-weight: 700;
		font-size: var(--fs-s);
		width: 100%;
		margin-bottom: var(--sp-1);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		font-size: var(--fs-s);
		min-height: 40px;
		background: var(--surface);
		justify-self: start;
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
</style>
