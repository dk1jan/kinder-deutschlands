<script lang="ts">
	import ContactCard from '$lib/components/ContactCard.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data } = $props();
	let current = $state(0);
</script>

<svelte:head><title>So sehen andere mich – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<p><a href="/profil">Zurück zum Profil</a></p>
	<h1>So sehen andere dich</h1>
	{#if data.saved}<Notice kind="ok">Profil gespeichert.</Notice>{/if}

	<div class="tabs" role="tablist" aria-label="Ansicht wählen">
		{#each data.views as v, i}
			<button role="tab" type="button" id={`tab-${v.key}`} aria-selected={current === i} aria-controls={`panel-${v.key}`}
				tabindex={current === i ? 0 : -1} onclick={() => (current = i)}>{v.label}</button>
		{/each}
	</div>

	{#each data.views as v, i}
		<div id={`panel-${v.key}`} role="tabpanel" tabindex="0" aria-labelledby={`tab-${v.key}`} hidden={current !== i}>
			<p class="muted">{v.text}</p>
			<ContactCard card={v.card} />
		</div>
	{/each}

	<p class="edit"><a class="btn secondary" href="/profil/bearbeiten">Freigaben ändern</a></p>
</div>

<style>
	.tabs {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		padding: var(--sp-1);
		background: var(--surface-2);
		border-radius: 999px;
		margin: var(--sp-3) 0 var(--sp-5);
	}
	.tabs button {
		font: inherit;
		font-weight: 600;
		min-height: 44px;
		padding: 0 var(--sp-5);
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--ink-2);
		cursor: pointer;
	}
	.tabs button[aria-selected='true'] {
		background: var(--ink);
		color: var(--paper);
	}
	.edit {
		margin-top: var(--sp-6);
	}
</style>
