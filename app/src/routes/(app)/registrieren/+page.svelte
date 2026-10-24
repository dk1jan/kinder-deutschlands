<script lang="ts">
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Registrieren – Kinder Deutschlands</title></svelte:head>

<AuthShell title="Konto anlegen" lead="Du bekommst eine eigene Familien-ID und entscheidest selbst, wer was von dir sieht.">
	{#if form?.sent}
		<Notice kind="ok" title="Fast geschafft">
			Wir haben eine E-Mail an {form.sent} geschickt. Klicke auf den Link darin, um dein Konto freizuschalten. Keine E-Mail da? Schau im Spam-Ordner nach.
		</Notice>
		<p><a href="/anmelden">Zur Anmeldung</a></p>
	{:else if !data.open}
		<Notice kind="info" title="Registrierung noch geschlossen">
			Die Registrierung ist gerade nicht möglich. Wer schon ein Konto hat, kann sich anmelden.
		</Notice>
		<a class="btn secondary" href="/anmelden">Anmelden</a>
	{:else}
		{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
		<form method="POST" novalidate>
			<div class="field">
				<label for="email">E-Mail-Adresse</label>
				<span class="hint">Nur für Anmeldung und Benachrichtigungen. Sie erscheint nie in deinem Profil.</span>
				<input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''}
					aria-invalid={form?.errors?.email ? 'true' : undefined} aria-describedby={form?.errors?.email ? 'email-err' : undefined} />
				{#if form?.errors?.email}<span id="email-err" class="err">{form.errors.email}</span>{/if}
			</div>
			<div class="field">
				<label for="password">Passwort</label>
				<span class="hint">Mindestens {data.passwordMin} Zeichen. Ein Satz aus mehreren Wörtern ist gut merkbar.</span>
				<input id="password" name="password" type="password" autocomplete="new-password" required
					aria-invalid={form?.errors?.password ? 'true' : undefined} />
				{#if form?.errors?.password}<span class="err">{form.errors.password}</span>{/if}
			</div>
			<div class="field">
				<label for="password2">Passwort wiederholen</label>
				<input id="password2" name="password2" type="password" autocomplete="new-password" required
					aria-invalid={form?.errors?.password2 ? 'true' : undefined} />
				{#if form?.errors?.password2}<span class="err">{form.errors.password2}</span>{/if}
			</div>
			<label class="check">
				<input type="checkbox" name="adult" aria-invalid={form?.errors?.adult ? 'true' : undefined} />
				<span>Ich bin volljährig. Kinder Deutschlands ist ein Netzwerk für Eltern und andere erwachsene Bezugspersonen.</span>
			</label>
			{#if form?.errors?.adult}<p class="err">{form.errors.adult}</p>{/if}
			<button class="btn signal" type="submit">Konto anlegen</button>
		</form>
		<p class="muted small">Schon ein Konto? <a href="/anmelden">Anmelden</a></p>
	{/if}
</AuthShell>

<style>
	.check {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-3);
		align-items: start;
		margin: var(--sp-2) 0 var(--sp-5);
		line-height: 1.45;
	}
	.check input {
		width: 1.4rem;
		height: 1.4rem;
		margin-top: 2px;
		accent-color: var(--ink);
	}
	.err {
		color: var(--danger);
		font-weight: 700;
		font-size: var(--fs-s);
	}
	.small {
		margin-top: var(--sp-5);
		font-size: var(--fs-s);
	}
</style>
