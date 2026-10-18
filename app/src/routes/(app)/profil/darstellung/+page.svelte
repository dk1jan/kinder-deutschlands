<script lang="ts">
	import { enhance } from '$app/forms';
	import Notice from '$lib/components/Notice.svelte';
	import { applyTheme } from '$lib/theme';
	let { data, form } = $props();
	// Startwert aus dem Server, danach lokal geführt
	// svelte-ignore state_referenced_locally
	let current = $state(data.theme);
	const options = [
		{ value: 'system', label: 'Wie das Gerät', hint: 'Folgt der Einstellung von Handy oder Computer.' },
		{ value: 'light', label: 'Hell', hint: '' },
		{ value: 'dark', label: 'Dunkel', hint: '' }
	];
</script>

<svelte:head><title>Darstellung – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">

<p><a href="/profil">Zurück zum Profil</a></p>
<h1>Darstellung</h1>

{#if form?.saved}
	<Notice kind="ok">Darstellung gespeichert.</Notice>
{/if}

<form method="POST" use:enhance={() => {
	applyTheme(current);
	return async ({ update }) => update({ reset: false });
}}>
	<fieldset>
		<legend>Farbschema</legend>
		{#each options as o}
			<label class="option">
				<input type="radio" name="theme" value={o.value} bind:group={current} onchange={() => applyTheme(current)} />
				<span>
					<strong>{o.label}</strong>
					{#if o.hint}<small>{o.hint}</small>{/if}
				</span>
			</label>
		{/each}
	</fieldset>
	<button class="btn" type="submit">Speichern</button>
</form>
</div>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 var(--sp-5);
		display: grid;
		gap: var(--sp-2);
		max-width: 28rem;
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: var(--touch);
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-m);
		cursor: pointer;
	}
	.option:has(input:checked) {
		border-color: var(--ink);
		box-shadow: inset 4px 0 0 var(--yellow);
	}
	.option input {
		width: 1.25rem;
		height: 1.25rem;
		accent-color: var(--ink);
	}
	.option span {
		display: grid;
	}
	small {
		color: var(--ink-2);
	}
</style>
