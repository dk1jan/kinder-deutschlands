<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Notice from '$lib/components/Notice.svelte';
	import { passkeyRegister, passkeySupported } from '$lib/passkey';
	import { enhance } from '$app/forms';
	import { passwordChanged } from '$lib/chat/client.svelte';
	let { data, form } = $props();
	let supported = $state(false);
	let pkName = $state('');
	let pkMsg = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
	let busy = $state(false);
	onMount(async () => {
		supported = await passkeySupported();
		pkName = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android-Handy' : 'Dieser Computer';
	});
	async function addPasskey() {
		busy = true;
		pkMsg = null;
		try {
			await passkeyRegister(pkName);
			pkMsg = { kind: 'ok', text: 'Passkey gespeichert. Du kannst dich jetzt ohne Passwort anmelden.' };
			await invalidateAll();
		} catch (e) {
			pkMsg = { kind: 'error', text: e instanceof Error ? e.message : 'Passkey konnte nicht gespeichert werden.' };
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Sicherheit – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">
	<p><a href="/profil">Zurück zum Profil</a></p>
	<h1>Sicherheit</h1>
	{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

	<section class="block" aria-labelledby="pk">
		<h2 id="pk">Passkeys</h2>
		<p>Anmelden mit Fingerabdruck, Gesichtserkennung oder Geräte-PIN, ohne Passwort. Sicherer als ein Passwort und gilt als Zwei-Faktor-Anmeldung.</p>
		{#if data.passkeys.length}
			<ul class="list">
				{#each data.passkeys as p}
					<li class="item">
						<div><strong>{p.name}</strong><p class="muted meta">Erstellt {p.created}, zuletzt benutzt {p.lastUsed}</p></div>
						<form method="POST" action="?/passkeyLoeschen"><input type="hidden" name="id" value={p.id} /><button class="btn small danger" type="submit">Entfernen</button></form>
					</li>
				{/each}
			</ul>
		{/if}
		{#if pkMsg}<Notice kind={pkMsg.kind}>{pkMsg.text}</Notice>{/if}
		{#if supported}
			<div class="row">
				<label class="visually-hidden" for="pkname">Name für den Passkey</label>
				<input id="pkname" type="text" bind:value={pkName} maxlength="60" />
				<button class="btn signal" type="button" onclick={addPasskey} disabled={busy}>Passkey hinzufügen</button>
			</div>
		{:else}
			<p class="muted">Dieser Browser unterstützt keine Passkeys.</p>
		{/if}
	</section>

	<section class="block" aria-labelledby="tf">
		<h2 id="tf">Zwei-Faktor-Anmeldung mit App</h2>
		{#if form?.totpError}<Notice kind="error">{form.totpError}</Notice>{/if}
		{#if data.totp}
			<p><strong>Eingeschaltet.</strong> Nach dem Passwort fragen wir einen Code aus deiner Authenticator-App ab.</p>
			{#if data.totpRequired}
				<p class="muted">Für Verwaltungsrollen ist sie Pflicht und lässt sich nicht ausschalten.</p>
			{:else}
				<form method="POST" action="?/totpAus" class="row">
					<label class="visually-hidden" for="cur-totp">Aktuelles Passwort</label>
					<input id="cur-totp" name="current" type="password" autocomplete="current-password" placeholder="Passwort zur Bestätigung" required />
					<button class="btn secondary" type="submit">Ausschalten</button>
				</form>
			{/if}
		{:else if data.totpSetup}
			<p>Scanne den Code mit einer Authenticator-App und gib den angezeigten Code ein.</p>
			<div class="qr">{@html data.totpSetup.qr}</div>
			<p class="muted">Ohne Kamera: <code>{data.totpSetup.secret}</code></p>
			<form method="POST" action="?/totpBestaetigen" class="row">
				<label class="visually-hidden" for="code">Code aus der App</label>
				<input id="code" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required />
				<button class="btn" type="submit">Einschalten</button>
			</form>
		{:else}
			<p>Ausgeschaltet. Optional für mehr Schutz, falls du keine Passkeys nutzt.</p>
			<form method="POST" action="?/totpStart"><button class="btn secondary" type="submit">Einrichten</button></form>
		{/if}
	</section>

	<section class="block" aria-labelledby="dev">
		<h2 id="dev">Angemeldete Geräte</h2>
		<ul class="list">
			{#each data.sessions as s}
				<li class="item">
					<div><strong>{s.device}</strong>{#if s.current} <span class="tag">Dieses Gerät</span>{/if}<p class="muted meta">Seit {s.since}, zuletzt aktiv {s.lastSeen}</p></div>
					{#if !s.current}
						<form method="POST" action="?/geraetAbmelden"><input type="hidden" name="id" value={s.id} /><button class="btn small secondary" type="submit">Abmelden</button></form>
					{/if}
				</li>
			{/each}
		</ul>
		{#if data.sessions.length > 1}
			<form method="POST" action="?/alleAbmelden" class="spaced"><button class="btn small danger" type="submit">Alle anderen Geräte abmelden</button></form>
		{/if}
	</section>

	<section class="block" aria-labelledby="em">
		<h2 id="em">E-Mail-Adresse</h2>
		<p>Aktuell: <strong>{data.email}</strong></p>
		<p class="muted small">Nur du siehst deine Adresse – auch die Verwaltung nicht. Wir nutzen sie für Anmeldung, Bestätigungen und – wenn du willst – den Familienradar.</p>
		{#if form?.mailError}<Notice kind="error">{form.mailError}</Notice>{/if}
		{#if form?.mailOk}<Notice kind="ok">{form.mailOk}</Notice>{/if}
		<form method="POST" action="?/emailAendern" class="pwform">
			<div class="field"><label for="newmail">Neue E-Mail-Adresse</label><input id="newmail" name="email" type="email" autocomplete="email" required /></div>
			<div class="field"><label for="mailpw">Passwort zur Bestätigung</label><input id="mailpw" name="current" type="password" autocomplete="current-password" required /></div>
			<button class="btn secondary" type="submit">Adresse ändern</button>
		</form>
	</section>

	<section class="block" aria-labelledby="pw">
		<h2 id="pw">Passwort ändern</h2>
		{#if form?.pwError}<Notice kind="error">{form.pwError}</Notice>{/if}
		<!-- Nach dem Wechsel die Chat-Sicherung gleich mit dem neuen Passwort verpacken (D-066) -->
		<form method="POST" action="?/passwort" class="pwform" use:enhance={({ formData }) => {
			const next = String(formData.get('password') ?? '');
			return async ({ result, update }) => {
				if (result.type === 'success' && result.data && 'ok' in result.data) await passwordChanged(next).catch(() => {});
				await update();
			};
		}}>
			<div class="field"><label for="current">Aktuelles Passwort</label><input id="current" name="current" type="password" autocomplete="current-password" required /></div>
			<div class="field"><label for="password">Neues Passwort</label><span class="hint">Mindestens {data.passwordMin} Zeichen.</span><input id="password" name="password" type="password" autocomplete="new-password" required /></div>
			<div class="field"><label for="password2">Neues Passwort wiederholen</label><input id="password2" name="password2" type="password" autocomplete="new-password" required /></div>
			<button class="btn" type="submit">Passwort ändern</button>
		</form>
	</section>
</div>

<style>
	.block {
		margin-bottom: var(--sp-7);
	}
	.block h2 {
		font-size: var(--fs-xl);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.item {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
	}
	.meta {
		margin: 0;
		font-size: var(--fs-s);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.row input {
		flex: 1;
		min-width: 12rem;
	}
	.row .code-input {
		flex: 0 0 auto;
	}
	.qr {
		width: 200px;
		padding: 10px;
		background: #fff;
		border-radius: var(--radius-m);
		margin-bottom: var(--sp-3);
	}
	.qr :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}
	.spaced {
		margin-top: var(--sp-2);
	}
	.pwform {
		max-width: 28rem;
	}
</style>
