<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	let { data, form } = $props();
	const on = (key: string) => data.subs.some((s) => s.kind === 'topic' && s.key === key);
	const regions = $derived(data.subs.filter((s) => s.kind === 'region'));
</script>

<svelte:head><title>Abos – Community</title></svelte:head>

<div class="page">
	<a class="back" href="/community"><Icon name="zurueck" size={18} />Community</a>
	<h1>Meine Abos</h1>
	<p class="lead">Dein Feed „Für dich“ zeigt Beiträge aus abonnierten Themen und Regionen. Eine Region schließt alle Orte darin ein – „Bremen“ also auch Findorff, Neustadt usw. Ein Abo heißt nicht, dass du dort wohnst; das sieht auch niemand.</p>
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

	<section>
		<h2>Themen</h2>
		<ul class="topics">
			{#each data.topics as t}
				<li>
					<form method="POST" action="?/setzen" use:enhance>
						<input type="hidden" name="kind" value="topic" /><input type="hidden" name="key" value={t.key} /><input type="hidden" name="on" value={on(t.key) ? '0' : '1'} />
						<button type="submit" aria-pressed={on(t.key)}><b>{on(t.key) ? '✓ ' : ''}{t.name}</b><small>{t.description}</small></button>
					</form>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Regionen</h2>
		{#if regions.length}
			<ul class="regions">
				{#each regions as r}
					<li><span>📍 {r.name}</span>
						<form method="POST" action="?/setzen" use:enhance><input type="hidden" name="kind" value="region" /><input type="hidden" name="key" value={r.key} /><input type="hidden" name="on" value="0" /><button class="btn small secondary">Entfernen</button></form>
					</li>
				{/each}
			</ul>
		{:else}<p class="muted">Noch keine Region abonniert.</p>{/if}
		<form method="POST" action="?/setzen" use:enhance class="add">
			<input type="hidden" name="kind" value="region" /><input type="hidden" name="on" value="1" />
			<label for="reg">Region hinzufügen</label>
			<RegionPicker id="reg" name="key" />
			<button class="btn small">Abonnieren</button>
		</form>
	</section>
</div>

<style>
	.page {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.lead {
		color: var(--ink-2);
	}
	section {
		margin-top: var(--sp-6);
	}
	.topics {
		list-style: none;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--sp-2);
	}
	.topics button {
		display: grid;
		gap: 4px;
		width: 100%;
		height: 100%;
		text-align: left;
		padding: var(--sp-3) var(--sp-4);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-m);
		background: var(--surface);
		font: inherit;
		color: var(--ink);
		cursor: pointer;
	}
	.topics button[aria-pressed='true'] {
		border-color: var(--sea);
		box-shadow: inset 0 0 0 1.5px var(--sea);
	}
	.topics small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
	.regions {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.regions li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.add {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
		max-width: 28rem;
	}
	.add label {
		font-weight: 700;
	}
</style>
