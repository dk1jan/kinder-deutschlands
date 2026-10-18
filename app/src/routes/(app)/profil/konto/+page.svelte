<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { form } = $props();
</script>

<svelte:head><title>Konto und Daten – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">
	<p><a href="/profil">Zurück zum Profil</a></p>
	<h1>Konto und Daten</h1>

	<section class="block card">
		<h2>Meine Daten herunterladen</h2>
		<p>Eine Datei mit allem, was zu deinem Konto gespeichert ist: Konto, Profil, Freigaben, QR-Codes, Kontakte, Anfragen, Geräte und deine eigenen Vorgänge im Protokoll.</p>
		<a class="btn" href="/profil/konto/export" download>Daten herunterladen (JSON)</a>
	</section>

	<section class="block card danger-zone">
		<h2>Konto löschen</h2>
		<p>Gelöscht werden Profil, Familien-ID, QR-Codes, Kontakte, Anfragen, Blockierungen, Passkeys und alle Anmeldungen. Deine E-Mail-Adresse wird entfernt. Im Sicherheitsprotokoll bleibt ein anonymer Vermerk, dass ein Konto gelöscht wurde.</p>
		<p>Gedruckte Wimpel und QR-Codes funktionieren danach nicht mehr. Das lässt sich nicht rückgängig machen.</p>
		{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
		<form method="POST" action="?/loeschen">
			<div class="field">
				<label for="current">Passwort</label>
				<input id="current" name="current" type="password" autocomplete="current-password" required />
			</div>
			<div class="field">
				<label for="confirm">Zur Bestätigung LÖSCHEN eintippen</label>
				<input id="confirm" name="confirm" type="text" autocomplete="off" required />
			</div>
			<button class="btn danger" type="submit">Konto endgültig löschen</button>
		</form>
	</section>
</div>

<style>
	.block {
		margin-bottom: var(--sp-6);
	}
	.block h2 {
		font-size: var(--fs-xl);
	}
	.danger-zone {
		border-top: 8px solid var(--red);
	}
	form {
		max-width: 26rem;
	}
</style>
