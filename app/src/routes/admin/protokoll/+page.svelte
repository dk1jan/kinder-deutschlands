<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Protokoll – Verwaltung</title></svelte:head>

<h1>Protokoll</h1>
<p class="muted">Die letzten 200 sicherheitsrelevanten Vorgänge. Es werden keine privaten Inhalte gespeichert, IP-Adressen nur als tagesbezogener Hash.</p>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
	<table class="data">
		<thead><tr><th scope="col">Zeit</th><th scope="col">Vorgang</th><th scope="col">Durch</th><th scope="col">Ziel</th><th scope="col">Details</th></tr></thead>
		<tbody>
			{#each data.rows as r}
				<tr><td>{r.at}</td><td><code>{r.action}</code></td><td>{r.actor}</td><td>{r.target}</td><td>{r.reason} {r.meta}</td></tr>
			{:else}
				<tr><td colspan="5">Noch keine Einträge.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		overflow-x: auto;
	}
</style>
