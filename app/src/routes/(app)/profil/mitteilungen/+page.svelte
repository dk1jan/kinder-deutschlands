<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Mitteilungen – Kinder Deutschlands</title></svelte:head>

<div class="page">
	<a class="back" href="/profil"><Icon name="zurueck" size={18} />Profil</a>
	<h1>Mitteilungen</h1>
	{#each data.restrictions as r}
		<div class="restr"><strong>{r.kind === 'stumm' ? `Eingeschränkt bis ${fmt(r.until)}` : 'Verwarnung'}</strong><span>{r.reason}</span><small>{fmt(r.created_at)}</small></div>
	{/each}
	{#if data.items.length}
		<ul class="list">
			{#each data.items as n}
				<li class:unread={!n.read_at}>
					{#if n.link}<a href={n.link}>{n.text}</a>{:else}<span>{n.text}</span>{/if}
					<small>{fmt(n.created_at)}</small>
				</li>
			{/each}
		</ul>
		<form method="POST" action="?/leeren"><button class="btn small secondary">Alle löschen</button></form>
	{:else}
		<p class="muted">Keine Mitteilungen. Hier erscheinen Antworten auf deine Beiträge, Gruppenaufnahmen und Entscheidungen der Moderation.</p>
	{/if}
</div>

<style>
	.page {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 2px;
		margin-bottom: var(--sp-4);
	}
	.list li {
		display: grid;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.list li.unread {
		box-shadow: inset 4px 0 0 var(--yellow);
		font-weight: 650;
	}
	.list small,
	.restr small {
		color: var(--ink-2);
		font-weight: 400;
	}
	.restr {
		display: grid;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		border-left: 5px solid var(--warn);
		background: var(--surface);
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
		margin-bottom: var(--sp-3);
	}
</style>
