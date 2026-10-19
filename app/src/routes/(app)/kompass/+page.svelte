<script lang="ts">
	import CrisisBox from '$lib/components/alltag/CrisisBox.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Lebenslagen-Kompass – Kinder Deutschlands</title>
	<meta name="description" content="Schwangerschaft, Geburt, Kita-Start, Schule, Trennung, wenig Geld: Schritte, offizielle Informationen, Beratung und Austausch." />
</svelte:head>

<div class="container page">
	<h1>Lebenslagen-Kompass</h1>
	<p class="lead">Was ist jetzt zu tun, wer hilft weiter, wer erlebt gerade dasselbe? Schritte und Informationen aus offiziellen Quellen, Beratungsstellen in deiner Gegend und Austausch mit anderen Familien.</p>
	<p class="muted small">Deine Auswahl wird nicht gespeichert – weder im Konto noch für Werbung.</p>
	<ul class="grid">
		{#each data.situations as s}
			<li><a href="/kompass/{s.key}"><strong>{s.title}</strong><span>{s.intro}</span></a></li>
		{/each}
	</ul>
	<CrisisBox compact />
</div>

<style>
	.lead {
		color: var(--ink-2);
		max-width: 48rem;
	}
	.grid {
		list-style: none;
		margin: var(--sp-5) 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
	}
	.grid a {
		display: grid;
		gap: var(--sp-2);
		height: 100%;
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		border-top: 6px solid var(--yellow);
		color: var(--ink);
		text-decoration: none;
	}
	.grid strong {
		font-size: var(--fs-m);
	}
	.grid span {
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
