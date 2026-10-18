<script lang="ts">
	import Planned from '$lib/components/Planned.svelte';
	import ModuleArt from '$lib/components/art/ModuleArt.svelte';
</script>

<svelte:head><title>Nachrichten – Kinder Deutschlands</title></svelte:head>

<Planned
	title="Schreiben und anrufen"
	module="M02, M06"
	stage="Bauabschnitt 4, Anrufe in Bauabschnitt 7"
	theme="sea"
	text="Nachrichten, Gruppen-Chats und Anrufe über die Familien-ID, ohne Telefonnummer oder E-Mail-Adresse weiterzugeben."
	points={[
		'Ende-zu-Ende-verschlüsselt: auch die Betreiber lesen nicht mit',
		'Kontaktanfragen annehmen, ablehnen oder blockieren',
		'Treffpunkt teilen, Live-Standort nur für 15, 30 oder 60 Minuten und jederzeit stoppbar',
		'Ruhezeiten, Stummschalten, Lesebestätigung nur wenn du willst'
	]}
>
	{#snippet art()}<ModuleArt name="nachrichten" />{/snippet}
</Planned>
