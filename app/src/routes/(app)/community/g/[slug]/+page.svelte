<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PostCard from '$lib/components/community/PostCard.svelte';
	import { renderMarkup } from '$lib/markup';
	import { GROUP_KIND_UI } from '$lib/community';
	let { data, form } = $props();
	const g = $derived(data.g);
</script>

<svelte:head><title>{g.name} – Gruppen</title></svelte:head>

<div class="page">
	<a class="back" href="/community/gruppen"><Icon name="zurueck" size={18} />Gruppen</a>
	<header class="head k-{g.kind}">
		<p class="kind">{GROUP_KIND_UI[g.kind].icon} {GROUP_KIND_UI[g.kind].label}</p>
		<h1>{g.name}</h1>
		<p>{g.description}</p>
		<p class="meta">{[g.topic, g.region, g.members !== null ? `${g.members < 5 ? 'wenige' : g.members} Mitglieder` : null].filter(Boolean).join(' · ')}</p>
		{#if g.access.member && g.access.pseudonym}<p class="pseudo">Du bist hier als <strong>{g.access.pseudonym}</strong> unterwegs.</p>{/if}
		<div class="row">
			{#if g.access.member}
				<a class="btn" href="/community/neu?gruppe={g.slug}"><Icon name="plus" size={18} />In der Gruppe schreiben</a>
				<form method="POST" action="?/verlassen" onsubmit={(e) => { if (!confirm('Gruppe verlassen?')) e.preventDefault(); }}><button class="btn secondary small">Verlassen</button></form>
			{/if}
			{#if g.access.moderator || g.access.partner}<a class="btn secondary small" href="/community/g/{g.slug}/verwalten">Verwalten{data.pending ? ` (${data.pending} Anfragen)` : ''}</a>{/if}
		</div>
	</header>

	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'joined' in form}
		<Notice kind="ok">{form.joined === 'aktiv' ? 'Willkommen in der Gruppe!' : 'Deine Anfrage ist bei der Gruppenmoderation. Du bekommst eine Mitteilung.'}</Notice>
	{/if}

	{#if g.rules}
		<details class="rules" open={!g.access.member}><summary>Gruppenregeln</summary><div class="prose">{@html renderMarkup(g.rules)}</div></details>
	{/if}

	{#if !g.access.member}
		{#if g.access.status === 'angefragt'}
			<Notice kind="info" title="Anfrage läuft">Die Gruppenmoderation{g.partner ? ` oder ${g.partner.name}` : ''} prüft deine Anfrage.</Notice>
		{:else if g.access.status === 'entfernt'}
			<Notice kind="warn">Du wurdest aus dieser Gruppe entfernt.</Notice>
		{:else}
			<form method="POST" action="?/beitreten" class="join">
				<h2>{g.kind === 'offen' ? 'Beitreten' : 'Aufnahme anfragen'}</h2>
				{#if g.kind === 'geschuetzt'}
					<p class="muted">Hier trittst du mit einem eigenen Namen auf, nicht mit deinem Profil. Er ist für andere nicht mit dir verknüpfbar. Deine Antworten liest nur die Gruppenmoderation{g.partner ? ` und die Partnerorganisation ${g.partner.name}` : ''}, sie werden nach der Entscheidung gelöscht. Wir verlangen keine Ausweise oder Nachweise – und können deshalb auch keine absolute Sicherheit versprechen.</p>
					<div class="field">
						<label for="pseudonym">Dein Name in dieser Gruppe</label>
						<input id="pseudonym" name="pseudonym" required minlength="3" maxlength="30" placeholder="z. B. Möwe_HB" />
					</div>
					{#each g.admission as q, i}
						<div class="field"><label for="a{i}">{q}</label><textarea id="a{i}" name="answer" rows="2" maxlength="600" required></textarea></div>
					{/each}
				{:else if g.kind === 'beitritt'}
					<p class="muted">Die Gruppenmoderation{g.partner ? ` oder die Partnerorganisation ${g.partner.name}` : ''} bestätigt Beitritte.</p>
				{/if}
				<button class="btn">{g.kind === 'offen' ? 'Beitreten' : 'Anfrage senden'}</button>
			</form>
		{/if}
	{/if}

	{#if data.posts}
		<section>
			<h2 class="sr">Beiträge</h2>
			{#if data.posts.items.length}
				<ul class="feed">{#each data.posts.items as item (item.id)}<li><PostCard {item} /></li>{/each}</ul>
				{#if data.posts.next}<a class="btn secondary" href="?vor={encodeURIComponent(data.posts.next)}">Ältere laden</a>{/if}
			{:else}
				<p class="muted">Noch keine Beiträge in dieser Gruppe.</p>
			{/if}
		</section>
	{:else if g.kind !== 'offen'}
		<p class="muted lockinfo">🔒 Beiträge {g.kind === 'geschuetzt' ? 'und Mitglieder ' : ''}sind nur für Gruppenmitglieder sichtbar.</p>
	{/if}
</div>

<style>
	.page {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-4);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.head {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-2);
		border-top: 6px solid var(--sky);
	}
	.head.k-geschuetzt {
		border-top-color: var(--sea);
	}
	.head h1 {
		margin: 0;
	}
	.head p {
		margin: 0;
	}
	.kind,
	.meta {
		font-size: var(--fs-s);
		color: var(--ink-2);
		font-weight: 650;
	}
	.pseudo {
		font-size: var(--fs-s);
	}
	.row {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-top: var(--sp-2);
	}
	.row .btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.rules {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-3) var(--sp-4);
	}
	.rules summary {
		font-weight: 700;
		cursor: pointer;
	}
	.join {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
		display: grid;
		gap: var(--sp-3);
	}
	.join h2 {
		margin: 0;
	}
	.feed {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.lockinfo {
		text-align: center;
		padding: var(--sp-5);
	}
</style>
