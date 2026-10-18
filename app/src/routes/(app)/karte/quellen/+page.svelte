<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : 'noch nicht');
</script>

<svelte:head><title>Quellen der Karte – Kinder Deutschlands</title></svelte:head>

<div class="page">
	<a class="back" href="/karte"><Icon name="zurueck" size={18} />Karte</a>
	<h1>Woher die Daten kommen</h1>
	<p class="lead">Die Karte beruht auf offenen Daten, die wir regelmäßig automatisch abgleichen, und auf Ergänzungen von Mitgliedern, die unsere Redaktion prüft. Wir kopieren keine Verzeichnisse anderer Anbieter.</p>
	<ul class="src">
		{#each data.sources as s}
			<li>
				<h2>{s.name}</h2>
				<p>{s.operator}{s.kind === 'orte' ? ` · ${s.n.toLocaleString('de-DE')} Einträge` : ''} · zuletzt abgeglichen {fmt(s.last_success_at)}</p>
				<p class="muted">Lizenz: {#if s.license_url}<a href={s.license_url} rel="noopener" target="_blank">{s.license}</a>{:else}{s.license}{/if} · {s.attribution}</p>
			</li>
		{/each}
		<li>
			<h2>Ergänzungen von Mitgliedern</h2>
			<p>{data.community.toLocaleString('de-DE')} freigegebene Orte</p>
		</li>
	</ul>
	<p class="muted">Kartendarstellung: <a href="https://protomaps.com" rel="noopener" target="_blank">Protomaps</a>, <a href="https://maplibre.org" rel="noopener" target="_blank">MapLibre</a>. Schrift: Noto Sans (SIL Open Font License). Alles wird von unserem eigenen Server ausgeliefert – beim Kartenaufruf gehen keine Anfragen an Dritte.</p>
</div>

<style>
	.page {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.lead {
		color: var(--ink-2);
	}
	.src {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.src li {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
	}
	.src h2 {
		margin: 0 0 var(--sp-1);
		font-size: var(--fs-m);
	}
	.src p {
		margin: 0;
	}
</style>
