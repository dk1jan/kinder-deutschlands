<script lang="ts">
	import Planned from '$lib/components/Planned.svelte';
	import RegionMap from '$lib/components/art/RegionMap.svelte';
</script>

<svelte:head><title>Karte – Kinder Deutschlands</title></svelte:head>

<Planned
	title="Die Familienkarte"
	module="M10, M11, M13, M23"
	stage="Bauabschnitt 2"
	theme="yellow"
	text="Spielplätze, Wickelräume, Familiencafés und Ausflugsorte auf einer gemeinsamen Karte. Zuerst für Bremen, mit eigenen Kartenservern statt Google."
	points={[
		'Spielplätze mit Ausstattung: Schatten, Toiletten, Zaun, Wasserspiel, Kinderwagenzugang',
		'Quelle und Stand an jedem Ort, Hinweise auf Sperrungen klar als amtlich oder von Eltern gekennzeichnet',
		'Umkreissuche, Filter, Wechsel zwischen Karte und Liste',
		'Mitglieder bleiben unsichtbar, außer du gibst grob deinen Stadtteil frei'
	]}
>
	{#snippet art()}<RegionMap />{/snippet}
</Planned>
