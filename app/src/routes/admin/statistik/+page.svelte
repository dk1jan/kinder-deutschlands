<script lang="ts">
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	let { data } = $props();
	const show = (v: number | null) => (v === null ? '–' : v === -2 ? '< 5' : v.toLocaleString('de-DE'));
	function delta(a: number | null, b: number | null) {
		if (a === null || b === null || a < 0 || b < 0) return '';
		if (b === 0) return a === 0 ? '±0' : 'neu';
		const pct = Math.round(((a - b) / b) * 100);
		return `${pct > 0 ? '+' : ''}${pct} %`;
	}
</script>

<svelte:head><title>Statistik – Verwaltung</title></svelte:head>

<h1>Statistik</h1>
<p class="muted">Nur Zählungen, keine Einzelpersonen, keine Inhalte. Vergleich mit dem gleich langen Zeitraum davor. Mit Regionsfilter werden Zahlen unter 5 als „&lt; 5“ angezeigt. Was nicht gemessen wird, steht als „nicht erfasst“ da – es gibt kein Tracking.</p>

<form method="GET" class="ff">
	<label>Zeitraum
		<select name="zeitraum">{#each [['7', '7 Tage'], ['30', '30 Tage'], ['90', '90 Tage'], ['365', '12 Monate']] as [v, l]}<option value={v} selected={data.period === v}>{l}</option>{/each}</select>
	</label>
	<div class="field"><label for="region">Region (optional)</label><RegionPicker id="region" name="region" code={data.region?.code ?? ''} label={data.region?.name ?? ''} /></div>
	<button class="btn small">Anzeigen</button>
</form>

{#each data.groups as g}
	<!-- Breite Tabellen scrollen auf dem Handy: per Tastatur erreichbar (tabindex) und benannt -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<section class="card" tabindex="0" aria-label={g.title}>
		<h2>{g.title}</h2>
		<table class="data">
			<thead><tr><th scope="col">Kennzahl</th><th scope="col" class="num">{data.days} Tage</th><th scope="col" class="num">Davor</th><th scope="col" class="num"><abbr title="Veränderung zum Vorzeitraum">±</abbr></th></tr></thead>
			<tbody>
				{#each g.metrics as x (x.key)}
					<tr><td>{x.label}{#if x.note}<br /><small class="muted">{x.note}</small>{/if}</td><td class="num">{show(x.now)}</td><td class="num">{x.before === null ? '' : show(x.before)}</td><td class="num">{delta(x.now, x.before)}</td></tr>
				{/each}
			</tbody>
		</table>
		{#if g.rows?.length}
			<h3>{g.rowsTitle}</h3>
			<ul class="bars">
				{#each g.rows as r}
					{@const max = Math.max(...g.rows.map((y) => y.value))}
					<li><span class="l">{r.label}</span><span class="b" style:width="{Math.max(2, (100 * r.value) / max)}%"></span><span class="v">{r.value.toLocaleString('de-DE')}</span></li>
				{/each}
			</ul>
		{/if}
	</section>
{/each}
<p class="muted small">Stand {new Date(data.at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.</p>

<style>
	.ff {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: end;
		margin: var(--sp-4) 0;
	}
	.ff label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
		overflow-x: auto;
	}
	.card h2 {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-l);
	}
	.card h3 {
		font-size: var(--fs-m);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.bars {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.bars li {
		display: grid;
		grid-template-columns: minmax(8rem, 14rem) 1fr 4rem;
		gap: var(--sp-2);
		align-items: center;
		font-size: var(--fs-s);
	}
	.bars .b {
		height: 10px;
		border-radius: 999px;
		background: var(--sea, #1f7468);
	}
	.bars .v {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
