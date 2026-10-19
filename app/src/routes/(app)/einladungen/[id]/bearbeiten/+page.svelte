<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import InvitationForm from '$lib/components/alltag/InvitationForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Einladung bearbeiten – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/einladungen/{data.id}"><Icon name="zurueck" size={18} />{data.title}</a>
	<h1>Einladung bearbeiten</h1>
	<p class="muted">Ändern sich Zeit oder Ort, bekommen Gäste mit Konto eine Mitteilung.</p>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}<InvitationForm values={form?.values ?? data.values} place={data.place} submit="Speichern" />{/key}
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
