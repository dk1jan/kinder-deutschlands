<script lang="ts">
	import { page } from '$app/state';
	import Pennant from '$lib/components/Pennant.svelte';
</script>

<svelte:head><title>{page.status} – Kinder Deutschlands</title></svelte:head>

<main class="err">
	<Pennant size={40} />
	<h1>{page.status === 404 ? 'Seite nicht gefunden' : page.status === 403 ? 'Kein Zugriff' : 'Fehler'}</h1>
	<p>{page.error?.message}</p>
	<p><a href="/">Zur Startseite</a></p>
</main>

<style>
	.err {
		max-width: 36rem;
		margin: 0 auto;
		padding: var(--sp-7) var(--sp-4);
	}
</style>
