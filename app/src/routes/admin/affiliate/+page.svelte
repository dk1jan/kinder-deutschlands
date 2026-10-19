<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const a = $derived(data.a);
	const KIND: Record<string, string> = { ergaenzt: 'Partnerkennung ergänzt', fremd: 'fremde Kennung – bleibt unverändert', keiner: 'kein amazon.de-Link (oder Partnerlinks aus) – unverändert' };
</script>

<svelte:head><title>Affiliate – Verwaltung</title></svelte:head>

<h1>Partnerlinks (Affiliate)</h1>
<p class="muted">Amazon-Links in offenen Community-Beiträgen bekommen beim Anzeigen die Partnerkennung von Kinder Deutschlands. Gespeichert bleibt der Originallink; fremde Kennungen werden nie überschrieben; keine Partnerlinks in Chats, geschützten Gruppen, Marktplatz oder Einladungen. Erklärung für Mitglieder: <a href="/partnerlinks">/partnerlinks</a>.</p>
<Notice kind="warn" title="Vor dem Einschalten">Bitte die <strong>aktuellen</strong> Teilnahmebedingungen des Amazon-Partnerprogramms selbst prüfen – insbesondere zu Bereichen nur für angemeldete Mitglieder, Apps/PWA, automatischer Linkumwandlung und Kennzeichnung. Ich habe sie nicht verbindlich geprüft. Ohne diese Bestätigung lässt sich nichts einschalten.</Notice>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

<section class="card">
	<p>Status: <strong>{a.enabled ? 'eingeschaltet' : 'ausgeschaltet'}</strong>{a.amazon_tag ? ` · Kennung ${a.amazon_tag}` : ''}</p>
	{#if a.terms_checked_at}<p class="muted small">Bedingungen geprüft am {new Date(a.terms_checked_at).toLocaleDateString('de-DE')} von {a.terms_checked_by}{a.terms_note ? ` – ${a.terms_note}` : ''}</p>{/if}
	<form method="POST" action="?/speichern" class="f">
		<label>Partnerkennung (amazon.de)<input name="tag" maxlength="40" value={a.amazon_tag ?? ''} placeholder="z. B. kinderdeutsch-21" /></label>
		<label class="check"><input type="checkbox" name="terms" /> <span>Ich habe die aktuellen Teilnahmebedingungen geprüft; der Einsatz hier ist danach zulässig.</span></label>
		<label>Notiz zur Prüfung<input name="note" maxlength="500" placeholder="z. B. Fassung vom …, Abschnitt …" /></label>
		<label class="check"><input type="checkbox" name="enabled" checked={a.enabled} /> <span>Partnerlinks einschalten</span></label>
		<div><button class="btn small">Speichern</button></div>
	</form>
</section>

<section class="card">
	<h2>Link testen</h2>
	<form method="POST" action="?/testen" class="f"><input name="url" type="url" required placeholder="https://www.amazon.de/dp/…" aria-label="Link" /><div><button class="btn small secondary">Prüfen</button></div></form>
	{#if form && 'test' in form && form.test}
		<p class="small">Ergebnis: <strong>{KIND[form.test.kind]}</strong></p>
		<p class="small mono">{form.test.href}</p>
	{/if}
</section>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin: var(--sp-4) 0;
	}
	.f {
		display: grid;
		gap: var(--sp-3);
		max-width: 36rem;
	}
	.f label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.f .check {
		display: flex;
		gap: var(--sp-2);
		font-weight: 400;
	}
	.mono {
		font-family: monospace;
		overflow-wrap: anywhere;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
