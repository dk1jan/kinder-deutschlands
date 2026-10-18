<script lang="ts">
	import { replaceState } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import FamilyMap, { type MapFeature, type MapView } from '$lib/components/FamilyMap.svelte';
	import { KINDS, KIND_FILTERS, FILTER_FEATURES, FEATURES, distanceM, distanceText, type Kind } from '$lib/places';

	let { data } = $props();

	let mapRef: ReturnType<typeof FamilyMap> | undefined = $state();
	let filters = $state<string[]>([]);
	let feats = $state<string[]>([]);
	// svelte-ignore state_referenced_locally
	let selected = $state<MapFeature | null>(data.focus);
	let items = $state<MapFeature[]>([]);
	let dataState = $state<'ok' | 'zoom' | 'error' | 'truncated' | 'init'>('init');
	// svelte-ignore state_referenced_locally
	let viewC = $state<[number, number]>(data.center);
	let me = $state<[number, number] | null>(null);
	let listOpen = $state(false);
	let filterOpen = $state(false);
	let locating = $state(false);
	let locError = $state('');
	let q = $state('');
	let results = $state<{ places: { id: string; kind: Kind; name: string; region: string | null; lon: number; lat: number }[]; regions: { code: string; name: string; level: string; bbox: [number, number, number, number] }[] } | null>(null);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let urlTimer: ReturnType<typeof setTimeout> | null = null;

	const ref = $derived<[number, number]>(me ?? viewC);
	const sorted = $derived(
		items
			.map((i) => ({ ...i, m: distanceM(ref, [i.lon, i.lat]) }))
			.sort((a, b) => a.m - b.m)
			.slice(0, 80)
	);
	const activeCount = $derived(filters.length + feats.length);

	function toggle(list: string[], key: string) {
		return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
	}

	function onView(v: MapView) {
		viewC = v.center;
		if (urlTimer) clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const u = new URL(location.href);
			u.searchParams.delete('ort');
			u.searchParams.set('lon', v.center[0].toFixed(5));
			u.searchParams.set('lat', v.center[1].toFixed(5));
			u.searchParams.set('z', v.zoom.toFixed(1));
			try {
				replaceState(u, {});
			} catch {
				/* vor der ersten Navigation nicht möglich */
			}
		}, 600);
	}

	function choose(f: MapFeature) {
		selected = f;
		listOpen = false;
		mapRef?.flyTo(f.lon, f.lat);
	}

	function locate() {
		locError = '';
		if (!('geolocation' in navigator)) {
			locError = 'Dein Browser kann den Standort nicht bestimmen.';
			return;
		}
		locating = true;
		// Standort bleibt im Browser – er wird weder gespeichert noch an den Server geschickt
		navigator.geolocation.getCurrentPosition(
			(p) => {
				locating = false;
				me = [p.coords.longitude, p.coords.latitude];
				mapRef?.showMe(me[0], me[1]);
				mapRef?.flyTo(me[0], me[1], 15);
			},
			(e) => {
				locating = false;
				locError = e.code === 1 ? 'Standortfreigabe abgelehnt. Du kannst sie in den Browser-Einstellungen erlauben.' : 'Standort konnte nicht bestimmt werden.';
			},
			{ enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
		);
	}

	function onSearch() {
		if (searchTimer) clearTimeout(searchTimer);
		const term = q.trim();
		if (term.length < 2) {
			results = null;
			return;
		}
		searchTimer = setTimeout(async () => {
			const r = await fetch(`/api/orte/suche?q=${encodeURIComponent(term)}`).catch(() => null);
			if (r?.ok) results = await r.json();
		}, 220);
	}

	function pickRegion(b: [number, number, number, number]) {
		results = null;
		q = '';
		mapRef?.fitBounds(b);
	}
	function pickPlace(p: { id: string; kind: Kind; name: string; lon: number; lat: number }) {
		results = null;
		q = '';
		selected = { id: p.id, k: p.kind, n: p.name, f: '', lon: p.lon, lat: p.lat };
		mapRef?.flyTo(p.lon, p.lat, 16);
	}

	const featureList = (f: string) =>
		f
			.split(',')
			.filter((k) => k && FEATURES[k])
			.slice(0, 5)
			.map((k) => FEATURES[k].label);
	const kindOf = (k: string) => KINDS[k as Kind] ?? KINDS.spielplatz;
</script>

<svelte:head><title>Karte – Kinder Deutschlands</title></svelte:head>

<h1 class="sr">Familienkarte</h1>

<div class="karte">
	<aside class="panel" class:open={listOpen}>
		<div class="search" role="search">
			<label class="field-search">
				<Icon name="suche" size={20} />
				<span class="sr">Ort oder Stadtteil suchen</span>
				<input type="search" bind:value={q} oninput={onSearch} placeholder="Spielplatz, Stadtteil, Ort …" autocomplete="off" enterkeyhint="search" />
			</label>
			{#if results && (results.places.length || results.regions.length)}
				<ul class="results" role="listbox" aria-label="Suchergebnisse">
					{#each results.regions as r}
						<li><button type="button" onclick={() => pickRegion(r.bbox)}><Icon name="karte" size={18} /><span>{r.name}</span><small>{r.level === 'stadtteil' ? 'Stadtteil' : r.level === 'gemeinde' ? 'Gemeinde' : r.level === 'kreis' ? 'Kreis/Stadt' : 'Land'}</small></button></li>
					{/each}
					{#each results.places as p}
						<li><button type="button" onclick={() => pickPlace(p)}><span class="dot" style:background={kindOf(p.kind).color}></span><span>{p.name}</span><small>{kindOf(p.kind).label}{p.region ? ` · ${p.region}` : ''}</small></button></li>
					{/each}
				</ul>
			{:else if results}
				<p class="results empty">Nichts gefunden.</p>
			{/if}
		</div>

		<div class="chips" role="group" aria-label="Was suchst du?">
			{#each KIND_FILTERS as f}
				<button type="button" class="chip" aria-pressed={filters.includes(f.key)} onclick={() => (filters = toggle(filters, f.key))}>{f.label}</button>
			{/each}
			<button type="button" class="chip more" aria-expanded={filterOpen} onclick={() => (filterOpen = !filterOpen)}>
				<Icon name="filter" size={18} />Ausstattung{feats.length ? ` · ${feats.length}` : ''}
			</button>
		</div>
		{#if filterOpen}
			<div class="chips feat" role="group" aria-label="Ausstattung">
				{#each FILTER_FEATURES as f}
					<button type="button" class="chip" aria-pressed={feats.includes(f.key)} onclick={() => (feats = toggle(feats, f.key))}>{f.label}</button>
				{/each}
				{#if activeCount}<button type="button" class="chip reset" onclick={() => ((filters = []), (feats = []))}>Alle Filter löschen</button>{/if}
			</div>
			<p class="hint">Ausstattung kennen wir nur, wo sie eingetragen ist. Ohne Angabe heißt: unbekannt, nicht „nein“.</p>
		{/if}

		<div class="list" aria-live="polite">
			<p class="state">
				{#if dataState === 'zoom'}Zum Anzeigen der Orte näher heranzoomen.
				{:else if dataState === 'error'}Orte konnten nicht geladen werden. Bitte später erneut versuchen.
				{:else if dataState === 'init'}{data.near.length ? 'In der Nähe' : ''}
				{:else if !items.length}{data.total ? 'Hier gibt es noch keine passenden Orte.' : 'Die Orte werden gerade aus offenen Daten übernommen. Schau bald wieder vorbei.'}
				{:else}{items.length.toLocaleString('de-DE')} {items.length === 1 ? 'Ort' : 'Orte'} im Ausschnitt{dataState === 'truncated' ? ' (Auswahl – näher heranzoomen für alle)' : ''} · nach Entfernung {me ? 'von dir' : 'zur Kartenmitte'}{/if}
			</p>
			<ul>
				{#if dataState === 'init'}
					{#each data.near as p}
						<li><a href="/orte/{p.id}"><span class="dot" style:background={kindOf(p.kind).color}></span><span class="t"><b>{p.name}</b><small>{kindOf(p.kind).label}</small></span><span class="d">{distanceText(p.m)}</span></a></li>
					{/each}
				{:else}
					{#each sorted as p (p.id)}
						<li>
							<a href="/orte/{p.id}" onclick={(e) => { if (window.matchMedia('(min-width: 960px)').matches) { e.preventDefault(); choose(p); } }}>
								<span class="dot" style:background={kindOf(p.k).color}></span>
								<span class="t"><b>{p.n}</b><small>{kindOf(p.k).label}{featureList(p.f).length ? ' · ' + featureList(p.f).slice(0, 3).join(', ') : ''}</small></span>
								<span class="d">{distanceText(p.m)}</span>
							</a>
						</li>
					{/each}
				{/if}
			</ul>
			<a class="suggest" href="/orte/neu"><Icon name="plus" size={18} />Ort fehlt? Vorschlagen</a>
		</div>
	</aside>

	<div class="mapbox">
		<FamilyMap
			bind:this={mapRef}
			tiles={data.tiles}
			center={data.center}
			zoom={data.zoom}
			{filters}
			features={feats}
			selected={selected?.id ?? null}
			label="Familienkarte mit Spielplätzen und Familienorten"
			onSelect={(f) => (selected = f)}
			onData={(f, s) => ((items = f), (dataState = s))}
			{onView}
		/>
		{#if !data.tiles}
			<p class="banner"><Icon name="hinweis" size={18} />Kartenhintergrund wird gerade eingerichtet – Orte sind schon sichtbar.</p>
		{/if}
		<div class="fabs">
			<button type="button" class="fab" onclick={locate} aria-label="Meinen Standort zeigen" disabled={locating}><Icon name="standort" /></button>
			<button type="button" class="fab list-toggle" onclick={() => (listOpen = !listOpen)} aria-expanded={listOpen}>
				<Icon name={listOpen ? 'karte' : 'liste'} /><span>{listOpen ? 'Karte' : 'Liste'}</span>
			</button>
		</div>
		{#if locError}<p class="banner err" role="alert">{locError}</p>{/if}

		{#if selected}
			{@const k = kindOf(selected.k)}
			<section class="sheet" aria-label="Ausgewählter Ort">
				<button type="button" class="close" onclick={() => (selected = null)} aria-label="Schließen"><Icon name="schliessen" size={20} /></button>
				<p class="kind"><span class="badge" style:background={k.color} style:color={k.ink}><Icon name={k.icon} size={16} /></span>{k.label}{me ? ` · ${distanceText(distanceM(me, [selected.lon, selected.lat]))} entfernt` : ''}</p>
				<h2>{selected.n}</h2>
				{#if featureList(selected.f).length}
					<ul class="tags">{#each featureList(selected.f) as t}<li>{t}</li>{/each}</ul>
				{/if}
				<div class="row">
					<a class="btn" href="/orte/{selected.id}">Details</a>
					<a class="btn secondary" href="geo:{selected.lat},{selected.lon}?q={selected.lat},{selected.lon}"><Icon name="route" size={18} />Hinweg</a>
				</div>
			</section>
		{/if}
	</div>
</div>

<style>
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.karte {
		position: relative;
		height: calc(100dvh - var(--header-h) - var(--nav-h) - env(safe-area-inset-bottom));
		min-height: 420px;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
		overflow: hidden;
	}
	.mapbox {
		position: relative;
		grid-area: 1 / 1;
		min-width: 0;
	}
	/* Mobil: Suche und Chips schweben über der Karte, Liste als ausklappbare Fläche */
	.panel {
		grid-area: 1 / 1;
		min-width: 0;
		z-index: 5;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-3) 0;
	}
	.panel > * {
		pointer-events: auto;
	}
	.search {
		position: relative;
	}
	.field-search {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		height: 52px;
		padding: 0 var(--sp-4);
		background: var(--surface);
		border-radius: 999px;
		box-shadow: var(--shadow);
		color: var(--ink-2);
	}
	.field-search input {
		flex: 1;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: var(--fs-m);
		color: var(--ink);
		min-width: 0;
		height: 100%;
		padding: 0;
		box-shadow: none;
	}
	.field-search input:focus {
		outline: none;
	}
	.field-search:focus-within {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.results {
		position: absolute;
		z-index: 6;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		margin: 0;
		padding: var(--sp-2);
		list-style: none;
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		max-height: 50vh;
		overflow: auto;
	}
	.results.empty {
		padding: var(--sp-3) var(--sp-4);
		color: var(--ink-2);
	}
	.results button {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		column-gap: var(--sp-3);
		width: 100%;
		min-height: 48px;
		padding: var(--sp-2) var(--sp-3);
		border: 0;
		background: none;
		border-radius: var(--radius-s);
		text-align: left;
		font: inherit;
		color: var(--ink);
		cursor: pointer;
	}
	.results button small {
		grid-column: 2;
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
	.results button:hover,
	.results button:focus-visible {
		background: var(--surface-2);
	}
	.dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex: none;
		box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.65);
	}
	.chips {
		display: flex;
		gap: var(--sp-2);
		overflow-x: auto;
		scrollbar-width: none;
		margin: 0 calc(-1 * var(--sp-3));
		padding: 2px var(--sp-3) 6px;
	}
	.chips::-webkit-scrollbar {
		display: none;
	}
	.chips.feat {
		flex-wrap: wrap;
		overflow: visible;
	}
	.chip {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 var(--sp-4);
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		font-size: var(--fs-s);
		font-weight: 600;
		box-shadow: 0 1px 2px rgb(15 34 56 / 0.08);
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		background: var(--navy);
		border-color: var(--navy);
		color: #fff;
	}
	.chip[aria-pressed='true']::before {
		content: '✓';
		font-weight: 800;
		color: var(--yellow);
	}
	:global([data-theme='dark']) .chip[aria-pressed='true'] {
		background: var(--yellow);
		border-color: var(--yellow);
		color: var(--navy);
	}
	:global([data-theme='dark']) .chip[aria-pressed='true']::before {
		color: var(--navy);
	}
	.chip.reset {
		border-style: dashed;
	}
	.hint {
		margin: 0;
		padding: var(--sp-2) var(--sp-3);
		font-size: var(--fs-xs);
		color: var(--ink-2);
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		border-radius: var(--radius-s);
	}
	.list {
		display: none;
	}
	.panel.open {
		pointer-events: auto;
		background: var(--paper);
		z-index: 8;
	}
	.panel.open .list {
		display: block;
		overflow: auto;
		flex: 1;
		margin: 0 calc(-1 * var(--sp-3));
		padding: 0 var(--sp-3) calc(var(--sp-8) + var(--sp-4));
	}
	.state {
		margin: var(--sp-2) 0;
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.list ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.list a:not(.suggest) {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		min-height: 60px;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-s);
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
	}
	.list a:hover {
		background: var(--surface-2);
	}
	.t {
		display: grid;
		min-width: 0;
	}
	.t b {
		font-weight: 650;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.t small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.d {
		font-variant-numeric: tabular-nums;
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.suggest {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
		font-weight: 650;
	}
	.banner {
		position: absolute;
		z-index: 4;
		left: 50%;
		bottom: calc(var(--sp-4) + 64px);
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		width: max-content;
		max-width: calc(100% - 2 * var(--sp-4));
		margin: 0;
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--surface);
		box-shadow: var(--shadow);
		font-size: var(--fs-s);
	}
	.banner.err {
		bottom: calc(var(--sp-4) + 112px);
		border-left: 5px solid var(--danger);
	}
	.fabs {
		position: absolute;
		z-index: 9;
		right: var(--sp-3);
		bottom: var(--sp-3);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.fab {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		min-width: 52px;
		height: 52px;
		padding: 0 var(--sp-3);
		border: 0;
		border-radius: 999px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.fab.list-toggle {
		background: var(--navy);
		color: #fff;
		padding: 0 var(--sp-5);
	}
	:global([data-theme='dark']) .fab.list-toggle {
		background: var(--yellow);
		color: var(--navy);
	}
	.sheet {
		position: absolute;
		z-index: 7;
		left: var(--sp-2);
		right: var(--sp-2);
		bottom: calc(var(--sp-3) + 60px);
		padding: var(--sp-4) var(--sp-4) var(--sp-4);
		padding-right: calc(var(--sp-4) + 64px);
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow), 0 -2px 0 var(--yellow) inset;
		animation: up 0.22s ease-out;
	}
	@keyframes up {
		from {
			transform: translateY(16px);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet {
			animation: none;
		}
	}
	.sheet h2 {
		margin: var(--sp-1) 0 var(--sp-2);
		font-size: var(--fs-l);
		line-height: 1.15;
	}
	.kind {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin: 0;
		font-size: var(--fs-s);
		color: var(--ink-2);
		font-weight: 600;
	}
	.badge {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		margin: 0 0 var(--sp-3);
		padding: 0;
	}
	.tags li {
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		font-size: var(--fs-xs);
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.close {
		position: absolute;
		top: var(--sp-2);
		right: var(--sp-2);
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}

	@media (min-width: 960px) {
		.karte {
			height: calc(100dvh - var(--header-h));
			grid-template-columns: 400px minmax(0, 1fr);
		}
		.mapbox {
			grid-area: 1 / 2;
		}
		.panel {
			grid-area: 1 / 1;
			pointer-events: auto;
			background: var(--paper);
			border-right: 1px solid var(--line);
			padding: var(--sp-4);
			overflow: hidden;
		}
		.chips {
			flex-wrap: wrap;
			overflow: visible;
		}
		.list,
		.panel.open .list {
			display: block;
			overflow: auto;
			flex: 1;
			margin: 0 calc(-1 * var(--sp-4));
			padding: 0 var(--sp-4) var(--sp-5);
		}
		.list-toggle {
			display: none;
		}
		.fabs {
			bottom: 44px;
		}
		.sheet {
			left: var(--sp-4);
			right: auto;
			bottom: var(--sp-4);
			width: 380px;
		}
		.banner {
			bottom: var(--sp-4);
		}
	}
</style>
