<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import { KINDS, KIND_KEYS, featuresFor, type Kind } from '$lib/places';

	let { data, form } = $props();
	const v = $derived(form && 'values' in form ? form.values : null);
	let kind = $state<Kind>('spielplatz');
	let lon = $state(0);
	let lat = $state(0);
	let picked = $state(false);
	$effect(() => {
		if (v && KIND_KEYS.includes(v.kind as Kind)) kind = v.kind as Kind;
	});
	const feats = $derived(featuresFor(kind));
</script>

<svelte:head><title>Ort vorschlagen – Kinder Deutschlands</title></svelte:head>

<div class="neu">
	<a class="back" href="/karte"><Icon name="zurueck" size={18} />Karte</a>
	<h1>Ort vorschlagen</h1>
	<p class="lead">Ein Spielplatz, Wickelraum oder Ausflugsziel fehlt? Die Redaktion prüft deinen Vorschlag, dann sehen ihn alle.</p>

	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}

	<form method="POST">
		<fieldset class="kinds">
			<legend>Was ist es?</legend>
			{#each KIND_KEYS as k}
				<label class="kindopt" style:--c={KINDS[k].color} style:--i={KINDS[k].ink}>
					<input type="radio" name="kind" value={k} bind:group={kind} />
					<span class="ic"><Icon name={KINDS[k].icon} size={20} /></span>
					<span>{KINDS[k].label}</span>
				</label>
			{/each}
		</fieldset>

		<div class="pick">
			<p class="legend" id="pick-h">Wo ist es? <span class="muted">Karte verschieben, bis die rote Markierung passt.</span></p>
			<div class="mapbox" aria-describedby="pick-h">
				<FamilyMap mode="pick" tiles={data.tiles} center={v ? [v.lon, v.lat] : data.center} zoom={v ? 17 : 15} label="Karte zum Setzen des Ortes"
					onPick={(x, y) => ((lon = x), (lat = y), (picked = true))} />
			</div>
			<input type="hidden" name="lon" value={lon || v?.lon || ''} />
			<input type="hidden" name="lat" value={lat || v?.lat || ''} />
			<p class="muted small">{picked || v ? `Position: ${(lat || v?.lat || 0).toFixed(5)}, ${(lon || v?.lon || 0).toFixed(5)}` : 'Noch keine Position gesetzt.'} Bitte nur öffentliche Orte – keine Privatadressen.</p>
		</div>

		<div class="field">
			<label for="name">Name <span class="muted">(falls es einen gibt)</span></label>
			<input id="name" name="name" maxlength="120" value={v?.name ?? ''} placeholder="z. B. Spielplatz am Torfkanal" />
		</div>

		{#if feats.length}
			<fieldset class="feats">
				<legend>Was gibt es dort? <span class="muted">Nur ankreuzen, was du sicher weißt.</span></legend>
				{#each feats as [key, d]}
					<label class="check"><input type="checkbox" name="features" value={key} checked={v?.features.includes(key)} /><span>{d.label}</span></label>
				{/each}
			</fieldset>
		{/if}

		<div class="field">
			<label for="description">Beschreibung <span class="muted">(optional)</span></label>
			<textarea id="description" name="description" rows="3" maxlength="800" placeholder="Was sollten andere Eltern wissen?">{v?.description ?? ''}</textarea>
		</div>
		<div class="field">
			<label for="opening_hours">Öffnungszeiten <span class="muted">(optional)</span></label>
			<input id="opening_hours" name="opening_hours" maxlength="200" value={v?.openingHours ?? ''} placeholder="z. B. Mo–Fr 9–18 Uhr" />
		</div>

		{#if form && 'duplicates' in form && form.duplicates}
			<div class="dups" role="alert">
				<h2>Gibt es den Ort schon?</h2>
				<p>Ganz in der Nähe ist bereits eingetragen:</p>
				<ul>
					{#each form.duplicates as d}
						<li><a href="/orte/{d.id}" target="_blank">{d.name}</a> · {d.m} m entfernt{d.pending ? ' · wartet auf Prüfung' : ''}</li>
					{/each}
				</ul>
				<label class="check"><input type="checkbox" name="bestaetigt" value="ja" required /><span>Nein, mein Vorschlag ist ein anderer Ort.</span></label>
			</div>
		{/if}

		<p class="muted small">Bitte keine Fotos oder Namen von Personen. Dein Vorschlag wird ohne deinen Namen veröffentlicht.</p>
		<button class="btn" type="submit">Vorschlag senden</button>
	</form>
</div>

<style>
	.neu {
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
	h1 {
		margin: var(--sp-3) 0 var(--sp-2);
	}
	.lead {
		color: var(--ink-2);
		margin: 0 0 var(--sp-5);
	}
	form {
		display: grid;
		gap: var(--sp-5);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
	}
	legend,
	.legend {
		font-weight: 700;
		margin: 0 0 var(--sp-2);
	}
	.kinds {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: var(--sp-2);
	}
	.kinds legend {
		grid-column: 1 / -1;
	}
	.kindopt {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 52px;
		padding: var(--sp-2) var(--sp-3);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-m);
		background: var(--surface);
		cursor: pointer;
		font-weight: 650;
		font-size: var(--fs-s);
		line-height: 1.2;
		hyphens: auto;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.kindopt input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.kindopt:has(input:checked) {
		border-color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink);
	}
	.kindopt:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.ic {
		display: inline-grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--c);
		color: var(--i);
		flex: none;
	}
	.mapbox {
		height: 320px;
		border-radius: var(--radius-l);
		overflow: hidden;
		box-shadow: var(--shadow);
	}
	.feats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: var(--sp-1) var(--sp-3);
	}
	.feats legend {
		grid-column: 1 / -1;
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 44px;
		cursor: pointer;
	}
	.check input {
		width: 1.2rem;
		height: 1.2rem;
	}
	.dups {
		padding: var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--surface);
		border-left: 6px solid var(--yellow);
	}
	.dups h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-l);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
