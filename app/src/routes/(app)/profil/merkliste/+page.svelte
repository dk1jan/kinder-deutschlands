<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { when } from '$lib/termin';

	let { data, form } = $props();
	const d = (x: string) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
	const href = (i: (typeof data.items)[number]) => (i.kind === 'event' ? `/veranstaltungen/${i.id}${i.occurrence ? `?am=${i.occurrence}` : ''}` : i.kind === 'offer' ? `/angebote/${i.id}` : `/hinweise#h-${i.id}`);
	const upcoming = $derived(data.items.filter((i) => !i.past).sort((a, b) => (a.when ?? a.deadline ?? '9').localeCompare(b.when ?? b.deadline ?? '9')));
	const past = $derived(data.items.filter((i) => i.past));
	const KIND: Record<string, string> = { event: 'Termin', offer: 'Angebot', notice: 'Hinweis' };
	let copied = $state(false);
</script>

<svelte:head><title>Merkliste – Kinder Deutschlands</title></svelte:head>

<div class="container page wrap">
	<a class="back" href="/profil"><Icon name="zurueck" size={18} />Profil</a>
	<h1>Merkliste</h1>
	<p class="lead">Nur was du selbst gemerkt hast. Erinnerungen stellst du direkt am Termin oder Hinweis ein.</p>
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}

	{#if !data.items.length}<p class="empty">Noch nichts gemerkt. Tippe bei <a href="/veranstaltungen">Veranstaltungen</a>, <a href="/angebote">Angeboten</a> oder <a href="/hinweise">Hinweisen</a> auf „Merken“.</p>{/if}

	{#if upcoming.length}
		<ul class="items">
			{#each upcoming as i (i.kind + i.id + (i.occurrence ?? ''))}
				<li class:x={i.cancelled}>
					<div>
						<small>{KIND[i.kind]}{i.org ? ` · ${i.org}` : ''}{i.cancelled ? (i.kind === 'offer' ? ' · beendet' : ' · abgesagt') : ''}</small>
						<a href={href(i)}><strong>{i.title}</strong></a>
						<small>{#if i.when}{when(i.when, i.end, i.allDay)}{/if}{#if i.deadline}{i.when ? ' · ' : ''}{i.kind === 'event' ? 'Anmeldung bis' : 'Frist'} {d(i.deadline)}{/if}{#if i.remindAt} · <Icon name="glocke" size={12} /> {when(i.remindAt, null, false)}{/if}</small>
					</div>
					<form method="POST" action="?/entfernen"><input type="hidden" name="kind" value={i.kind} /><input type="hidden" name="id" value={i.id} /><input type="hidden" name="am" value={i.occurrence ?? ''} /><button class="linkbtn" aria-label="{i.title} entfernen">entfernen</button></form>
				</li>
			{/each}
		</ul>
	{/if}
	{#if past.length}
		<details class="past"><summary>Vorbei ({past.length})</summary>
			<ul class="items">
				{#each past as i (i.kind + i.id + (i.occurrence ?? ''))}
					<li><div><a href={href(i)}>{i.title}</a></div>
						<form method="POST" action="?/entfernen"><input type="hidden" name="kind" value={i.kind} /><input type="hidden" name="id" value={i.id} /><input type="hidden" name="am" value={i.occurrence ?? ''} /><button class="linkbtn">entfernen</button></form></li>
				{/each}
			</ul>
		</details>
	{/if}

	<section class="card">
		<h2>In deinen Kalender</h2>
		<p class="small">Mit einem persönlichen Kalender-Link erscheinen gemerkte Termine und Fristen automatisch in deinem Handy-Kalender (Apple, Google, Outlook). Wer den Link hat, sieht deine Merkliste – also nicht weitergeben. Du kannst ihn jederzeit erneuern oder abschalten.</p>
		{#if form && 'feedUrl' in form && form.feedUrl}
			<p class="small"><strong>Dein Link (wird nur jetzt angezeigt):</strong></p>
			<div class="feed"><input readonly value={form.feedUrl} aria-label="Kalender-Link" onfocus={(e) => e.currentTarget.select()} />
				<button type="button" class="btn small" onclick={async () => { await navigator.clipboard.writeText(form.feedUrl!); copied = true; }}>{copied ? 'Kopiert' : 'Kopieren'}</button></div>
			<p class="small"><a href={form.feedUrl.replace(/^https?:/, 'webcal:')}>Direkt im Kalender abonnieren</a></p>
		{:else if data.feed && !(form && 'feedOff' in form)}
			<p class="small">Ein Kalender-Link ist aktiv (seit {d(String(data.feed.created))}{data.feed.lastUsed ? `, zuletzt abgerufen ${d(String(data.feed.lastUsed))}` : ''}). Aus Sicherheitsgründen zeigen wir ihn nicht erneut.</p>
			<div class="row">
				<form method="POST" action="?/kalender"><input type="hidden" name="neu" value="1" /><button class="btn small secondary">Neuen Link erzeugen (alter wird ungültig)</button></form>
				<form method="POST" action="?/kalenderAus"><button class="btn small secondary">Abschalten</button></form>
			</div>
		{:else}
			<form method="POST" action="?/kalender"><button class="btn small">Kalender-Link erzeugen</button></form>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 48rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.lead {
		color: var(--ink-2);
	}
	.items {
		list-style: none;
		margin: 0 0 var(--sp-4);
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.items li {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
		align-items: center;
		padding: var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-m);
	}
	.items li div {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.items li.x strong {
		text-decoration: line-through;
	}
	.items small {
		color: var(--ink-2);
	}
	.past summary {
		cursor: pointer;
		min-height: 44px;
		font-weight: 700;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-5);
		margin-top: var(--sp-5);
	}
	.card h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-l);
	}
	.feed {
		display: flex;
		gap: var(--sp-2);
	}
	.feed input {
		flex: 1;
		font-family: monospace;
		font-size: var(--fs-s);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.linkbtn {
		background: none;
		border: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		font-size: var(--fs-s);
		cursor: pointer;
		white-space: nowrap;
	}
	.empty {
		padding: var(--sp-4);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
