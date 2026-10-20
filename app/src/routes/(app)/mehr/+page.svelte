<script lang="ts">
	import AreaTiles from '$lib/components/AreaTiles.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Mehr – Kinder Deutschlands</title></svelte:head>
<div class="container page">
	<h1>Alle Bereiche</h1>
	<AreaTiles member={!!data.user} compact />
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
