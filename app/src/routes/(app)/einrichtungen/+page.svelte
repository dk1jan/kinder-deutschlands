<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { ORG_KINDS } from '$lib/angebote';
	let { data } = $props();
</script>

<svelte:head><title>Einrichtungen & Partner – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<div class="head">
		<h1>Einrichtungen & Partner</h1>
		<a class="btn small secondary" href="/einrichtungen/{data.member ? 'verwalten' : 'antrag'}">{data.member ? 'Meine Einrichtungen' : 'Einrichtung anmelden'}</a>
	</div>
	<p class="lead">Familienzentren, Beratungsstellen, Vereine und Kursanbieter. Alle hier sind von uns verifiziert: Die Zuordnung zur Organisation ist geprüft – nicht die Qualität jedes Angebots.</p>

	<form method="GET" class="ff">
		<label class="q"><span class="visually-hidden">Suche</span><input type="search" name="q" value={data.filters.q} placeholder="Name oder Stichwort" /></label>
		<select name="art" aria-label="Art"><option value="">alle Arten</option>{#each Object.entries(ORG_KINDS) as [k, l]}<option value={k} selected={data.filters.art === k}>{l}</option>{/each}</select>
		<RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} />
		<button class="btn small">Suchen</button>
	</form>

	{#if data.orgs.length}
		<ul class="orgs">
			{#each data.orgs as o}
				<li><a href="/einrichtungen/{o.slug}">
					<strong><Icon name="ok" size={16} /> {o.name}</strong>
					<small>{ORG_KINDS[o.kind as keyof typeof ORG_KINDS] ?? o.kind}{o.regionName ? ` · ${o.regionName}` : ''}</small>
					{#if o.teaser}<span>{o.teaser}{o.teaser.length >= 220 ? ' …' : ''}</span>{/if}
				</a></li>
			{/each}
		</ul>
	{:else}
		<p class="empty">Noch keine verifizierte Einrichtung{data.filters.q || data.filters.art || data.filters.region ? ' für diese Suche' : ''}. Sie erscheinen hier, sobald Einrichtungen sich angemeldet haben und geprüft sind.</p>
	{/if}
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}
	h1 {
		margin: 0;
	}
	.lead {
		color: var(--ink-2);
		max-width: 48rem;
	}
	.ff {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin: var(--sp-4) 0;
	}
	.ff > * {
		flex: 1 1 12rem;
	}
	.ff button {
		flex: 0 0 auto;
	}
	.orgs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
	}
	.orgs a {
		display: grid;
		gap: var(--sp-1);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
		height: 100%;
	}
	.orgs strong {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.orgs small {
		color: var(--ink-2);
	}
	.orgs span {
		font-size: var(--fs-s);
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
</style>
