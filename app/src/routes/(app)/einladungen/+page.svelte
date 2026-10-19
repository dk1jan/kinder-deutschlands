<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { KINDS } from '$lib/places';
	import { when } from '$lib/termin';
	let { data } = $props();
	const ANSWER: Record<string, string> = { ja: 'Zugesagt', nein: 'Abgesagt', vielleicht: 'Vielleicht' };
</script>

<svelte:head><title>Einladungen – Kinder Deutschlands</title></svelte:head>

<div class="container page wrap">
	<div class="head">
		<h1>Einladungen</h1>
		<a class="btn small signal" href="/einladungen/neu"><Icon name="plus" size={18} /> Neue Einladung</a>
	</div>
	<p class="lead">Kindergeburtstag, Spielenachmittag, Grillfest: Einladung mit Link verschicken, Zu- und Absagen sammeln – auch von Gästen ohne Konto. Gästeliste und Adresse bleiben privat.</p>

	<section>
		<h2>Meine Einladungen</h2>
		{#if data.own.length}
			<ul class="list">
				{#each data.own as i}
					<li><a href="/einladungen/{i.id}"><strong>{i.title}</strong>
						<small>{when(i.startsAt, null, false)}{i.status === 'abgesagt' ? ' · abgesagt' : ''}{!i.linkActive ? ' · Link aus' : ''}</small>
						<span class="counts">{i.ja} Zusagen · {i.vielleicht} vielleicht · {i.nein} Absagen</span></a></li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Noch keine Einladung angelegt.</p>
		{/if}
	</section>

	{#if data.guest.length}
		<section>
			<h2>Ich bin eingeladen</h2>
			<ul class="list">{#each data.guest as i}<li><div><strong>{i.title}</strong><small>{when(i.startsAt, null, false)} · {ANSWER[i.answer]}{i.status === 'abgesagt' ? ' · abgesagt' : ''}</small></div></li>{/each}</ul>
			<p class="muted small">Öffnen und ändern geht über den Link aus der Einladung.</p>
		</section>
	{/if}

	<section>
		<h2>Ideen{data.regionName ? ` in ${data.regionName}` : ''}</h2>
		{#if !data.regionName}
			<p class="muted">Trage im <a href="/profil/bearbeiten">Profil</a> deine Gegend ein, dann zeigen wir hier passende Orte und Termine.</p>
		{:else}
			{#if data.places.length}
				<h3>Orte aus der Familienkarte</h3>
				<ul class="ideas">{#each data.places as p}<li><a href="/orte/{p.id}">{p.name}</a> <small>{KINDS[p.kind as keyof typeof KINDS]?.label ?? p.kind}</small> · <a class="small" href="/einladungen/neu?ort={p.id}">hier einladen</a></li>{/each}</ul>
			{/if}
			{#if data.events.length}
				<h3>Workshops, Kurse und Feste</h3>
				<ul class="ideas">{#each data.events as e}<li><a href="/veranstaltungen/{e.id}?am={e.date}">{e.title}</a> <small>{when(e.start, null, false)}</small></li>{/each}</ul>
			{/if}
			{#if !data.places.length && !data.events.length}<p class="muted">Noch keine passenden Orte oder Termine in deiner Gegend eingetragen.</p>{/if}
			<p class="small"><a href="/karte">Alle Orte auf der Karte</a> · <a href="/veranstaltungen">Alle Veranstaltungen</a> · <a href="/angebote">Kurse mit freien Plätzen</a></p>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 52rem;
	}
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
	}
	h2 {
		font-size: var(--fs-l);
		margin: var(--sp-6) 0 var(--sp-3);
	}
	h3 {
		font-size: var(--fs-m);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.list a,
	.list li > div {
		display: grid;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		color: var(--ink);
		text-decoration: none;
		border-left: 6px solid var(--yellow);
	}
	.list small,
	.counts {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.ideas {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: var(--sp-1);
	}
	.ideas small {
		color: var(--ink-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
