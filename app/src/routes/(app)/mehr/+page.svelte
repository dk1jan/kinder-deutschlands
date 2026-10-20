<script lang="ts">
	// Rückfallseite des Menüs (ohne JavaScript) und Ziel von „Wissen“ (F-016).
	import AreaTiles from '$lib/components/AreaTiles.svelte';
	import { GROUPS } from '$lib/areas';
	let { data } = $props();
</script>

<svelte:head><title>Mehr – Kinder Deutschlands</title></svelte:head>
<div class="container page">
	<h1>Alle Bereiche</h1>
	{#each GROUPS as g (g.id)}
		<h2 id={g.id}>{#if g.id === 'wissen'}{g.label}{:else}<a href={g.href}>{g.label}</a>{/if}</h2>
		<AreaTiles group={g.id} member={!!data.user} compact />
	{/each}
	<h2>Konto und Infos</h2>
	<ul class="links">
		{#if data.user}<li><a href="/profil">Mein Konto</a></li><li><a href="/profil/mitteilungen">Mitteilungen</a></li>{:else}<li><a href="/anmelden">Anmelden</a></li>{/if}
		<li><a href="/impressum">Impressum</a></li>
		<li><a href="/datenschutz">Datenschutz</a></li>
		<li><a href="/partnerlinks">Partnerlinks</a></li>
		<li><a href="/karte/quellen">Datenquellen</a></li>
	</ul>
</div>

<style>
	h2 {
		margin-top: var(--sp-6);
		font-size: var(--fs-l);
		scroll-margin-top: calc(var(--header-h) + var(--sp-3));
	}
	h2 a {
		color: inherit;
	}
	.links {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-1);
	}
	.links a {
		display: block;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-s);
		color: var(--ink);
		text-decoration: none;
		font-weight: 600;
	}
</style>
