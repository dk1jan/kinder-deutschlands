<script lang="ts">
	import { onMount } from 'svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { passkeyLogin, passkeySupported } from '$lib/passkey';
	let { form, data } = $props();
	const unverified = $derived(!!form && 'unverified' in form && !!form.unverified);
	let supported = $state(false);
	let pkError = $state('');
	let busy = $state(false);
	onMount(async () => (supported = await passkeySupported()));
	const q = $derived(data.next ? `&weiter=${encodeURIComponent(data.next)}` : '');

	async function withPasskey() {
		busy = true;
		pkError = '';
		try {
			location.href = await passkeyLogin(data.next);
		} catch (e) {
			pkError = e instanceof Error ? e.message : 'Anmeldung mit Passkey fehlgeschlagen.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Anmelden – Kinder Deutschlands</title></svelte:head>

<AuthShell title="Anmelden">
	{#if data.reset}<Notice kind="ok">Neues Passwort gespeichert. Bitte melde dich an.</Notice>{/if}
	{#if form?.resent}<Notice kind="ok">Falls das Konto noch nicht bestätigt war, ist ein neuer Link unterwegs.</Notice>{/if}
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if unverified && data.mailOpen}
		<form method="POST" action="?/erneut" class="resend">
			<input type="hidden" name="email" value={form?.email ?? ""} />
			<button class="btn small secondary" type="submit">Bestätigungs-E-Mail erneut senden</button>
		</form>
	{/if}

	{#if supported}
		<button class="btn signal wide" type="button" onclick={withPasskey} disabled={busy}>Mit Passkey anmelden</button>
		{#if pkError}<p class="err" role="alert">{pkError}</p>{/if}
		<p class="or"><span>oder mit Passwort</span></p>
	{/if}

	<form method="POST" action={`?/anmelden${q}`}>
		<div class="field">
			<label for="email">E-Mail-Adresse</label>
			<input id="email" name="email" type="email" autocomplete="username webauthn" required value={form?.email ?? ''}
				aria-invalid={form?.error && !unverified ? 'true' : undefined} />
		</div>
		<div class="field">
			<label for="password">Passwort</label>
			<input id="password" name="password" type="password" autocomplete="current-password" required />
		</div>
		<button class="btn wide" type="submit">Anmelden</button>
	</form>

	<p class="links">
		<a href="/passwort-vergessen">Passwort vergessen?</a>
		<span>Neu hier? <a href="/registrieren">Konto anlegen</a></span>
	</p>
</AuthShell>

<style>
	.wide {
		width: 100%;
	}
	.resend {
		margin: calc(-1 * var(--sp-2)) 0 var(--sp-5);
	}
	.or {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		color: var(--ink-2);
		font-size: var(--fs-s);
		margin: var(--sp-5) 0;
		max-width: none;
	}
	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--line);
	}
	.err {
		color: var(--danger);
		font-weight: 700;
		margin-top: var(--sp-2);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-5);
		font-size: var(--fs-s);
	}
</style>
