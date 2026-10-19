<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ReportBox from '$lib/components/community/ReportBox.svelte';
	import CrisisBox from '$lib/components/alltag/CrisisBox.svelte';
	import { HELP_CATEGORIES, HELP_KINDS } from '$lib/alltag';
	let { data, form } = $props();
	const h = $derived(data.h);
	const d = (x: string | Date) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
</script>

<svelte:head><title>{h.title} – Familien helfen Familien</title><meta name="robots" content="noindex" /></svelte:head>

<article class="container page narrow">
	<a class="back" href="/hilfe"><Icon name="zurueck" size={18} />Familien helfen Familien</a>
	{#if data.crisis}<CrisisBox open />{/if}
	{#if data.held || h.status === 'pruefung'}<Notice kind="info" title="Wird geprüft">Dein Eintrag enthält vermutlich private Daten. Die Moderation schaut kurz drauf, bevor andere ihn sehen.</Notice>{/if}
	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}
	{#if form && 'reported' in form}<Notice kind="ok">Danke, die Moderation schaut es sich an.</Notice>{/if}

	<p class="kind"><span class="tag {h.kind}">{HELP_KINDS[h.kind as keyof typeof HELP_KINDS]}</span> {HELP_CATEGORIES[h.category as keyof typeof HELP_CATEGORIES]}</p>
	<h1>{h.title}</h1>
	<p class="meta">{h.author}{h.regionName ? ` · ${h.regionName}` : ''} · {d(h.createdAt)}{h.status === 'erledigt' ? ' · erledigt' : h.status === 'abgelaufen' ? ' · abgelaufen' : ''}</p>
	{#if h.body}<p class="body">{h.body}</p>{/if}
	<p class="muted small">Private Erfahrung eines Mitglieds – keine Rechts-, Gesundheits- oder Fachberatung. Verbindliche Auskunft geben Behörden und <a href="/einrichtungen?art=beratung">Beratungsstellen</a>.</p>

	{#if h.mine}
		<section class="card">
			<h2>Dein Eintrag</h2>
			<p class="small">Antworten kommen als Kontaktanfrage unter <a href="/nachrichten?ansicht=kontakte">Kontakte</a>. Nach dem Annehmen könnt ihr verschlüsselt chatten.</p>
			<form method="POST" action="?/status" class="row">
				{#if h.status === 'offen'}<button class="btn small" name="status" value="erledigt">Erledigt – danke!</button>{/if}
				{#if h.status === 'erledigt' || h.status === 'abgelaufen'}<button class="btn small secondary" name="status" value="offen">Wieder öffnen</button>{/if}
				<button class="btn small secondary" name="status" value="entfernt">Löschen</button>
			</form>
		</section>
	{:else if h.status === 'offen'}
		<section class="card">
			<h2>{h.kind === 'brauche' ? 'Ich kann helfen' : 'Das brauche ich'}</h2>
			{#if h.contact === 'kontakt' || (form && 'responded' in form && form.responded === 'direkt')}
				<p>Ihr seid schon verbunden.</p>
				<a class="btn small" href="/nachrichten/familie?id={h.contactId}">Nachricht schreiben</a>
			{:else if h.contact === 'angefragt' || (form && 'responded' in form)}
				<Notice kind="ok">Deine Anfrage ist unterwegs. Sobald sie angenommen wird, könnt ihr verschlüsselt chatten.</Notice>
			{:else}
				<form method="POST" action="?/antworten" class="stack">
					<label for="msg">Kurze Nachricht</label>
					<textarea id="msg" name="message" rows="3" minlength="5" maxlength="500" required placeholder={h.kind === 'brauche' ? 'Ich hatte das gleiche Problem und kann erzählen, wie es bei uns lief …' : 'Hallo, das könnte uns helfen …'}></textarea>
					<p class="muted small">Geht als Kontaktanfrage über die Familien-ID. Trefft euch, wenn überhaupt, an öffentlichen Orten.</p>
					<button class="btn small">Senden</button>
				</form>
			{/if}
		</section>
		<ReportBox action="?/melden" type="help" id={h.id} label="Eintrag melden" />
	{/if}
</article>

<style>
	.narrow {
		max-width: 44rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.kind {
		margin: var(--sp-4) 0 0;
		color: var(--ink-2);
		font-weight: 650;
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.tag {
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--yellow);
		color: var(--navy);
	}
	.tag.biete {
		background: #1f7468;
		color: #fff;
	}
	h1 {
		margin: var(--sp-2) 0;
	}
	.meta {
		color: var(--ink-2);
		margin: 0 0 var(--sp-3);
	}
	.body {
		white-space: pre-line;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4) var(--sp-5);
		margin: var(--sp-4) 0;
	}
	.card h2 {
		font-size: var(--fs-m);
		margin: 0 0 var(--sp-2);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.stack {
		display: grid;
		gap: var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
