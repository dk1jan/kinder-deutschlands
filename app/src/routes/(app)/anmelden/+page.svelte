<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { form, data } = $props();
</script>

<svelte:head><title>Anmelden – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">

<h1>Anmelden</h1>

{#if form?.error}
	<Notice kind="error">{form.error}</Notice>
{/if}

<form method="POST" action={data.next ? `?weiter=${encodeURIComponent(data.next)}` : undefined} class="auth">
	<div class="field">
		<label for="email">E-Mail-Adresse</label>
		<input id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''}
			aria-invalid={form?.error ? 'true' : undefined} />
	</div>
	<div class="field">
		<label for="password">Passwort</label>
		<input id="password" name="password" type="password" autocomplete="current-password" required />
	</div>
	<button class="btn" type="submit">Anmelden</button>
</form>

<p class="muted note">Die Registrierung für Mitglieder öffnet mit Abschnitt 1 (Mitglieds-ID und QR-Kontakt).</p>
</div>

<style>
	.auth {
		max-width: 26rem;
	}
	.note {
		margin-top: var(--sp-6);
		font-size: var(--fs-s);
	}
</style>
