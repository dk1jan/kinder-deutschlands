<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import InvitationForm from '$lib/components/alltag/InvitationForm.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Neue Einladung – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/einladungen"><Icon name="zurueck" size={18} />Einladungen</a>
	<h1>Neue Einladung</h1>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}<InvitationForm values={form?.values ?? {}} place={data.place} submit="Einladung anlegen" />{/key}
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
