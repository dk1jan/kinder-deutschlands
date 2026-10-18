<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { KINDS } from '$lib/places';
	let { data } = $props();
	const status = { pruefung: 'wartet auf Prüfung', aktiv: 'freigegeben', abgelehnt: 'nicht übernommen', archiviert: 'archiviert', zusammengefuehrt: 'mit bestehendem Ort zusammengeführt' } as Record<string, string>;
</script>

<svelte:head><title>Meine Orte – Kinder Deutschlands</title></svelte:head>

<div class="page">
	<a class="back" href="/profil"><Icon name="zurueck" size={18} />Profil</a>
	<h1>Meine Orte</h1>

	<section aria-labelledby="fav">
		<h2 id="fav">Gemerkt</h2>
		{#if data.fav.length}
			<ul class="list">
				{#each data.fav as p}
					<li><a href="/orte/{p.id}"><span class="dot" style:background={KINDS[p.kind].color}></span><span><b>{p.name}</b><small>{KINDS[p.kind].label}{p.region ? ` · ${p.region}` : ''}</small></span></a></li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Noch nichts gemerkt. Tippe auf einem Ort auf „Merken“.</p>
		{/if}
		<a class="btn secondary" href="/karte"><Icon name="karte" size={18} />Zur Karte</a>
	</section>

	<section aria-labelledby="mine">
		<h2 id="mine">Meine Vorschläge</h2>
		{#if data.mine.length}
			<ul class="list">
				{#each data.mine as p}
					<li><a href="/orte/{p.id}"><span class="dot" style:background={KINDS[p.kind].color}></span><span><b>{p.name}</b><small>{KINDS[p.kind].label} · {status[p.status] ?? p.status}</small></span></a></li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Du hast noch keinen Ort vorgeschlagen.</p>
		{/if}
		<a class="btn secondary" href="/orte/neu"><Icon name="plus" size={18} />Ort vorschlagen</a>
	</section>
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
	section {
		margin-top: var(--sp-6);
	}
	.list {
		list-style: none;
		margin: 0 0 var(--sp-3);
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.list a {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 60px;
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-s);
		color: var(--ink);
		text-decoration: none;
	}
	.list a span:last-child {
		display: grid;
	}
	.list small {
		color: var(--ink-2);
	}
	.dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex: none;
	}
</style>
