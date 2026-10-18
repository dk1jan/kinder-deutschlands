<script lang="ts">
	import Planned from '$lib/components/Planned.svelte';
	import ModuleArt from '$lib/components/art/ModuleArt.svelte';
</script>

<svelte:head><title>Community – Kinder Deutschlands</title></svelte:head>

<Planned
	title="Fragen und Gruppen"
	module="M03, M04, M07, M19"
	stage="Bauabschnitt 3"
	theme="sky"
	text="Austausch nach Region und Thema, in einem persönlichen Feed statt in hunderten Unterforen."
	points={[
		'Regionen und Themen frei kombinierbar abonnieren, zum Beispiel Bremen-Neustadt und Kita-Start',
		'Hilfreiche Antworten markieren, damit gute Erfahrungen auffindbar bleiben',
		'Geschützte Gruppen, etwa für Alleinerziehende: für Fremde unsichtbar, mit eigenem Gruppennamen',
		'Links von Instagram, YouTube und Co. als Vorschau ohne Tracker, Player erst nach deinem Klick'
	]}
>
	{#snippet art()}<ModuleArt name="community" />{/snippet}
</Planned>
