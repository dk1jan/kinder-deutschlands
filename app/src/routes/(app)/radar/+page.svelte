<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Familienradar – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<h1>Familienradar</h1>
	<p class="lead">Was in deiner Region für deine Kinder neu ist: Veranstaltungen, freie Plätze, Hinweise und Fristen – mit Quelle und Datum. Privat: Niemand sieht, was du abonniert hast.</p>
	{#if data.profiles.length}
		<ul class="list">
			{#each data.profiles as p}
				<li><a href="/radar/{p.id}">
					<strong>{p.name}{p.paused ? ' (pausiert)' : ''}</strong>
					<small>{p.regions.length ? p.regions.join(', ') : 'Alle Regionen'} · {p.frequency}{p.channels.length ? ` · ${p.channels.join(' + ')}` : ''}</small>
				</a></li>
			{/each}
		</ul>
	{:else}
		<p class="muted">Noch kein Radar eingerichtet.</p>
	{/if}
	{#if data.profiles.length < 5}<p><a class="btn" href="/radar/neu">{data.profiles.length ? 'Weiteres Profil anlegen' : 'Radar einrichten'}</a></p>{/if}
	<p class="muted small">Mehrere Profile, z. B. für Wohnort und Großeltern. Jedes lässt sich pausieren oder löschen.</p>
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.lead {
		color: var(--ink-2);
	}
	.list {
		list-style: none;
		margin: 0 0 var(--sp-4);
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.list a {
		display: grid;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		text-decoration: none;
		color: var(--ink);
		border-left: 6px solid var(--yellow);
	}
	.list small {
		color: var(--ink-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
