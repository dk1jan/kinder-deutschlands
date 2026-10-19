<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RadarForm from '$lib/components/angebote/RadarForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Familienradar einrichten – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/radar"><Icon name="zurueck" size={18} />Familienradar</a>
	<h1>Radar einrichten</h1>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}
		<RadarForm values={form?.values ?? { name: [data.regions[0]?.name ?? 'Mein Radar'] }} regions={form?.regions ?? data.regions} include={data.include} frequencies={data.frequencies} mail={data.mail} submit="Radar speichern" />
	{/key}
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
</style>
