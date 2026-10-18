<script lang="ts">
	import Pennant from '$lib/components/Pennant.svelte';
</script>

<svelte:head><title>Entdecken – Kinder Deutschlands</title></svelte:head>

<header class="hero">
	<Pennant size={56} />
	<h1>Familien in Bremen und Niedersachsen verbinden – ohne Telefonnummer, ohne Adresse.</h1>
	<p>
		Kinder Deutschlands wird ein geschütztes Netzwerk für Eltern: Kontakt über eine eigene ID, eine gemeinsame
		Familienkarte, Veranstaltungen, Hilfe und ein Marktplatz.
	</p>
</header>

<section aria-labelledby="stand">
	<h2 id="stand">Was heute schon geht</h2>
	<p>
		Die Plattform wird gerade aufgebaut. Fertig ist das Fundament: sichere Anmeldung, Rechteverwaltung und das
		Regionsmodell. Als Nächstes folgen Mitglieds-ID mit QR-Kontakt, dann Karte und Spielplätze mit echten Daten.
	</p>
	<p class="muted">Hier erscheint dann „Was machen wir heute?“ – Suche nach Ort, Datum, Alter, drinnen/draußen und Budget.</p>
</section>

<style>
	.hero {
		margin-bottom: var(--sp-6);
	}
	.hero :global(svg) {
		margin-bottom: var(--sp-3);
	}
	.hero h1 {
		font-size: var(--fs-2xl);
		max-width: 18ch;
	}
	@media (min-width: 900px) {
		.hero h1 {
			font-size: var(--fs-3xl);
		}
	}
</style>
