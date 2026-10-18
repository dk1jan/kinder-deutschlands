<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { GROUP_KIND_UI } from '$lib/community';
	let { data } = $props();
	const status = { aktiv: 'Mitglied', angefragt: 'Anfrage läuft', abgelehnt: 'nicht aufgenommen', entfernt: 'entfernt' } as Record<string, string>;
</script>

<svelte:head><title>Gruppen – Community</title></svelte:head>

<div class="page">
	<a class="back" href="/community"><Icon name="zurueck" size={18} />Community</a>
	<header class="top">
		<h1>Gruppen</h1>
		{#if data.mayCreate}<a class="btn small secondary" href="/admin/gruppen">Gruppen verwalten</a>{/if}
	</header>
	<p class="lead">Offene Gruppen kann jedes Mitglied lesen. Bei geschützten Gruppen sehen nur aufgenommene Mitglieder Beiträge und Mitglieder – dort trittst du mit einem eigenen Gruppennamen auf, der nicht mit deinem Profil verknüpft ist. Deine Mitgliedschaften sieht niemand sonst.</p>
	{#if data.groups.length}
		<ul class="list">
			{#each data.groups as g}
				<li>
					<a href="/community/g/{g.slug}">
						<span class="kind k-{g.kind}">{GROUP_KIND_UI[g.kind].icon} {GROUP_KIND_UI[g.kind].label}</span>
						<b>{g.name}</b>
						<span class="d">{g.description}</span>
						<span class="m">{[g.topic, g.region, g.members !== null ? `${g.members < 5 ? 'wenige' : g.members} Mitglieder` : null].filter(Boolean).join(' · ')}{g.myStatus ? ` · ${status[g.myStatus]}` : ''}</span>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">Noch keine Gruppen. Die Moderation legt Gruppen an, sobald es Bedarf gibt – schreib gern einen Beitrag, welche Gruppe dir fehlt.</p>
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
		gap: var(--sp-3);
	}
	.lead {
		color: var(--ink-2);
	}
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.list a {
		display: grid;
		gap: 4px;
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		color: var(--ink);
		text-decoration: none;
	}
	.kind {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--ink-2);
	}
	.k-geschuetzt {
		color: var(--sea);
	}
	.d {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.m {
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
</style>
