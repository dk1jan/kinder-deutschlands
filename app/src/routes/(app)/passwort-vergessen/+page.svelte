<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Passwort vergessen – Kinder Deutschlands</title></svelte:head>

<AuthShell title="Passwort vergessen" lead="Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.">
	{#if form?.sent}
		<Notice kind="ok" title="E-Mail unterwegs">
			Wenn es zu dieser Adresse ein Konto gibt, kommt gleich eine E-Mail mit dem Link. Er gilt eine Stunde.
		</Notice>
	{:else if !data.open}
		<Notice kind="info">Der E-Mail-Versand ist noch nicht eingerichtet. Wende dich an die Betreiber.</Notice>
	{:else}
		{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
		<form method="POST">
			<div class="field">
				<label for="email">E-Mail-Adresse</label>
				<input id="email" name="email" type="email" autocomplete="email" required value={form && 'email' in form ? form.email : ''} />
			</div>
			<button class="btn" type="submit">Link schicken</button>
		</form>
	{/if}
	<p class="muted back"><a href="/anmelden">Zurück zur Anmeldung</a></p>
</AuthShell>

<style>
	.back {
		margin-top: var(--sp-5);
	}
</style>
