<script lang="ts">
	import Pennant from '$lib/components/Pennant.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const stateWord = { ok: 'In Ordnung', warn: 'Hinweis', error: 'Fehler' };
	let blocked = $derived(data.checks.some((c) => c.state === 'error'));
</script>

<svelte:head><title>Einrichtung – Kinder Deutschlands</title></svelte:head>

<main class="setup">
	<header>
		<Pennant size={40} />
		<p class="kicker">Einrichtung</p>
	</header>

	{#if data.step === 'token'}
		<h1>Einrichtung freischalten</h1>
		<p>
			Diese Seite legt den ersten Betreiber-Zugang an. Damit das niemand anderes zuerst tut, ist sie mit einem
			Einmal-Token geschützt. Das Token steht im Log des Containers <code>web</code>
			(Portainer → Container → web → Logs) unter „EINRICHTUNG NOCH NICHT ABGESCHLOSSEN“.
		</p>
		{#if form?.tokenError}
			<Notice kind="error">{form.tokenError}</Notice>
		{/if}
		<form method="POST" action="?/token">
			<div class="field">
				<label for="token">Einmal-Token</label>
				<input id="token" name="token" type="text" autocomplete="off" spellcheck="false" required
					aria-invalid={form?.tokenError ? 'true' : undefined} />
			</div>
			<button class="btn" type="submit">Weiter</button>
		</form>
	{:else}
		<h1>Ersten Betreiber-Zugang anlegen</h1>

		<section aria-labelledby="pruefung">
			<h2 id="pruefung">Vorabprüfung</h2>
			<ul class="checks">
				{#each data.checks as c}
					<li class={c.state}>
						<span class="badge">{stateWord[c.state]}</span>
						<span><strong>{c.label}</strong><br /><span class="muted">{c.detail}</span></span>
					</li>
				{/each}
			</ul>
			{#if blocked}
				<Notice kind="error">Bitte zuerst die mit „Fehler“ markierten Punkte beheben und den Stack neu starten.</Notice>
			{/if}
		</section>

		<form method="POST" action="?/konto" class="account">
			<h2>Zugangsdaten</h2>
			<div class="field">
				<label for="email">E-Mail-Adresse</label>
				<input id="email" name="email" type="email" autocomplete="username" required value={form?.email ?? ''}
					aria-invalid={form?.errors?.email ? 'true' : undefined} aria-describedby="email-err" />
				{#if form?.errors?.email}<span id="email-err" class="err">{form.errors.email}</span>{/if}
			</div>
			<div class="field">
				<label for="password">Passwort</label>
				<span class="hint">Mindestens {data.passwordMin} Zeichen. Ein Satz aus mehreren Wörtern ist gut merkbar.</span>
				<input id="password" name="password" type="password" autocomplete="new-password" minlength={data.passwordMin} required
					aria-invalid={form?.errors?.password ? 'true' : undefined} />
				{#if form?.errors?.password}<span class="err">{form.errors.password}</span>{/if}
			</div>
			<div class="field">
				<label for="password2">Passwort wiederholen</label>
				<input id="password2" name="password2" type="password" autocomplete="new-password" required
					aria-invalid={form?.errors?.password2 ? 'true' : undefined} />
				{#if form?.errors?.password2}<span class="err">{form.errors.password2}</span>{/if}
			</div>

			<h2>Zwei-Faktor-Anmeldung</h2>
			<p>Für die Verwaltung ist ein zweiter Faktor Pflicht. Scanne den Code mit einer Authenticator-App (z. B. Aegis, 2FAS, Google oder Microsoft Authenticator).</p>
			<div class="qr">
				<!-- QR-Code wird serverseitig als SVG erzeugt -->
				{@html data.qr}
			</div>
			<p class="muted">Ohne Kamera: Schlüssel von Hand eingeben<br /><code class="secret">{data.secret}</code></p>
			<div class="field">
				<label for="code">Code aus der App</label>
				<input id="code" name="code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code"
					maxlength="7" required aria-invalid={form?.errors?.code ? 'true' : undefined} />
				{#if form?.errors?.code}<span class="err">{form.errors.code}</span>{/if}
			</div>

			<button class="btn" type="submit" disabled={blocked}>Zugang anlegen und Einrichtung abschließen</button>
			<p class="muted small">Danach ist diese Seite dauerhaft gesperrt.</p>
		</form>
	{/if}
</main>

<style>
	.setup {
		max-width: 36rem;
		margin: 0 auto;
		padding: var(--sp-6) var(--sp-4) var(--sp-7);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
	}
	.kicker {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 650;
		color: var(--ink-2);
	}
	h2 {
		margin-top: var(--sp-6);
	}
	.checks {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.checks li {
		display: grid;
		grid-template-columns: 7.5rem 1fr;
		gap: var(--sp-3);
		align-items: start;
		padding: var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.badge {
		font-size: var(--fs-xs);
		font-weight: 700;
		padding: 2px var(--sp-2);
		border: 1.5px solid currentColor;
		border-radius: 999px;
		text-align: center;
	}
	.checks .ok .badge {
		color: var(--ok);
	}
	.checks .warn .badge {
		color: var(--warn);
	}
	.checks .error .badge {
		color: var(--danger);
	}
	.qr {
		width: 220px;
		padding: var(--sp-3);
		background: #fff;
		border-radius: var(--radius-m);
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.secret {
		word-break: break-all;
	}
	.err {
		color: var(--danger);
		font-size: var(--fs-s);
		font-weight: 700;
	}
	.small {
		font-size: var(--fs-s);
		margin-top: var(--sp-3);
	}
</style>
