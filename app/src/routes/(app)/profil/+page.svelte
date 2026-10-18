<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Profil – Kinder Deutschlands</title></svelte:head>

<h1>Profil</h1>

{#if data.user}
	<section class="card account">
		<h2>Dein Konto</h2>
		<p>Angemeldet mit <strong>{data.user.email}</strong>. Die E-Mail-Adresse ist nur für dich und die Anmeldung sichtbar.</p>
		<p class="muted">Mitglieds-ID, QR-Kontakt und Profilfreigaben kommen mit Abschnitt 1 (M01).</p>
	</section>
{:else}
	<p>Melde dich an, um dein Konto zu verwalten.</p>
	<a class="btn" href="/anmelden">Anmelden</a>
{/if}

<nav class="links" aria-label="Einstellungen">
	<ul>
		<li><a href="/profil/darstellung">Darstellung: hell, dunkel oder wie das Gerät</a></li>
		{#if data.canAdmin}
			<li><a href="/admin">Verwaltung öffnen</a></li>
		{/if}
	</ul>
</nav>

{#if data.user}
	<form method="POST" action="?/abmelden">
		<button class="btn secondary" type="submit">Abmelden</button>
	</form>
{/if}

<style>
	.account {
		margin-bottom: var(--sp-5);
		max-width: var(--measure);
	}
	.links ul {
		list-style: none;
		padding: 0;
		margin: var(--sp-5) 0;
	}
	.links li {
		border-bottom: 1px solid var(--line);
	}
	.links a {
		display: flex;
		align-items: center;
		min-height: var(--touch);
	}
</style>
