<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Neues Passwort – Kinder Deutschlands</title></svelte:head>

<AuthShell title="Neues Passwort">
	{#if !data.valid}
		<Notice kind="warn" title="Link ungültig">Dieser Link ist abgelaufen oder wurde schon benutzt.</Notice>
		<a class="btn secondary" href="/passwort-vergessen">Neuen Link anfordern</a>
	{:else}
		{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
		<form method="POST">
			<input type="hidden" name="t" value={data.token} />
			<div class="field">
				<label for="password">Neues Passwort</label>
				<span class="hint">Mindestens {data.passwordMin} Zeichen.</span>
				<input id="password" name="password" type="password" autocomplete="new-password" required />
			</div>
			<div class="field">
				<label for="password2">Wiederholen</label>
				<input id="password2" name="password2" type="password" autocomplete="new-password" required />
			</div>
			<button class="btn" type="submit">Passwort speichern</button>
			<p class="muted small">Danach sind alle Geräte abgemeldet.</p>
		</form>
	{/if}
</AuthShell>

<style>
	.small {
		margin-top: var(--sp-3);
		font-size: var(--fs-s);
	}
</style>
