<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import NavChooser from '$lib/components/NavChooser.svelte';
	import ReportBox from '$lib/components/community/ReportBox.svelte';
	import { AVAILABILITY, OFFER_KINDS, ageLabel } from '$lib/angebote';

	let { data, form } = $props();
	const o = $derived(data.offer);
	const saved = $derived(form && 'saved' in form ? !!form.saved : data.saved);
	const age = $derived(ageLabel(o.ageMin, o.ageMax));
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
</script>

<svelte:head><title>{o.title} – Kinder Deutschlands</title></svelte:head>

<article class="of">
	<a class="back" href="/angebote"><Icon name="zurueck" size={18} />Freie Plätze & Kurse</a>
	<p class="kind">{OFFER_KINDS[o.kind as keyof typeof OFFER_KINDS] ?? o.kind}</p>
	<h1>{o.title}</h1>
	<p class="org"><Icon name="ok" size={18} /> <a href="/einrichtungen/{o.org.slug}">{o.org.name}</a></p>
	{#if o.status !== 'aktiv'}<Notice kind="warn" title="Beendet">Dieses Angebot läuft nicht mehr.</Notice>{/if}
	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'confirmed' in form}<Notice kind="ok">Verfügbarkeit bestätigt.</Notice>{/if}
	{#if form && 'reported' in form}<Notice kind="ok">Danke, die Moderation schaut es sich an.</Notice>{/if}

	<div class="avbox {o.availability}">
		<strong>{AVAILABILITY[o.availability]}{o.placesCount !== null ? ` · ${o.placesCount} ${o.placesCount === 1 ? 'Platz' : 'Plätze'}` : ''}</strong>
		{#if o.availability !== 'unbekannt' && o.confirmedAt}<span>Laut {o.org.name}, Stand {fmt(o.confirmedAt)} · gilt bis {fmt(o.validUntil!)}</span>
		{:else}<span>Keine aktuelle Angabe der Einrichtung{o.confirmedAt ? ` (letzte Bestätigung ${fmt(o.confirmedAt)} ist abgelaufen)` : ''}. Bitte direkt nachfragen.</span>{/if}
	</div>

	<div class="acts">
		{#if data.member}
			<form method="POST" action="?/merken" use:enhance><button class="btn small" class:secondary={!saved} aria-pressed={saved}>{saved ? 'Gemerkt' : 'Merken'}</button></form>
		{:else}<a class="btn small secondary" href="/anmelden?weiter=/angebote/{o.id}">Merken</a>{/if}
		{#if o.lat !== null && o.lon !== null}<NavChooser lat={o.lat} lon={o.lon} name={o.title} />{/if}
		{#if o.registrationUrl}<a class="btn small" href={o.registrationUrl} rel="noopener nofollow" target="_blank">Anmelden beim Anbieter <Icon name="extern" size={14} /></a>{/if}
	</div>

	<section class="card">
		{#if o.description}<p class="desc">{o.description}</p>{/if}
		<dl class="facts">
			{#if o.scheduleText}<div><dt>Wann</dt><dd>{o.scheduleText}</dd></div>{/if}
			{#if o.startsOn}<div><dt>Beginn</dt><dd>{new Date(o.startsOn).toLocaleDateString('de-DE')}</dd></div>{/if}
			{#if age}<div><dt>Alter</dt><dd>{age}</dd></div>{/if}
			{#if o.costText}<div><dt>Kosten</dt><dd>{o.costText}</dd></div>{/if}
			{#if o.freikarte}<div><dt>FreiKarte</dt><dd>vom Anbieter bestätigt</dd></div>{/if}
			{#if o.address || o.regionName}<div><dt>Ort</dt><dd>{[o.address, o.regionName].filter(Boolean).join(', ')}</dd></div>{/if}
			{#if o.contact}<div><dt>Kontakt</dt><dd>{o.contact}</dd></div>{/if}
		</dl>
		<p class="muted small">Anmeldung und Vertrag laufen direkt über die Einrichtung.</p>
	</section>

	{#if data.editor && o.status === 'aktiv'}
		<section class="card">
			<h2>Verfügbarkeit bestätigen</h2>
			<form method="POST" action="?/verfuegbarkeit" class="inline">
				<select name="availability" aria-label="Verfügbarkeit">{#each Object.entries(AVAILABILITY).filter(([k]) => k !== 'unbekannt') as [k, l]}<option value={k} selected={o.stored === k}>{l}</option>{/each}</select>
				<input name="places" type="number" min="0" max="9999" placeholder="Anzahl (optional)" aria-label="Anzahl" />
				<select name="days" aria-label="Gültig für">{#each data.validDays as d}<option value={d} selected={d === 7}>gilt {d} Tage</option>{/each}</select>
				<button class="btn small">Bestätigen</button>
			</form>
			<p><a href="/einrichtungen/verwalten/{o.org.slug}?tab=angebote&angebot={o.id}#angebot-form">Angebot bearbeiten</a></p>
		</section>
	{:else if data.member}
		<ReportBox action="?/melden" type="offer" id={o.id} label="Angebot melden" />
	{/if}
</article>

<style>
	.of {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-3);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.kind {
		margin: var(--sp-2) 0 0;
		color: var(--ink-2);
		font-weight: 650;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.8rem, 1.2rem + 2.5vw, 2.6rem);
		line-height: 1.05;
	}
	.org {
		display: flex;
		gap: 6px;
		align-items: center;
		margin: 0;
		font-weight: 650;
	}
	.avbox {
		display: grid;
		gap: 4px;
		padding: var(--sp-4);
		border-radius: var(--radius-m);
		background: var(--surface);
		border-left: 8px solid var(--line);
	}
	.avbox.frei {
		border-left-color: #1f7468;
	}
	.avbox.wenige {
		border-left-color: var(--yellow);
	}
	.avbox.warteliste,
	.avbox.ausgebucht {
		border-left-color: #d63d31;
	}
	.avbox span {
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.acts .btn {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-5);
	}
	.card h2 {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-l);
	}
	.desc {
		white-space: pre-line;
	}
	.facts {
		display: grid;
		gap: var(--sp-2);
	}
	.facts div {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		gap: var(--sp-2);
	}
	.facts dt {
		color: var(--ink-2);
	}
	.facts dd {
		margin: 0;
	}
	.inline {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
