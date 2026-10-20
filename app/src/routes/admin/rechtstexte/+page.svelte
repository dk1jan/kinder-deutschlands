<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const i = $derived(data.l.imprint);
	// svelte-ignore state_referenced_locally
	let own = $state(data.l.privacy_text !== null);
	const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '');
</script>

<svelte:head><title>Rechtstexte – Verwaltung</title></svelte:head>

<h1>Impressum und Datenschutz</h1>
<p class="muted">Öffentlich unter <a href="/impressum">/impressum</a> und <a href="/datenschutz">/datenschutz</a>, verlinkt auf jeder Seite. Ich (Claude) kann die Texte vorbereiten, aber keine Rechtsberatung ersetzen: Bitte vor dem echten Start rechtlich prüfen lassen und erst dann „geprüft“ bestätigen.</p>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if data.l.checked_at}
	<Notice kind="ok" title="Geprüft">Bestätigt am {fmt(data.l.checked_at)} von Familien-ID {data.l.checked_by}{data.l.checked_note ? ` – ${data.l.checked_note}` : ''}. Jede inhaltliche Änderung hebt die Bestätigung wieder auf.</Notice>
{:else}
	<Notice kind="warn" title="Entwurf">Noch nicht als geprüft bestätigt – die öffentlichen Seiten zeigen den Hinweis „Entwurf“.{data.complete ? '' : ' Pflichtangaben im Impressum fehlen.'}</Notice>
{/if}

<form method="POST" action="?/speichern" class="f">
	<section class="card">
		<h2>Impressum (Anbieter)</h2>
		<div class="two">
			<label>Name bzw. Firma / Verein *<input name="i_provider" value={i.provider} maxlength="200" /></label>
			<label>Vertreten durch<input name="i_represented" value={i.represented} maxlength="300" placeholder="bei Verein/Firma" /></label>
			<label>Straße und Hausnummer *<input name="i_street" value={i.street} maxlength="200" /></label>
			<label>PLZ und Ort *<input name="i_city" value={i.city} maxlength="200" /></label>
			<label>Land<input name="i_country" value={i.country} maxlength="200" /></label>
			<label>E-Mail *<input type="email" name="i_email" value={i.email} maxlength="200" /></label>
			<label>Telefon<input name="i_phone" value={i.phone} maxlength="200" /></label>
			<label>Registereintrag<input name="i_register" value={i.register} maxlength="200" placeholder="z. B. Vereinsregister …" /></label>
			<label>USt-IdNr.<input name="i_vat" value={i.vat} maxlength="200" /></label>
			<label>Verantwortlich für den Inhalt<input name="i_responsible" value={i.responsible} maxlength="300" placeholder="Name, Anschrift" /></label>
		</div>
		<label>Weitere Angaben (optional)<textarea name="imprint_extra" rows="3" maxlength="3000">{data.l.imprint_extra}</textarea></label>
		<p class="muted small">* Pflichtangaben. Diese Angaben sind öffentlich – bitte nur, was ins Impressum gehört.</p>
	</section>

	<section class="card">
		<h2>Datenschutzerklärung</h2>
		<div class="two">
			<label>Hoster und Serverstandort<input name="hosting" value={data.l.hosting} maxlength="300" placeholder="z. B. Anbieter, Rechenzentrum in …" /></label>
			<label>Zuständige Aufsichtsbehörde<input name="authority" value={data.l.authority} maxlength="300" placeholder="Name und Anschrift/Website" /></label>
		</div>
		<label class="check"><input type="checkbox" name="own_text" bind:checked={own} /> Eigenen Text verwenden (sonst gilt der automatisch erzeugte Entwurf unten)</label>
		{#if own}
			<label>Text (Format: „## Überschrift“, „- Listenpunkt“, Leerzeile = Absatz)<textarea name="privacy_text" rows="24" maxlength="60000">{data.l.privacy_text ?? data.draft}</textarea></label>
		{:else}
			<details>
				<summary>Erzeugten Entwurf ansehen</summary>
				<pre>{data.draft}</pre>
			</details>
			<p class="muted small">Der Entwurf beschreibt, was dieses System tatsächlich tut (Stand der Software). Er wird bei neuen Funktionen mit aktualisiert, solange kein eigener Text gewählt ist.</p>
		{/if}
	</section>

	<section class="card">
		<h2>Prüfung</h2>
		<label class="check"><input type="checkbox" name="checked" /> Impressum und Datenschutzerklärung sind rechtlich geprüft und so freigegeben</label>
		<label>Notiz zur Prüfung (optional)<input name="note" maxlength="500" placeholder="z. B. geprüft durch …" /></label>
	</section>
	<div><button class="btn">Speichern</button></div>
</form>

<style>
	.f {
		display: grid;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-3);
	}
	.card h2 {
		margin: 0;
		font-size: var(--fs-l);
	}
	label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	}
	pre {
		white-space: pre-wrap;
		font-size: var(--fs-s);
		background: var(--surface-2);
		padding: var(--sp-3);
		border-radius: var(--radius-s);
		max-height: 30rem;
		overflow: auto;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
