<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { when } from '$lib/termin';

	let { data, form } = $props();
	const i = $derived(data.inv);
	let busy = $state(false);
	let chatErr = $state('');
	const ANSWER: Record<string, string> = { ja: 'Du hast zugesagt.', nein: 'Du hast abgesagt.', vielleicht: 'Du hast „vielleicht“ geantwortet.' };
</script>

<svelte:head>
	<title>{i ? i.title : 'Einladung'} – Kinder Deutschlands</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="container page narrow">
	{#if !i}
		<h1>Einladung nicht gefunden</h1>
		<p>Der Link ist abgelaufen, wurde ersetzt oder die Einladung gibt es nicht mehr. Frag am besten direkt bei den Gastgebern nach.</p>
	{:else}
		<article class="card inv">
			<p class="kicker">Einladung{i.organizer ? ` von ${i.organizer}` : ''}</p>
			<h1>{i.title}</h1>
			{#if i.status === 'abgesagt'}<Notice kind="warn" title="Abgesagt">{i.cancelNote ?? 'Die Gastgeber haben abgesagt.'}</Notice>{/if}
			<p class="when"><Icon name="uhr" size={20} /> {when(i.startsAt, i.endsAt, false, true)}</p>
			{#if i.placeText || i.place}
				<p class="where"><Icon name="pin" size={20} /> <span>{#if i.place}<a href="/orte/{i.place.id}">{i.place.name}</a>{i.placeText ? ' · ' : ''}{/if}{i.placeText ?? ''}</span></p>
			{:else if i.addressHidden}
				<p class="where muted"><Icon name="schloss" size={20} /> Den Ort siehst du nach deiner Zusage.</p>
			{/if}
			{#if i.message}<p class="msg">{i.message}</p>{/if}
			<p class="muted small">{i.counts.ja} Zusagen{i.counts.kids ? ` (${i.counts.kids} Kinder)` : ''}{i.counts.vielleicht ? ` · ${i.counts.vielleicht} vielleicht` : ''}{i.rsvpUntil ? ` · Antwort bis ${when(i.rsvpUntil, null, true).split(' · ')[0]}` : ''}</p>
			{#if i.list}<p class="small"><strong>Es kommen:</strong> {i.list.join(', ')}</p>{/if}
		</article>

		{#if i.isOrganizer}
			<Notice kind="info">Das ist die Ansicht deiner Gäste. <a href="/einladungen/{i.id}">Zur Verwaltung</a></Notice>
		{:else}
			<section class="card">
				<h2>{i.mine ? 'Deine Antwort' : 'Kommt ihr?'}</h2>
				{#if form && 'saved' in form}<Notice kind="ok">Danke! {ANSWER[form.saved ?? ''] ?? ''}</Notice>{:else if i.mine}<p>{ANSWER[i.mine.answer]}</p>{/if}
				{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
				{#if i.closed}
					<p class="muted">Antworten ist nicht mehr möglich.</p>
				{:else if i.full && !i.mine}
					<p>Leider sind schon alle Plätze vergeben.</p>
				{:else}
					<form method="POST" action="?/antworten" class="rf">
						<div class="field"><label for="name">Name <span class="muted">(Vorname reicht, z. B. „Mia mit Papa“)</span></label><input id="name" name="name" required maxlength="60" value={i.mine?.name ?? ''} /></div>
						<div class="two">
							<div class="field"><label for="kids">Kinder</label><input id="kids" name="kids" type="number" min="0" max="10" value={i.mine?.kids ?? 1} /></div>
							<div class="field"><label for="adults">Erwachsene</label><input id="adults" name="adults" type="number" min="0" max="10" value={i.mine?.adults ?? 0} /></div>
						</div>
						<div class="field"><label for="note">Notiz an die Gastgeber <span class="muted">(optional, z. B. Allergien)</span></label><input id="note" name="note" maxlength="300" value={i.mine?.note ?? ''} /></div>
						<div class="btns">
							<button class="btn" name="answer" value="ja">Wir kommen</button>
							<button class="btn secondary" name="answer" value="vielleicht">Vielleicht</button>
							<button class="btn secondary" name="answer" value="nein">Leider nicht</button>
						</div>
						<p class="muted small">Deine Antwort sehen nur die Gastgeber{i.guestsSeeList ? ' (und bei Zusage die Namen der anderen Zusagen)' : ''}. Gespeichert bis 30 Tage nach dem Termin.{data.member ? '' : ' Du brauchst kein Konto; zum Ändern diesen Link im selben Browser öffnen.'}</p>
					</form>
				{/if}
			</section>
		{/if}

		{#if i.chatRoomId}
			<section class="card">
				<h2>Gäste-Chat</h2>
				{#if i.chatAvailable}
					{#if chatErr}<p class="err" role="alert">{chatErr}</p>{/if}
					<form method="POST" action="?/chat" use:enhance={() => {
						busy = true;
						chatErr = '';
						return async ({ result, update }) => {
							if (result.type === 'success' && result.data?.roomId) {
								try {
									const { joinTreffen } = await import('$lib/chat/actions');
									await joinTreffen(String(result.data.roomId));
									await goto(`/nachrichten/chat/${encodeURIComponent(String(result.data.roomId))}`);
								} catch (e) {
									chatErr = (e as Error).message || 'Beitritt fehlgeschlagen.';
								}
							} else await update();
							busy = false;
						};
					}}>
						<button class="btn small secondary" disabled={busy}>{busy ? 'Trete bei …' : 'Zum Gäste-Chat'}</button>
					</form>
					<p class="muted small">Verschlüsselt. Du siehst Nachrichten ab deinem Beitritt. Wird 2 Tage nach dem Termin gelöscht.</p>
				{:else if !data.member}
					<p class="small">Für den Gäste-Chat brauchst du ein Konto: <a href="/anmelden?weiter=/e/{data.token}">anmelden</a> und dann zusagen.</p>
				{:else}
					<p class="small">Nach deiner Zusage kannst du dem Gäste-Chat beitreten.</p>
				{/if}
			</section>
		{/if}
	{/if}
</div>

<style>
	.narrow {
		max-width: 40rem;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}
	.inv {
		border-top: 8px solid var(--yellow);
		display: grid;
		gap: var(--sp-2);
	}
	.kicker {
		margin: 0;
		font-weight: 700;
		color: var(--ink-2);
	}
	h1 {
		margin: 0;
	}
	h2 {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-l);
	}
	.when,
	.where {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		margin: 0;
	}
	.when {
		font-weight: 700;
	}
	.msg {
		white-space: pre-line;
	}
	.rf {
		display: grid;
		gap: var(--sp-3);
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: 1fr 1fr;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.err {
		color: var(--danger);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
