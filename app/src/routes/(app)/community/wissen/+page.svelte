<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PostCard from '$lib/components/community/PostCard.svelte';
	let { data } = $props();
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '');
</script>

<svelte:head><title>Wissen – Community</title></svelte:head>

<div class="page">
	<a class="back" href="/community"><Icon name="zurueck" size={18} />Community</a>
	<header class="top"><h1>Wissen</h1>{#if data.editor}<a class="btn small secondary" href="/admin/wissen">Einträge pflegen</a>{/if}</header>
	<p class="lead">Von der Redaktion geprüfte Antworten mit Quellen und Prüfdatum – dazu gelöste Fragen und Tipps aus der Community.</p>
	<form method="GET" class="search">
		<input type="search" name="q" value={data.q ?? ''} placeholder="Im Wissen suchen" aria-label="Im Wissen suchen" />
		<select name="thema" aria-label="Thema"><option value="">Alle Themen</option>{#each data.topics as t}<option value={t.key} selected={data.topic === t.key}>{t.name}</option>{/each}</select>
		<button class="btn small">Suchen</button>
	</form>

	<section>
		<h2>Geprüfte Einträge</h2>
		{#if data.entries.length}
			<ul class="kn">
				{#each data.entries as k}
					<li><a href="/community/wissen/{k.slug}"><b>{k.title}</b><span>{k.summary}</span><small>{k.topic?.name ?? ''}{k.reviewedAt ? ` · geprüft ${fmt(k.reviewedAt)}` : ''}{k.visibility === 'oeffentlich' ? ' · öffentlich' : ''}</small></a></li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Noch keine geprüften Einträge{data.topic || data.q ? ' zu dieser Auswahl' : ''}. Die Redaktion erstellt sie nach und nach – auch aus hilfreichen Beiträgen, wenn die Verfassenden zustimmen.</p>
		{/if}
	</section>

	{#if data.member}
		<section>
			<h2>Gelöste Fragen und Tipps</h2>
			{#if data.solved.length}
				<ul class="feed">{#each data.solved as item (item.id)}<li><PostCard {item} /></li>{/each}</ul>
				<a href="/community?ansicht=geloest">Mehr</a>
			{:else}<p class="muted">Noch keine gelösten Fragen.</p>{/if}
		</section>
	{:else}
		<p class="muted">Gelöste Fragen aus der Community sehen angemeldete Mitglieder. <a href="/anmelden?weiter=/community/wissen">Anmelden</a></p>
	{/if}
</div>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.lead {
		color: var(--ink-2);
	}
	.search {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: var(--sp-2);
	}
	@media (max-width: 560px) {
		.search {
			grid-template-columns: 1fr;
		}
	}
	section {
		margin-top: var(--sp-6);
	}
	.kn,
	.feed {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.kn a {
		display: grid;
		gap: 4px;
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		color: var(--ink);
		text-decoration: none;
		border-left: 5px solid var(--sea);
	}
	.kn span {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.kn small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
</style>
