<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>E-Mail-Adresse bestätigen – Kinder Deutschlands</title></svelte:head>
<div class="container page narrow">
	<h1>Neue E-Mail-Adresse bestätigen</h1>
	{#if form?.ok}
		<Notice kind="ok" title="Geändert">Ab jetzt nutzen wir die neue Adresse. Die alte Adresse hat eine Benachrichtigung bekommen.</Notice>
		<p><a class="btn" href="/profil">Zu Mein Konto</a></p>
	{:else if form?.error}
		<Notice kind="error">{form.error}</Notice>
	{:else if data.valid}
		<form method="POST"><input type="hidden" name="t" value={data.token} /><button class="btn signal">Adresse bestätigen</button></form>
	{:else}
		<Notice kind="error">Dieser Link ist abgelaufen oder wurde schon benutzt.</Notice>
	{/if}
</div>

<style>
	.narrow {
		max-width: 36rem;
	}
</style>
