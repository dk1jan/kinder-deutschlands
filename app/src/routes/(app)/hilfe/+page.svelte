<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import CrisisBox from '$lib/components/alltag/CrisisBox.svelte';
	import { HELP_CATEGORIES, HELP_KINDS } from '$lib/alltag';
	let { data } = $props();
	const d = (x: string | Date) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
</script>

<svelte:head><title>Familien helfen Familien – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<div class="head">
		<h1>Familien helfen Familien</h1>
		{#if data.member}<a class="btn small signal" href="/hilfe/neu"><Icon name="plus" size={18} /> Eintrag schreiben</a>{/if}
	</div>
	<p class="lead">Ich brauche Hilfe – ich kann helfen: bei Anträgen, im Alltag, mit Kleidung, beim Ankommen in der Nachbarschaft. Hier teilen Eltern ihre <strong>Erfahrung</strong>; das ersetzt keine Fachberatung. Professionelle Beratung findest du bei <a href="/einrichtungen?art=beratung">verifizierten Beratungsstellen</a> und im <a href="/kompass">Lebenslagen-Kompass</a>.</p>
	<CrisisBox compact />

	{#if !data.member}
		<Notice kind="info" title="Nur für Mitglieder">Einträge sind nur für angemeldete Mitglieder sichtbar. <a href="/anmelden?weiter=/hilfe">Anmelden</a> oder <a href="/registrieren">Konto anlegen</a>.</Notice>
	{:else}
		<nav class="tabs" aria-label="Ansicht">
			<a href="?" aria-current={!data.mine ? 'page' : undefined}>Alle Einträge</a>
			<a href="?ansicht=meine" aria-current={data.mine ? 'page' : undefined}>Meine Einträge</a>
		</nav>
		{#if !data.mine}
			<form method="GET" class="ff">
				<fieldset class="pills"><legend class="vh">Art</legend>
					<label class="pill"><input type="radio" name="art" value="" checked={!data.filters.kind} /> alle</label>
					{#each Object.entries(HELP_KINDS) as [k, l]}<label class="pill"><input type="radio" name="art" value={k} checked={data.filters.kind === k} /> {l}</label>{/each}
				</fieldset>
				<div class="row1">
					<select name="thema" aria-label="Thema"><option value="">Alle Themen</option>{#each Object.entries(HELP_CATEGORIES) as [k, l]}<option value={k} selected={data.filters.category === k}>{l}</option>{/each}</select>
					<input type="search" name="q" value={data.filters.q} placeholder="Suche" aria-label="Suche" />
				</div>
				<div class="field"><label for="region">Gegend</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
				<div><button class="btn small">Anzeigen</button></div>
			</form>
		{/if}
		{#if data.items.length}
			<ul class="list">
				{#each data.items as h (h.id)}
					<li class={h.kind}><a href="/hilfe/{h.id}">
						<span class="tag">{HELP_KINDS[h.kind as keyof typeof HELP_KINDS]}</span>
						<strong>{h.title}</strong>
						{#if h.teaser}<span class="teaser">{h.teaser}</span>{/if}
						<small>{HELP_CATEGORIES[h.category as keyof typeof HELP_CATEGORIES]}{h.regionName ? ` · ${h.regionName}` : ''} · {d(h.createdAt)}{h.status !== 'offen' ? ` · ${h.status}` : ''}</small>
					</a></li>
				{/each}
			</ul>
		{:else}
			<p class="empty">{data.mine ? 'Du hast noch keine Einträge.' : 'Noch keine Einträge in dieser Gegend. Wer anfängt, macht es anderen leichter.'}</p>
		{/if}
		<p class="muted small">Kinderbetreuung durch fremde Personen vermitteln wir hier bewusst nicht – dafür gibt es geprüfte Wege, z. B. Kindertagespflege über das Jugendamt.</p>
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
		gap: var(--sp-1);
		margin: var(--sp-5) 0 var(--sp-3);
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
		max-width: 52rem;
		margin-bottom: var(--sp-4);
	}
	.row1 {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.row1 > * {
		flex: 1 1 12rem;
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
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
		max-width: 52rem;
	}
	.list a {
		display: grid;
		gap: 4px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
		border-left: 6px solid var(--yellow);
	}
	.list li.biete a {
		border-left-color: #1f7468;
	}
	.tag {
		justify-self: start;
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--yellow);
		color: var(--navy);
	}
	.list li.biete .tag {
		background: #1f7468;
		color: #fff;
	}
	.teaser {
		font-size: var(--fs-s);
	}
	small {
		color: var(--ink-2);
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
