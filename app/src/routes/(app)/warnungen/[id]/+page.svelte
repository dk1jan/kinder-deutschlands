<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import WarningCard from '$lib/components/warnungen/WarningCard.svelte';
	let { data } = $props();
	const w = $derived(data.w);
</script>

<svelte:head><title>{w.headline} – Warnungen</title></svelte:head>

<div class="page">
	<a class="back" href="/warnungen"><Icon name="zurueck" size={18} />Warnungen</a>
	{#if w.ended}<Notice kind="info" title="Nicht mehr gültig">Diese Warnung ist abgelaufen oder wurde aufgehoben.</Notice>{/if}
	<WarningCard {w} full />
	{#if w.kreise.length}
		<section>
			<h2>Betroffene Kreise ({w.kreise.length})</h2>
			<p class="kreise">{w.kreise.map((k) => k.name).join(' · ')}</p>
		</section>
	{:else if w.areaDesc}
		<section><h2>Gebiet</h2><p class="kreise">{w.areaDesc}</p></section>
	{/if}
	<p class="muted small">
		Ausgegeben {new Date(w.sent).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' })} vom Deutschen Wetterdienst. Quelle: DWD, opendata.dwd.de, Lizenz CC BY 4.0, Text unverändert.
		{#if w.web && /^https?:\/\//.test(w.web)}<a href={w.web} rel="noopener" target="_blank">Mehr beim DWD</a>{/if}
	</p>
</div>

<style>
	.page {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-4);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	h2 {
		font-size: var(--fs-l);
		margin: 0 0 var(--sp-2);
	}
	.kreise {
		margin: 0;
		line-height: 1.6;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
