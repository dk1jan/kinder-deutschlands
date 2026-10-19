<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { when } from '$lib/termin';

	let { data, form } = $props();
	const inv = $derived(data.inv);
	const link = $derived(form && 'renewed' in form && form.renewed ? form.renewed : data.link);
	const ja = $derived(data.rsvps.filter((r) => r.answer === 'ja'));
	const vielleicht = $derived(data.rsvps.filter((r) => r.answer === 'vielleicht'));
	const nein = $derived(data.rsvps.filter((r) => r.answer === 'nein'));
	const kids = $derived(ja.reduce((s, r) => s + r.kids, 0));
	const adults = $derived(ja.reduce((s, r) => s + r.adults, 0));
	let copied = $state(false);
	let chatBusy = $state(false);
	let chatErr = $state('');

	async function copy() {
		if (!link) return;
		try {
			if (navigator.share) await navigator.share({ title: inv.title, text: `Einladung: ${inv.title}`, url: link });
			else {
				await navigator.clipboard.writeText(link);
				copied = true;
			}
		} catch {
			/* abgebrochen */
		}
	}
	async function startChat() {
		chatBusy = true;
		chatErr = '';
		try {
			const { createTimedChat } = await import('$lib/chat/actions');
			const roomId = await createTimedChat(`Gäste: ${inv.title}`, '/api/einladungen/chat', { invitationId: inv.id });
			await invalidateAll();
			location.href = `/nachrichten/chat/${encodeURIComponent(roomId)}`;
		} catch (e) {
			chatErr = (e as Error).message || 'Chat konnte nicht angelegt werden.';
		}
		chatBusy = false;
	}
</script>

<svelte:head><title>{inv.title} – Einladung</title></svelte:head>

<div class="container page wrap">
	<a class="back" href="/einladungen"><Icon name="zurueck" size={18} />Einladungen</a>
	<h1>{inv.title}</h1>
	<p class="when"><Icon name="uhr" size={20} /> {when(inv.startsAt, inv.endsAt, false, true)}</p>
	{#if inv.placeText}<p class="muted">{inv.placeText}{inv.addressAfterRsvp ? ' (Gäste sehen den Ort erst nach Zusage)' : ''}</p>{/if}

	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if data.isNew}<Notice kind="ok" title="Einladung angelegt">Kopiere jetzt den Link und schick ihn an die Eltern – per Messenger, Mail oder als QR-Code.</Notice>{/if}
	{#if inv.status === 'abgesagt'}<Notice kind="warn" title="Abgesagt">{inv.cancelNote ?? 'Du hast die Einladung abgesagt. Gäste mit Konto wurden benachrichtigt.'}</Notice>{/if}

	<section class="card">
		<h2>Link zur Einladung</h2>
		{#if link && inv.linkActive}
			<div class="link"><input readonly value={link} aria-label="Link zur Einladung" onfocus={(e) => e.currentTarget.select()} />
				<button type="button" class="btn small" onclick={copy}>{copied ? 'Kopiert' : 'Teilen / kopieren'}</button></div>
			<p class="muted small">Wer den Link hat, kann die Einladung öffnen und antworten. Ist er in falsche Hände geraten: neuen Link erzeugen – der alte gilt sofort nicht mehr.</p>
			<div class="row">
				<form method="POST" action="?/erneuern"><button class="btn small secondary">Neuen Link erzeugen</button></form>
				<form method="POST" action="?/abschalten"><button class="btn small secondary">Link abschalten</button></form>
			</div>
		{:else}
			<p>Der Link ist abgeschaltet – niemand kann die Einladung öffnen.</p>
			<form method="POST" action="?/erneuern"><button class="btn small">Neuen Link erzeugen</button></form>
		{/if}
	</section>

	<section class="card">
		<h2>Antworten</h2>
		<p><strong>{ja.length}</strong> {ja.length === 1 ? 'Zusage' : 'Zusagen'} ({kids} {kids === 1 ? 'Kind' : 'Kinder'}, {adults} {adults === 1 ? 'Erwachsene/r' : 'Erwachsene'}) · <strong>{vielleicht.length}</strong> vielleicht · <strong>{nein.length}</strong> Absagen{inv.maxGuests ? ` · höchstens ${inv.maxGuests} Zusagen` : ''}</p>
		{#if data.rsvps.length}
			<table class="data">
				<thead><tr><th scope="col">Name</th><th scope="col">Antwort</th><th scope="col">Kinder</th><th scope="col">Erw.</th><th scope="col">Notiz</th></tr></thead>
				<tbody>
					{#each data.rsvps as r (r.id)}<tr><td>{r.name}{r.member ? '' : ' *'}</td><td>{r.answer === 'ja' ? 'kommt' : r.answer === 'nein' ? 'kommt nicht' : 'vielleicht'}</td><td>{r.kids}</td><td>{r.adults}</td><td>{r.note ?? ''}</td></tr>{/each}
				</tbody>
			</table>
			<p class="muted small">* ohne Konto geantwortet. Die Liste siehst nur du{inv.guestsSeeList ? ' – Zusagende sehen die Namen der anderen Zusagen' : ''}.</p>
		{:else}
			<p class="muted">Noch keine Antworten.</p>
		{/if}
	</section>

	{#if data.chat && inv.status === 'aktiv'}
		<section class="card">
			<h2>Gäste-Chat</h2>
			{#if inv.chatRoomId}
				<p>Gäste mit Konto, die zu- oder „vielleicht“ gesagt haben, können über die Einladung beitreten. Der Chat wird 2 Tage nach dem Termin gelöscht.</p>
				<a class="btn small" href="/nachrichten/chat/{encodeURIComponent(inv.chatRoomId)}">Chat öffnen</a>
			{:else}
				<p class="small">Verschlüsselter Gruppenchat für Absprachen (Geschenke, Abholung). Nur Gäste mit Konto und Zusage. Wird 2 Tage nach dem Termin gelöscht.</p>
				{#if chatErr}<p class="err" role="alert">{chatErr}</p>{/if}
				<button type="button" class="btn small secondary" onclick={startChat} disabled={chatBusy}>{chatBusy ? 'Lege an …' : 'Gäste-Chat einrichten'}</button>
			{/if}
		</section>
	{/if}

	<section class="card">
		<h2>Verwalten</h2>
		<p><a class="btn small" href="/einladungen/{inv.id}/bearbeiten">Bearbeiten</a></p>
		{#if inv.status === 'aktiv'}
			<details><summary>Absagen</summary>
				<form method="POST" action="?/absagen" class="stack"><input name="note" maxlength="300" placeholder="Grund (optional)" aria-label="Grund" /><button class="btn small danger">Einladung absagen</button></form>
			</details>
		{/if}
		<details><summary>Löschen</summary>
			<form method="POST" action="?/loeschen" class="stack"><label class="check"><input type="checkbox" name="sicher" required /> <span>Einladung mit allen Antworten (und Gäste-Chat) endgültig löschen</span></label><button class="btn small danger">Löschen</button></form>
		</details>
		<p class="muted small">Automatisch gelöscht 30 Tage nach dem Termin.</p>
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
	h1 {
		margin: var(--sp-3) 0 var(--sp-1);
	}
	.when {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		font-weight: 650;
		margin: 0;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4) var(--sp-5);
		margin-top: var(--sp-4);
		overflow-x: auto;
	}
	.card h2 {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-l);
	}
	.link {
		display: flex;
		gap: var(--sp-2);
	}
	.link input {
		flex: 1;
		min-width: 0;
		font-family: monospace;
		font-size: var(--fs-s);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.stack {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-2) 0;
	}
	details {
		margin-top: var(--sp-2);
	}
	summary {
		cursor: pointer;
		font-weight: 700;
		min-height: 36px;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	.err {
		color: var(--danger);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
