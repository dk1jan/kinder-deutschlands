<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import ListingCard from '$lib/components/alltag/ListingCard.svelte';
	import { MARKET_CATEGORIES, MARKET_KINDS, euro } from '$lib/alltag';

	let { data, form } = $props();
	let locating = $state(false);
	let locError = $state('');
	function nearMe() {
		if (!navigator.geolocation) return (locError = 'Dein Browser kann den Standort nicht bestimmen.');
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				locating = false;
				const u = new URLSearchParams(location.search);
				u.set('lat', pos.coords.latitude.toFixed(2));
				u.set('lon', pos.coords.longitude.toFixed(2));
				u.set('region', '');
				u.set('sort', 'naehe');
				goto(`?${u}`);
			},
			() => {
				locating = false;
				locError = 'Standort nicht freigegeben. Wähle stattdessen eine Gegend.';
			},
			{ maximumAge: 300_000, timeout: 10_000 }
		);
	}
</script>

<svelte:head><title>Marktplatz – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<div class="head">
		<h1>Marktplatz</h1>
		{#if data.member}<a class="btn small signal" href="/marktplatz/neu"><Icon name="plus" size={18} /> Anzeige aufgeben</a>{/if}
	</div>
	<p class="lead">Kinderwagen, Kleidung, Spielzeug – verkaufen, verschenken, tauschen, suchen. Von Familien für Familien in der Nähe. Kontakt über die Familien-ID, Übergabe vereinbart ihr selbst. Keine Bezahlung über uns.</p>

	{#if !data.member}
		<Notice kind="info" title="Nur für Mitglieder">Der Marktplatz ist nur für angemeldete Mitglieder sichtbar – so bleiben Anzeigen und Gegend privat. <a href="/anmelden?weiter=/marktplatz">Anmelden</a> oder <a href="/registrieren">Konto anlegen</a>.</Notice>
	{:else}
		<nav class="tabs" aria-label="Ansicht">
			<a href="?ansicht=alle" aria-current={data.view === 'alle' ? 'page' : undefined}>Alle Anzeigen</a>
			<a href="?ansicht=meine" aria-current={data.view === 'meine' ? 'page' : undefined}>Meine Anzeigen</a>
			<a href="?ansicht=suchen" aria-current={data.view === 'suchen' ? 'page' : undefined}>Suchaufträge ({data.searches.length})</a>
		</nav>
		{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
		{#if form && 'saved' in form}<Notice kind="ok">Suchauftrag gespeichert. Neue passende Anzeigen erscheinen in deinen Mitteilungen.</Notice>{/if}

		{#if data.view === 'alle'}
			<form method="GET" class="ff">
				<input type="hidden" name="ansicht" value="alle" />
				<div class="row1">
					<input type="search" name="q" value={data.filters.q} placeholder="Was suchst du? z. B. Laufrad" aria-label="Suche" />
					<select name="kategorie" aria-label="Kategorie"><option value="">Alle Kategorien</option>{#each Object.entries(MARKET_CATEGORIES) as [k, l]}<option value={k} selected={data.filters.category === k}>{l}</option>{/each}</select>
				</div>
				<div class="field"><label for="region">Gegend</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
				<p class="near"><button type="button" class="btn small secondary" onclick={nearMe} disabled={locating}><Icon name="standort" size={18} /> {locating ? 'Suche …' : 'In meiner Nähe'}</button>
					{#if data.near}<label class="km">Umkreis <select name="km">{#each [2, 5, 10, 25, 50] as k}<option value={k} selected={data.filters.km === k}>{k} km</option>{/each}</select></label>{/if}
					{#if locError}<span class="muted small" role="status">{locError}</span>{/if}</p>
				{#if data.near}<input type="hidden" name="lat" value={page.url.searchParams.get('lat') ?? ''} /><input type="hidden" name="lon" value={page.url.searchParams.get('lon') ?? ''} />{/if}
				<fieldset class="pills"><legend class="vh">Art</legend>{#each Object.entries(MARKET_KINDS) as [k, l]}<label class="pill"><input type="checkbox" name="art" value={k} checked={data.filters.kinds.includes(k)} /> {l}</label>{/each}</fieldset>
				<div class="row1">
					<input name="maxpreis" value={data.filters.maxpreis} inputmode="decimal" placeholder="Höchstpreis €" aria-label="Höchstpreis in Euro" />
					<select name="sort" aria-label="Sortierung"><option value="neu" selected={data.filters.sort === 'neu'}>Neueste zuerst</option><option value="preis" selected={data.filters.sort === 'preis'}>Günstigste zuerst</option>{#if data.near}<option value="naehe" selected={data.filters.sort === 'naehe'}>Nächste zuerst</option>{/if}</select>
					<button class="btn small">Suchen</button>
				</div>
				<button class="linkbtn" formmethod="POST" formaction="?/suchauftrag">Diese Suche als Suchauftrag speichern</button>
			</form>
		{/if}

		{#if data.view === 'suchen'}
			<p class="muted">Bei neuen passenden Anzeigen bekommst du eine Mitteilung (Push nur, wenn unter <a href="/profil/benachrichtigungen">Benachrichtigungen</a> eingeschaltet). Neue Suchaufträge legst du über die Suche unter „Alle Anzeigen“ an.</p>
			<ul class="searches">
				{#each data.searches as s}
					<li><span>{[s.q ? `„${s.q}“` : null, s.category ? MARKET_CATEGORIES[s.category as keyof typeof MARKET_CATEGORIES] : null, s.regionName, s.kinds.map((k) => MARKET_KINDS[k as keyof typeof MARKET_KINDS]).join('/') || null, s.maxPriceCents !== null ? `bis ${euro(s.maxPriceCents)}` : null].filter(Boolean).join(' · ')}</span>
						<form method="POST" action="?/suchauftragLoeschen"><input type="hidden" name="id" value={s.id} /><button class="linkbtn">löschen</button></form></li>
				{:else}<li class="muted">Noch keine Suchaufträge.</li>{/each}
			</ul>
		{:else if data.items.length}
			<div class="grid">{#each data.items as l (l.id)}<ListingCard {l} />{/each}</div>
		{:else}
			<p class="empty">{data.view === 'meine' ? 'Du hast noch keine Anzeigen.' : 'Keine Anzeigen gefunden. Der Marktplatz lebt von echten Familien – gib gern die erste Anzeige in deiner Gegend auf.'}</p>
		{/if}
		<p class="muted small">Sicher handeln: Ware vor Ort ansehen, nicht vorab überweisen, keine Ausweis- oder Kontodaten schicken. Verdächtiges bitte melden.</p>
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
	.head h1 {
		margin: 0;
	}
	.head .btn {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.lead {
		color: var(--ink-2);
		max-width: 48rem;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		margin: var(--sp-4) 0;
		border-bottom: 2px solid var(--line);
	}
	.tabs a {
		padding: var(--sp-2) var(--sp-3);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 700;
		border-bottom: 4px solid transparent;
		margin-bottom: -2px;
	}
	.tabs a[aria-current='page'] {
		color: var(--ink);
		border-bottom-color: var(--yellow);
	}
	.ff {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		max-width: 56rem;
		margin-bottom: var(--sp-5);
	}
	.row1 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.row1 > input,
	.row1 > select {
		flex: 1 1 12rem;
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
	.km {
		display: inline-flex;
		gap: var(--sp-1);
		align-items: center;
	}
	.pills {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.vh {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
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
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
	}
	.searches {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
		max-width: 44rem;
	}
	.searches li {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-m);
	}
	.linkbtn {
		background: none;
		border: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		font-size: var(--fs-s);
		cursor: pointer;
		justify-self: start;
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
