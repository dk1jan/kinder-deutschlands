<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { page } from '$app/state';
	let { form } = $props();
	const weiter = page.url.searchParams.get('weiter');
</script>

<svelte:head><title>Bestätigungscode – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">

<h1>Bestätigungscode</h1>
<p>Gib den sechsstelligen Code aus deiner Authenticator-App ein.</p>

{#if form?.error}
	<Notice kind="error">{form.error}</Notice>
{/if}

<form method="POST" action={`?/verify${weiter ? `&weiter=${encodeURIComponent(weiter)}` : ''}`}>
	<div class="field">
		<label for="code">Code</label>
		<input id="code" name="code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code"
			pattern={'[0-9 ]{6,7}'} maxlength="7" required />
	</div>
	<button class="btn" type="submit">Bestätigen</button>
</form>
</div>

