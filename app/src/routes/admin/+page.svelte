<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const stateWord = { ok: 'In Ordnung', warn: 'Hinweis', error: 'Fehler' };
</script>

<svelte:head><title>Übersicht – Verwaltung</title></svelte:head>

<h1>Übersicht</h1>

{#if data.justSetUp}
	<Notice kind="ok" title="Einrichtung abgeschlossen">Die Einrichtungsseite ist jetzt dauerhaft gesperrt.</Notice>
{/if}

<section class="figures" aria-label="Kennzahlen">
	<div><span class="n">{data.counts.users}</span><span class="l">aktive Konten</span></div>
	<div><span class="n">{data.counts.sessions}</span><span class="l">gültige Sitzungen</span></div>
	<div><span class="n">{data.counts.failed24}</span><span class="l">fehlgeschlagene Anmeldungen (24 h)</span></div>
	<div><span class="n">{data.counts.unverified}</span><span class="l">Konten ohne E-Mail-Bestätigung</span></div>
	<div><span class="n">{data.counts.contacts}</span><span class="l">bestätigte Kontakte</span></div>
</section>

<section class="mail" aria-labelledby="mailtest">
	<h2 id="mailtest">E-Mail-Versand</h2>
	{#if form?.mailOk}<Notice kind="ok">{form.mailOk}</Notice>{/if}
	{#if form?.mailError}<Notice kind="error">{form.mailError}</Notice>{/if}
	{#if data.mailOpen}
		<div class="mailrow"><form method="POST" action="?/testmail"><button class="btn secondary" type="submit">Test-E-Mail an mich senden</button></form><a class="btn secondary" href="/admin/einstellungen">Mail-Einstellungen</a></div>
	{:else}
		<p class="muted">Nicht eingerichtet. Bis dahin sind Registrierung und Passwort-Zurücksetzen geschlossen.</p>
		<a class="btn" href="/admin/einstellungen">Mailserver eintragen</a>
	{/if}
</section>

<section aria-labelledby="zustand">
	<h2 id="zustand">Systemzustand</h2>
	<table class="data">
		<thead><tr><th scope="col">Bereich</th><th scope="col">Zustand</th><th scope="col">Details</th></tr></thead>
		<tbody>
			{#each data.checks as c}
				<tr><td>{c.label}</td><td class="st {c.state}">{stateWord[c.state]}</td><td>{c.detail}</td></tr>
			{/each}
			<tr><td>Tägliche Sicherung</td><td class="st {data.backup.state}">{stateWord[data.backup.state]}</td><td>{data.backup.detail}</td></tr>
		</tbody>
	</table>
</section>

<style>
	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: var(--sp-3);
		margin: var(--sp-5) 0 var(--sp-6);
	}
	.figures div {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-1);
	}
	.n {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		font-weight: 700;
		line-height: 1;
	}
	.l {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.mail {
		margin-bottom: var(--sp-6);
	}
	.mailrow {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.st {
		font-weight: 700;
	}
	.st.ok {
		color: var(--ok);
	}
	.st.warn {
		color: var(--warn);
	}
	.st.error {
		color: var(--danger);
	}
</style>
