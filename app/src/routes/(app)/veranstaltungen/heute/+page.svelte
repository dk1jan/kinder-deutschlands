<script lang="ts">
	// „Was machen wir heute?“ – Termine des Tages und passende Orte aus der Familienkarte. Nichts wird erfunden:
	// Wenn es nichts gibt, steht das da.
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import EventCard from '$lib/components/angebote/EventCard.svelte';
	import { AGE_GROUPS } from '$lib/angebote';
	import { KINDS } from '$lib/places';

	let { data } = $props();
	let locating = $state(false);
	let locError = $state('');

	function nearMe() {
		if (!navigator.geolocation) return (locError = 'Dein Browser kann den Standort nicht bestimmen.');
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				locating = false;
				const u = new URLSearchParams(location.search);
				u.set('lat', pos.coords.latitude.toFixed(3));
				u.set('lon', pos.coords.longitude.toFixed(3));
				u.delete('region');
				goto(`?${u}`);
			},
			() => {
				locating = false;
				locError = 'Standort nicht freigegeben. Wähle stattdessen eine Region.';
			},
			{ maximumAge: 300_000, timeout: 10_000 }
		);
	}
</script>

<svelte:head><title>Was machen wir {data.morgen ? 'morgen' : 'heute'}? – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<a class="back" href="/veranstaltungen"><Icon name="zurueck" size={18} />Veranstaltungen</a>
	<h1>Was machen wir {data.morgen ? 'morgen' : 'heute'}?</h1>

	<form method="GET" class="ff">
		<fieldset class="row"><legend>Tag</legend>
			<label class="pill"><input type="radio" name="tag" value="" checked={!data.morgen} /> heute</label>
			<label class="pill"><input type="radio" name="tag" value="morgen" checked={data.morgen} /> morgen</label>
		</fieldset>
		<div class="field"><label for="region">Region</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
		<p class="near">
			<button type="button" class="btn small secondary" onclick={nearMe} disabled={locating}><Icon name="standort" size={18} /> {locating ? 'Suche …' : 'In meiner Nähe'}</button>
			{#if data.near}<span class="muted small">Umkreis 10 km um deinen Standort (wird nicht gespeichert).</span>{/if}
			{#if locError}<span class="muted small" role="status">{locError}</span>{/if}
		</p>
		<fieldset class="row"><legend>Alter</legend>
			{#each Object.entries(AGE_GROUPS) as [k, a]}<label class="pill"><input type="checkbox" name="alter" value={k} checked={data.filters.ages.includes(k)} /> {a.label}</label>{/each}
		</fieldset>
		<fieldset class="row"><legend>Wetter / Lust</legend>
			<label class="pill"><input type="radio" name="wo" value="" checked={!data.filters.wo} /> egal</label>
			<label class="pill"><input type="radio" name="wo" value="drinnen" checked={data.filters.wo === 'drinnen'} /> drinnen (Regen)</label>
			<label class="pill"><input type="radio" name="wo" value="draussen" checked={data.filters.wo === 'draussen'} /> draußen</label>
			<label class="pill"><input type="checkbox" name="kostenlos" value="1" checked={data.filters.kostenlos} /> kostenlos</label>
		</fieldset>
		<div><button class="btn small">Vorschläge zeigen</button></div>
	</form>

	<section aria-labelledby="t-h">
		<h2 id="t-h">Termine</h2>
		{#if data.events.length}
			<div class="list">{#each data.events as e (e.id + e.date)}<EventCard {e} />{/each}</div>
		{:else}
			<p class="muted">Für diese Auswahl sind {data.morgen ? 'morgen' : 'heute'} keine Termine eingetragen.</p>
		{/if}
	</section>

	<section aria-labelledby="o-h">
		<h2 id="o-h">Orte aus der Familienkarte</h2>
		{#if data.places.length}
			<ul class="places">
				{#each data.places as p}
					{@const k = KINDS[p.kind as keyof typeof KINDS]}
					<li><a href="/orte/{p.id}">
						<span class="badge" style:background={k?.color} style:color={k?.ink}><Icon name={k?.icon ?? 'pin'} size={18} /></span>
						<span><strong>{p.name || (k?.label ?? p.kind)}</strong><small>{[p.name ? (k?.label ?? p.kind) : null, p.regionName, p.km !== null ? `${p.km.toLocaleString('de-DE')} km` : null].filter(Boolean).join(' · ')}</small></span>
					</a></li>
				{/each}
			</ul>
			<p class="muted small">Öffnungszeiten und Zustand bitte vor Ort bzw. beim Betreiber prüfen.</p>
		{:else}
			<p class="muted">Keine passenden Orte gefunden. Wähle eine Region oder „In meiner Nähe“.</p>
		{/if}
	</section>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-3) 0 var(--sp-4);
	}
	h2 {
		font-size: var(--fs-l);
		margin: var(--sp-6) 0 var(--sp-3);
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
		cursor: pointer;
		background: var(--surface);
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.near {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin: 0;
	}
	.near .btn {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.list {
		display: grid;
		gap: var(--sp-3);
		max-width: 52rem;
	}
	.places {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
	}
	.places a {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-m);
		text-decoration: none;
		color: var(--ink);
		min-height: 56px;
	}
	.places small {
		display: block;
		color: var(--ink-2);
	}
	.badge {
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		flex: none;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
