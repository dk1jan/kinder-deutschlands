<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import RouteFacts from '$lib/components/RouteFacts.svelte';
	let { data } = $props();
	const lines = $derived(data.routes.map((r) => ({ coords: r.coords, id: r.id })));
	const ST: Record<string, string> = { pruefung: 'wartet auf Prüfung', abgelehnt: 'nicht veröffentlicht' };
	function nearMe() {
		navigator.geolocation?.getCurrentPosition((p) => {
			const u = new URLSearchParams(location.search);
			u.set('lat', p.coords.latitude.toFixed(3));
			u.set('lon', p.coords.longitude.toFixed(3));
			u.delete('region');
			goto(`?${u}`);
		});
	}
</script>

<svelte:head><title>Kinderwagenrouten – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<div class="head">
		<h1>Kinderwagenrouten</h1>
		{#if data.member}<a class="btn small secondary" href="/routen/neu"><Icon name="plus" size={18} /> Route einzeichnen</a>{/if}
	</div>
	<p class="lead">Spazierwege, die Eltern selbst mit Kinderwagen gegangen sind – mit Länge, Untergrund, Steigung und Treppen, Spielplätzen und Toiletten am Weg. Erfahrungen, keine Garantie: Wege ändern sich, bitte selbst einschätzen.</p>

	<details class="filters" open={!!(data.filters.region || data.filters.maxKm || data.filters.surface || data.filters.noStairs || data.filters.flat || data.filters.loop || data.filters.near)}>
		<summary>Filter</summary>
		<form method="GET" class="ff">
			<div class="field"><label for="region">Region</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
			<p><button type="button" class="btn small secondary" onclick={nearMe}><Icon name="standort" size={16} /> In meiner Nähe</button></p>
			<div class="row">
				<label>Höchstens <select name="maxkm"><option value="">beliebig</option>{#each [2, 5, 10] as k}<option value={k} selected={data.filters.maxKm === k}>{k} km</option>{/each}</select></label>
				<label>Untergrund <select name="untergrund"><option value="">egal</option><option value="asphalt" selected={data.filters.surface === 'asphalt'}>Asphalt</option><option value="pflaster" selected={data.filters.surface === 'pflaster'}>Pflaster</option><option value="wassergebunden" selected={data.filters.surface === 'wassergebunden'}>Kies/Splitt</option><option value="waldweg" selected={data.filters.surface === 'waldweg'}>Wald-/Feldweg</option></select></label>
				<label class="check"><input type="checkbox" name="treppen" value="nein" checked={data.filters.noStairs} /> ohne Treppen</label>
				<label class="check"><input type="checkbox" name="eben" value="1" checked={data.filters.flat} /> eben</label>
				<label class="check"><input type="checkbox" name="rund" value="1" checked={data.filters.loop} /> Rundweg</label>
			</div>
			<div><button class="btn small">Anzeigen</button> <a class="btn small secondary" href="/routen">Zurücksetzen</a></div>
		</form>
	</details>

	{#if data.routes.length}
		<div class="mapwrap"><FamilyMap mode="mini" tiles={data.tiles} center={data.routes[0].coords[0]} zoom={12} {lines} label="Karte der Routen" onLine={(id) => goto(`/routen/${id}`)} /></div>
	{/if}

	{#if data.mine.length}
		<h2>Meine eingereichten Routen</h2>
		<ul class="list">{#each data.mine as r}<li><a href="/routen/{r.id}"><strong>{r.title}</strong> <small>{ST[r.status] ?? r.status}</small></a></li>{/each}</ul>
	{/if}

	{#if data.routes.length}
		<ul class="list">
			{#each data.routes as r (r.id)}
				<li><a href="/routen/{r.id}">
					<strong>{r.title}</strong>
					<small>{r.regionName ?? ''}{r.km !== null ? ` · ${r.km.toLocaleString('de-DE')} km entfernt` : ''}{r.origin === 'redaktion' ? ' · Redaktion' : ' · von einem Mitglied'}{r.okCount ? ` · ${r.okCount}× bestätigt` : ''}</small>
					<RouteFacts {r} />
					{#if r.warning}<span class="warn">Aktueller Hinweis auf ein Hindernis</span>{/if}
				</a></li>
			{/each}
		</ul>
	{:else}
		<p class="empty">Noch keine Route{data.filters.region || data.filters.near ? ' für diese Auswahl' : ''}. Du kennst einen guten Weg? {#if data.member}<a href="/routen/neu">Route einzeichnen</a>{:else}<a href="/anmelden?weiter=/routen/neu">Anmelden und einzeichnen</a>{/if}</p>
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
	.head .btn {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.lead {
		color: var(--ink-2);
		max-width: 50rem;
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
		max-width: 52rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
	}
	.row label {
		display: inline-flex;
		gap: var(--sp-1);
		align-items: center;
	}
	.mapwrap {
		height: min(55vh, 28rem);
		border-radius: var(--radius-m);
		overflow: hidden;
		margin: var(--sp-4) 0;
	}
	.list {
		list-style: none;
		margin: 0 0 var(--sp-4);
		padding: 0;
		display: grid;
		gap: var(--sp-2);
		max-width: 52rem;
	}
	.list a {
		display: grid;
		gap: 4px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		text-decoration: none;
		color: var(--ink);
		border-left: 6px solid #1f7468;
	}
	.list small {
		color: var(--ink-2);
	}
	.warn {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--danger);
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
</style>
