<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Partnerlinks – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<h1>Partnerlinks</h1>
	{#if data.enabled}
		<p>Teilen Mitglieder in offenen Bereichen der Community einen Link zu <strong>amazon.de</strong>, ergänzen wir beim Anzeigen die Partnerkennung von Kinder Deutschlands. Kauft jemand über so einen Link ein, kann Kinder Deutschlands eine Provision erhalten – nach den Regeln des Partnerprogramms, nicht pro Klick. Ob und wie sich der Preis für dich ändert, legt Amazon fest; wir versprechen hier nichts.</p>
	{:else}
		<p>Partnerlinks sind derzeit <strong>ausgeschaltet</strong>. Links werden unverändert angezeigt.</p>
	{/if}
	<h2>Unsere Regeln</h2>
	<ul>
		<li>Gespeichert wird immer der Link, den das Mitglied geteilt hat. Ergänzt wird nur beim Anzeigen – und solche Links sind mit „Partnerlink“ gekennzeichnet.</li>
		<li>Enthält ein Link schon die Partnerkennung einer anderen Person oder Seite, ändern wir ihn <strong>nicht</strong> und kennzeichnen ihn als „fremder Partnerlink“.</li>
		<li>Keine Partnerlinks in privaten Chats, in geschützten Gruppen, im Marktplatz und in Einladungen.</li>
		<li>Profitieren kann nur Kinder Deutschlands als Betreiber, nicht die Person, die den Link teilt. Erfahrungen bleiben Erfahrungen: Werbung und Anbieterbeiträge werden getrennt gekennzeichnet.</li>
		<li>Wir geben keine Daten über dich an Amazon weiter. Was beim Aufruf von amazon.de passiert, regelt Amazon.</li>
	</ul>
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	li {
		margin-bottom: var(--sp-2);
	}
</style>
