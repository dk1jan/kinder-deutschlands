<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>E-Mail bestätigen – Kinder Deutschlands</title></svelte:head>

<AuthShell title="E-Mail bestätigen">
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if data.valid}
		<p>Ein Klick noch, dann ist dein Konto freigeschaltet und deine Familien-ID bereit.</p>
		<form method="POST">
			<input type="hidden" name="t" value={data.token} />
			<button class="btn signal" type="submit">Konto freischalten</button>
		</form>
	{:else if !form?.error}
		<Notice kind="warn" title="Link ungültig">Dieser Link ist abgelaufen oder wurde schon benutzt.</Notice>
		<p>Bei der <a href="/anmelden">Anmeldung</a> kannst du dir einen neuen Link schicken lassen.</p>
	{/if}
</AuthShell>
