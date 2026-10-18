<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const m = $derived(data.mail);
	const port = $derived(String(data.mail.port));
	const fmt = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<svelte:head><title>Einstellungen – Verwaltung</title></svelte:head>

<h1>Einstellungen</h1>

<section class="card" aria-labelledby="mail">
	<header>
		<h2 id="mail">E-Mail-Versand</h2>
		{#if m.source === 'verwaltung'}
			<span class="tag ok">Aktiv · hier gespeichert</span>
		{:else if m.source === 'umgebung'}
			<span class="tag ok">Aktiv · aus Portainer-Variablen</span>
		{:else}
			<span class="tag warn">Nicht eingerichtet</span>
		{/if}
	</header>
	<p class="muted">
		Für Bestätigungs-Mails bei der Registrierung und für „Passwort vergessen“. Ohne Mailserver bleiben beide geschlossen.
		Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.
	</p>

	{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
	{#if form?.warn}<Notice kind="warn">{form.warn}</Notice>{/if}
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if m.passwordUnreadable}
		<Notice kind="warn">Das gespeicherte Passwort lässt sich nicht mehr entschlüsseln (APP_SECRET wurde geändert). Bitte neu eingeben.</Notice>
	{/if}

	<form method="POST" action="?/speichern" class="grid" autocomplete="off">
		<div class="field wide">
			<label for="host">Mailserver (SMTP)</label>
			<input id="host" name="host" required value={m.host} placeholder="jan-krueger.org" spellcheck="false" autocapitalize="off" />
		</div>
		<div class="field">
			<label for="port">Port</label>
			<select id="port" name="port" value={port}>
				<option value="587">587 – STARTTLS (empfohlen)</option>
				<option value="465">465 – SSL/TLS</option>
				<option value="25">25 – unverschlüsselt/STARTTLS</option>
				{#if !['587', '465', '25'].includes(port)}<option value={port}>{port}</option>{/if}
			</select>
		</div>
		<div class="field">
			<label for="from">Absenderadresse</label>
			<input id="from" name="from" type="email" required value={m.from} placeholder="noreply@jan-krueger.org" spellcheck="false" autocapitalize="off" />
		</div>
		<div class="field">
			<label for="user">Benutzername</label>
			<input id="user" name="user" value={m.user} placeholder="noreply@jan-krueger.org" spellcheck="false" autocapitalize="off" autocomplete="off" />
		</div>
		<div class="field">
			<label for="password">Passwort {#if m.hasPassword}<span class="muted">(gespeichert – leer lassen, um es zu behalten)</span>{/if}</label>
			<input id="password" name="password" type="password" autocomplete="new-password" placeholder={m.hasPassword ? '••••••••' : ''} />
		</div>
		<label class="check wide">
			<input type="checkbox" name="insecure_tls" checked={m.insecureTls} />
			<span>Zertifikat des Mailservers nicht prüfen <span class="muted">(nur wenn der Test mit Zertifikatsfehler scheitert; verschlüsselt bleibt es trotzdem)</span></span>
		</label>
		<div class="actions wide">
			<button class="btn" type="submit">Speichern und Verbindung prüfen</button>
		</div>
	</form>

	<div class="row">
		{#if m.source}
			<form method="POST" action="?/testen"><button class="btn secondary" type="submit">Test-E-Mail an mich senden</button></form>
		{/if}
		{#if m.source === 'verwaltung'}
			<form method="POST" action="?/zuruecksetzen">
				<button class="btn danger small" type="submit">Gespeicherte Werte entfernen{m.envAvailable ? ' (Portainer-Variablen gelten dann wieder)' : ''}</button>
			</form>
		{/if}
	</div>
	{#if m.updatedAt}<p class="muted small">Zuletzt geändert: {fmt(m.updatedAt)}</p>{/if}

	<details>
		<summary>Wo bekomme ich die Daten her?</summary>
		<ol>
			<li>Plesk → Domain <code>jan-krueger.org</code> → <strong>E-Mail-Adressen</strong> → <strong>E-Mail-Adresse erstellen</strong>, z. B. <code>noreply</code>, starkes Passwort.</li>
			<li>Hier eintragen: Mailserver <code>jan-krueger.org</code>, Port 587, Benutzername und Absender = die neue Adresse, Passwort aus Schritt 1.</li>
			<li>Speichern, dann „Test-E-Mail an mich senden“. Landet sie im Spam: in Plesk unter Mail-Einstellungen DKIM aktivieren.</li>
		</ol>
	</details>
</section>

<section class="card" aria-labelledby="luftbild">
	<header>
		<h2 id="luftbild">Luftbild auf der Karte</h2>
		<span class="tag ok">{data.aerial.provider === 'esri' ? 'Esri · ganz Deutschland' : 'LGLN · nur Niedersachsen'}</span>
	</header>
	<p class="muted">
		Ohne Einstellung zeigt die Karte das offene Luftbild des Landes Niedersachsen (LGLN, CC BY 4.0). Für Bremen gibt es kein frei nutzbares Luftbild.
		Mit einem kostenlosen Schlüssel der ArcGIS Location Platform (Esri, bis 2 Mio. Kacheln im Monat ohne Kosten laut Esri) gilt das Luftbild überall. Die Kacheln laufen über unseren Server, der Schlüssel bleibt verschlüsselt hier.
	</p>
	{#if form?.aerialOk}<Notice kind="ok">{form.aerialOk}</Notice>{/if}
	{#if form?.aerialError}<Notice kind="error">{form.aerialError}</Notice>{/if}
	<form method="POST" action="?/luftbild" class="grid" autocomplete="off">
		<div class="field wide">
			<label for="esri_key">Esri-API-Schlüssel {#if data.aerial.provider === 'esri'}<span class="muted">(gespeichert – neu eingeben zum Ersetzen)</span>{/if}</label>
			<input id="esri_key" name="esri_key" type="password" autocomplete="off" placeholder={data.aerial.provider === 'esri' ? '••••••••' : 'AAPK…'} />
		</div>
		<div class="actions wide"><button class="btn" type="submit">Prüfen und speichern</button></div>
	</form>
	{#if data.aerial.provider === 'esri'}
		<form method="POST" action="?/luftbild"><input type="hidden" name="remove" value="1" /><button class="btn danger small" type="submit">Schlüssel entfernen</button></form>
	{/if}
	<details>
		<summary>Wie komme ich an den Schlüssel?</summary>
		<ol>
			<li>Auf <code>location.arcgis.com</code> ein kostenloses ArcGIS-Location-Platform-Konto anlegen.</li>
			<li>Unter „Developer credentials“ einen API-Schlüssel erstellen, Berechtigung <strong>Basemaps</strong> aktivieren.</li>
			<li>Schlüssel hier einfügen und speichern. Bedingungen und Freikontingent bitte bei Esri prüfen.</li>
		</ol>
	</details>
</section>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
		max-width: 48rem;
		display: grid;
		gap: var(--sp-4);
		margin-bottom: var(--sp-5);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
	}
	h2 {
		margin: 0;
	}
	.tag {
		font-size: var(--fs-s);
		font-weight: 700;
		padding: var(--sp-1) var(--sp-3);
		border-radius: 999px;
		background: var(--surface-2);
	}
	.tag.ok {
		color: var(--ok);
	}
	.tag.warn {
		color: var(--warn);
	}
	p {
		margin: 0;
	}
	.grid {
		display: grid;
		gap: var(--sp-3) var(--sp-4);
	}
	@media (min-width: 640px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
		.wide {
			grid-column: 1 / -1;
		}
	}
	.field input,
	.field select {
		width: 100%;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
	}
	.check input {
		margin-top: 0.3em;
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.small {
		font-size: var(--fs-xs);
	}
	details summary {
		cursor: pointer;
		font-weight: 700;
	}
	details ol {
		margin: var(--sp-2) 0 0;
		padding-left: 1.3rem;
		display: grid;
		gap: var(--sp-1);
	}
</style>
