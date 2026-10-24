<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Editor from '$lib/components/community/Editor.svelte';
	import AuthorName from '$lib/components/community/AuthorName.svelte';
	import LinkCard from '$lib/components/community/LinkCard.svelte';
	import ReportBox from '$lib/components/community/ReportBox.svelte';
	import { renderMarkup } from '$lib/markup';

	let { data, form } = $props();
	const p = $derived(data.post);
	let editing = $state(false);
	let editingComment = $state<string | null>(null);
	let showTw = $state(false);
	const KIND = { frage: 'Frage', beitrag: 'Beitrag', erfahrung: 'Erfahrung', link: 'Link-Tipp', umfrage: 'Umfrage' } as Record<string, string>;
	const STATUS = { pruefung: 'Wird von der Moderation geprüft – noch nicht für andere sichtbar.', ausgeblendet: 'Von der Moderation ausgeblendet.', entfernt: 'Entfernt.' } as Record<string, string>;
	const fmt = (d: Date | string) => new Date(d).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
	const pollTotal = $derived(p.poll ? p.poll.counts.reduce((a, b) => a + b, 0) : 0);
	const solved = $derived(p.comments.find((c) => c.id === p.solvedComment));
	const tw = $derived(p.labels.includes('triggerwarnung') && !p.own && !showTw);
</script>

<svelte:head><title>{p.title} – Community</title></svelte:head>

<article class="page">
	<nav class="crumbs" aria-label="Pfad">
		<a href="/community"><Icon name="zurueck" size={18} />Community</a>
		{#if p.group}<span>·</span><a href="/community/g/{p.group.slug}">{p.group.kind === 'geschuetzt' ? '🔒 ' : ''}{p.group.name}</a>{/if}
		{#if p.topic}<span>·</span><a href="/community?thema={p.topic.key}">{p.topic.name}</a>{/if}
		{#if p.region}<span>·</span><a href="/community?region={p.region.code}">{p.region.name}</a>{/if}
	</nav>

	{#if data.held || p.status !== 'sichtbar'}
		<Notice kind={p.status === 'pruefung' ? 'info' : 'warn'} title={p.status === 'pruefung' ? 'In Prüfung' : 'Nicht sichtbar'}>
			{STATUS[p.status] ?? ''}{p.modNote && p.status !== 'pruefung' ? ` Begründung: ${p.modNote}` : ''}
			{#if p.status === 'pruefung'} Meist innerhalb eines Tages. Tipp: Kontakt lieber über die Familien-ID statt Telefonnummer.{/if}
		</Notice>
	{/if}
	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'reported' in form}<Notice kind="ok">Danke, die Moderation schaut sich das an.</Notice>{/if}
	{#if form && 'appealed' in form}<Notice kind="ok">Dein Einspruch ist eingegangen. Eine andere Person aus der Moderation prüft ihn.</Notice>{/if}
	{#if form && 'held' in form && form.held}<Notice kind="info">{form.held}</Notice>{/if}

	<header class="head">
		<p class="meta">
			<span class="kind">{KIND[p.kind]}</span>
			{#if p.team}<span class="land">Moderatoren-Forum · nur Team</span>{/if}
			{#if p.land}<span class="land">{p.land.invited ? `Eingeladen · ${p.land.name}` : `Nur ${p.land.name}`}</span>{/if}
			{#if p.solvedComment}<span class="ok">✓ gelöst</span>{/if}
			{#if p.pinned}<span>angeheftet</span>{/if}
			{#if p.closed}<span>geschlossen</span>{/if}
			{#if p.archived}<span>archiviert</span>{/if}
			{#if p.labels.includes('werbung')}<span class="warn">Eigenwerbung</span>{/if}
			{#if p.labels.includes('erfahrungsbericht')}<span>Persönliche Erfahrung</span>{/if}
		</p>
		{#if editing}
			<form method="POST" action="?/bearbeiten" use:enhance={() => async ({ update }) => { await update(); editing = false; }} class="editform">
				<input name="title" value={p.title} maxlength="160" required aria-label="Titel" />
				<Editor name="body" value={p.body} label="Text" />
				<div class="row"><button class="btn">Speichern</button><button type="button" class="btn secondary" onclick={() => (editing = false)}>Abbrechen</button></div>
			</form>
		{:else}
			<h1>{p.title}</h1>
			<p class="by">
				<span class="author"><AuthorName author={p.author} />{p.author.pseudonym ? ' (Gruppenname)' : ''}</span>
				{#if p.author.region}<span>· {p.author.region}</span>{/if}
				<span>· {fmt(p.createdAt)}</span>
				{#if p.editedAt}<span>· bearbeitet</span>{/if}
			</p>
		{/if}
	</header>

	{#if !editing}
		{#if p.modNote && p.status === 'sichtbar'}<p class="modnote"><strong>Hinweis der Moderation:</strong> {p.modNote}</p>{/if}
		{#if tw}
			<div class="tw"><p>Dieser Beitrag behandelt ein belastendes Thema.</p><button class="btn small secondary" onclick={() => (showTw = true)}>Trotzdem anzeigen</button></div>
		{:else}
			{#if p.body}<div class="body prose">{@html renderMarkup(p.body, { affiliateTag: data.affiliateTag })}</div>{/if}
			{#if p.card}<LinkCard card={p.card} affiliateTag={data.affiliateTag} />{/if}
			{#if p.media.length}
				<div class="gallery">
					{#each p.media as m}
						<a href="/medien/{m.id}" target="_blank"><img src="/medien/{m.id}" alt={m.alt ?? ''} width={m.width} height={m.height} loading="lazy" /></a>
					{/each}
				</div>
			{/if}
		{/if}

		{#if p.poll}
			<section class="poll" aria-label="Umfrage">
				{#if p.poll.mine === null && !p.poll.closed && !p.closed}
					<form method="POST" action="?/abstimmen" use:enhance>
						{#each p.poll.options as o, i}
							<label class="opt"><input type={p.poll.multiple ? 'checkbox' : 'radio'} name="choice" value={i} /><span>{o}</span></label>
						{/each}
						<button class="btn small">Abstimmen</button>
						<p class="muted small">Ergebnisse siehst du nach deiner Stimme. Wer wie gestimmt hat, sieht niemand.</p>
					</form>
				{:else}
					{#each p.poll.options as o, i}
						{@const pct = pollTotal ? Math.round((p.poll.counts[i] / pollTotal) * 100) : 0}
						<div class="bar" class:mine={p.poll.mine?.includes(i)}>
							<span class="fill" style:width="{pct}%"></span>
							<span class="lbl">{o}{p.poll.mine?.includes(i) ? ' ✓' : ''}</span><span class="pct">{pct} %</span>
						</div>
					{/each}
					<p class="muted small">{p.poll.voters} {p.poll.voters === 1 ? 'Stimme' : 'Stimmen'}{p.poll.closed ? ' · beendet' : p.poll.closesAt ? ` · läuft bis ${fmt(p.poll.closesAt)}` : ''}</p>
				{/if}
			</section>
		{/if}

		{#if p.tags.length}<p class="tags">{#each p.tags as t}<a href="/community?schlagwort={encodeURIComponent(t)}">#{t}</a>{/each}</p>{/if}

		<div class="actions">
			<form method="POST" action="?/merken" use:enhance>
				<button class="btn small secondary" aria-pressed={form && 'bookmarked' in form ? !!form.bookmarked : p.bookmarked}><Icon name="stern" size={16} />{(form && 'bookmarked' in form ? form.bookmarked : p.bookmarked) ? 'Gemerkt' : 'Merken'}</button>
			</form>
			{#if p.own && p.status !== 'entfernt'}
				<button class="btn small secondary" onclick={() => (editing = true)}>Bearbeiten</button>
				<form method="POST" action="?/loeschen" onsubmit={(e) => { if (!confirm('Beitrag wirklich löschen?')) e.preventDefault(); }}><button class="btn small danger">Löschen</button></form>
			{/if}
			{#if !p.own}<ReportBox action="?/melden" type="post" id={p.id} />{/if}
			{#if data.editor && !p.group && p.status === 'sichtbar'}
				<form method="POST" action="?/wissen"><button class="btn small secondary">Als Wissen aufbereiten</button></form>
			{/if}
		</div>
		{#if p.land && p.status === 'sichtbar'}
			<!-- F-023: Landes-Beitrag – gezielt Personen aus anderen Ländern einladen -->
			<section class="invite" aria-labelledby="inv-t">
				<h2 id="inv-t" class="small-h">Nur für {p.land.name}</h2>
				<p class="muted small">Lesen können Mitglieder aus {p.land.name} und Eingeladene. Kennst du jemanden, den das Thema interessiert? Lade die Person mit ihrer Familien-ID ein – sie sieht dann genau diesen Beitrag und kann mitschreiben.</p>
				{#if form && 'invited' in form}<Notice kind="ok">{form.invited} ist eingeladen und bekommt eine Mitteilung.</Notice>{/if}
				<form method="POST" action="?/einladen" use:enhance class="inv-form">
					<label for="inv-id" class="sr">Familien-ID</label>
					<input id="inv-id" name="familien_id" required maxlength="20" autocomplete="off" placeholder="Familien-ID, z. B. K7M 4QX 2HD" />
					<button class="btn small">Einladen</button>
				</form>
				{#if p.own && p.invites.length}
					<ul class="inv-list">
						{#each p.invites as i (i.userId)}
							<li>
								<span>{i.name} <small class="muted">· eingeladen von {i.by}</small></span>
								<form method="POST" action="?/einladungZurueck" use:enhance><input type="hidden" name="user" value={i.userId} /><button class="btn small secondary">Zurücknehmen</button></form>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
		{#if p.canAppeal}
			<details class="appeal">
				<summary>Einspruch einlegen</summary>
				<form method="POST" action="?/einspruch" class="mini">
					<input type="hidden" name="type" value="post" /><input type="hidden" name="id" value={p.id} />
					<textarea name="message" rows="3" minlength="10" maxlength="1000" required placeholder="Warum war die Entscheidung aus deiner Sicht falsch?"></textarea>
					<button class="btn small">Einspruch senden</button>
				</form>
			</details>
		{/if}
		{#if p.moderator}
			<form method="POST" action="?/anheften" class="pinform">
				<button class="btn small secondary">{p.pinned ? 'Nicht mehr oben anheften' : 'Oben anheften'}</button>
				<small class="muted">{p.pinned ? 'Steht gerade ganz oben im Feed.' : 'Erscheint dann ganz oben im Feed – nur für die Moderation sichtbar.'}</small>
			</form>
			<details class="mod">
				<summary>Moderation</summary>
				<form method="POST" action="?/moderieren" class="mini">
					<input type="hidden" name="type" value="post" /><input type="hidden" name="id" value={p.id} />
					<select name="action" aria-label="Aktion">
						<option value="schliessen">{p.closed ? 'Wieder öffnen' : 'Schließen'}</option>
						<option value="archivieren">{p.archived ? 'Aus dem Archiv holen' : 'Archivieren'}</option>
						<option value="kennzeichnen">Mit Hinweis kennzeichnen</option>
						<option value="ausblenden">Ausblenden</option>
						<option value="entfernen">Entfernen</option>
						<option value="wiederherstellen">Wiederherstellen</option>
						<option value="verwarnen">Person verwarnen</option>
					</select>
					<input name="reason" required minlength="3" maxlength="300" placeholder="Begründung (wird der Person mitgeteilt)" aria-label="Begründung" />
					<button class="btn small">Ausführen</button>
				</form>
			</details>
		{/if}
	{/if}

	{#if solved}
		<section class="solution">
			<h2>✓ Lösung</h2>
			<div class="prose">{@html renderMarkup(solved.body, { affiliateTag: data.affiliateTag })}</div>
			<p class="by"><AuthorName author={solved.author} /></p>
		</section>
	{/if}

	<section class="comments" aria-labelledby="antworten">
		<h2 id="antworten">{p.comments.filter((c) => c.status === 'sichtbar').length} {p.comments.length === 1 ? 'Antwort' : 'Antworten'}</h2>
		{#each p.comments as c (c.id)}
			<div class="comment" id="a-{c.id}" class:solved={c.id === p.solvedComment} class:hidden={c.status !== 'sichtbar'}>
				<p class="by"><span class="author"><AuthorName author={c.author} /></span>{#if c.author.region}<span>· {c.author.region}</span>{/if}<span>· {fmt(c.createdAt)}</span>{#if c.editedAt}<span>· bearbeitet</span>{/if}
					{#if c.status !== 'sichtbar'}<span class="warn">· {c.status === 'pruefung' ? 'in Prüfung' : c.status}</span>{/if}
				</p>
				{#if c.modNote && c.status === 'sichtbar'}<p class="modnote small">Hinweis der Moderation: {c.modNote}</p>{/if}
				{#if editingComment === c.id}
					<form method="POST" action="?/antwortBearbeiten" use:enhance={() => async ({ update }) => { await update(); editingComment = null; }}>
						<input type="hidden" name="id" value={c.id} />
						<Editor name="body" value={c.body} label="Antwort bearbeiten" max={8000} rows={4} />
						<div class="row"><button class="btn small">Speichern</button><button type="button" class="btn small secondary" onclick={() => (editingComment = null)}>Abbrechen</button></div>
					</form>
				{:else if c.status === 'entfernt' && !p.moderator}
					<p class="muted">[entfernt]</p>
				{:else}
					<div class="prose">{@html renderMarkup(c.body, { affiliateTag: data.affiliateTag })}</div>
				{/if}
				<div class="cactions">
					{#if !c.own && c.status === 'sichtbar'}
						<form method="POST" action="?/hilfreich" use:enhance><input type="hidden" name="id" value={c.id} /><button class="link" aria-pressed={c.marked}>👍 Hilfreich{c.helpful ? ` · ${c.helpful}` : ''}</button></form>
					{:else if c.helpful}<span class="muted small">👍 {c.helpful}</span>{/if}
					{#if p.own && c.status === 'sichtbar' && (p.kind === 'frage' || p.kind === 'umfrage')}
						<form method="POST" action="?/loesung" use:enhance><input type="hidden" name="id" value={c.id === p.solvedComment ? '' : c.id} /><button class="link">{c.id === p.solvedComment ? 'Lösung aufheben' : '✓ Als Lösung markieren'}</button></form>
					{/if}
					{#if c.own && c.status !== 'entfernt'}
						<button class="link" onclick={() => (editingComment = c.id)}>Bearbeiten</button>
						<form method="POST" action="?/antwortLoeschen" use:enhance onsubmit={(e) => { if (!confirm('Antwort löschen?')) e.preventDefault(); }}><input type="hidden" name="id" value={c.id} /><button class="link">Löschen</button></form>
					{/if}
					{#if !c.own}<ReportBox action="?/melden" type="comment" id={c.id} />{/if}
					{#if c.own && (c.status === 'ausgeblendet' || c.status === 'entfernt')}
						<details><summary class="link">Einspruch</summary>
							<form method="POST" action="?/einspruch" class="mini"><input type="hidden" name="type" value="comment" /><input type="hidden" name="id" value={c.id} />
								<textarea name="message" rows="2" minlength="10" required aria-label="Begründung"></textarea><button class="btn small">Senden</button></form>
						</details>
					{/if}
					{#if p.moderator}
						<details><summary class="link">Moderieren</summary>
							<form method="POST" action="?/moderieren" class="mini"><input type="hidden" name="type" value="comment" /><input type="hidden" name="id" value={c.id} />
								<select name="action" aria-label="Aktion"><option value="ausblenden">Ausblenden</option><option value="entfernen">Entfernen</option><option value="wiederherstellen">Wiederherstellen</option><option value="kennzeichnen">Kennzeichnen</option><option value="verwarnen">Verwarnen</option></select>
								<input name="reason" required minlength="3" placeholder="Begründung" aria-label="Begründung" /><button class="btn small">Ausführen</button></form>
						</details>
					{/if}
				</div>
			</div>
		{:else}
			<p class="muted">Noch keine Antworten.</p>
		{/each}

		{#if p.closed || p.archived}
			<p class="muted">Dieser Beitrag ist {p.archived ? 'archiviert' : 'geschlossen'} – keine neuen Antworten.</p>
		{:else if p.status === 'sichtbar'}
			{#key form}
				<form method="POST" action="?/antworten" use:enhance class="reply">
					<Editor name="body" label="Deine Antwort" rows={4} max={8000} required placeholder="Freundlich, hilfreich, ohne Telefonnummern." />
					<button class="btn">Antworten</button>
				</form>
			{/key}
		{/if}
	</section>
</article>

<style>
	.pinform {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}
	.page {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-4);
	}
	.crumbs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		font-size: var(--fs-s);
	}
	.crumbs a:first-child {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-weight: 650;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
	}
	.meta span {
		font-size: var(--fs-xs);
		font-weight: 700;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--surface-2);
	}
	.meta .ok {
		color: var(--ok);
	}
	.warn {
		color: var(--warn);
	}
	h1 {
		margin: var(--sp-2) 0 var(--sp-1);
		font-size: clamp(1.6rem, 1.2rem + 2vw, 2.4rem);
		line-height: 1.1;
	}
	.by {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.author {
		font-weight: 700;
		color: var(--ink);
	}
	.body {
		font-size: var(--fs-m);
	}
	.modnote {
		margin: 0;
		padding: var(--sp-2) var(--sp-3);
		border-left: 4px solid var(--warn);
		background: var(--surface);
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
	}
	.tw {
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		flex-wrap: wrap;
	}
	.tw p {
		margin: 0;
	}
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: var(--sp-2);
	}
	.gallery img {
		width: 100%;
		height: auto;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: var(--radius-s);
		display: block;
	}
	.poll {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.poll form {
		display: grid;
		gap: var(--sp-2);
	}
	.poll .opt {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-s);
		cursor: pointer;
	}
	.bar {
		position: relative;
		display: flex;
		justify-content: space-between;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-s);
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar .fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: color-mix(in srgb, var(--sky) 70%, transparent);
	}
	.bar.mine .fill {
		background: color-mix(in srgb, var(--yellow) 70%, transparent);
	}
	.bar .lbl,
	.bar .pct {
		position: relative;
		font-weight: 650;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin: 0;
		font-size: var(--fs-s);
	}
	.actions,
	.row,
	.cactions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.actions .btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.mini {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		max-width: 30rem;
	}
	.mod summary,
	.appeal summary {
		cursor: pointer;
		font-weight: 650;
		font-size: var(--fs-s);
	}
	.mod {
		padding: var(--sp-3);
		border: 1.5px dashed var(--warn);
		border-radius: var(--radius-s);
	}
	.editform {
		display: grid;
		gap: var(--sp-3);
	}
	.solution {
		background: color-mix(in srgb, var(--sea) 12%, var(--surface));
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		border-left: 5px solid var(--sea);
	}
	.solution h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-m);
		color: var(--ok);
	}
	.comments {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.comments h2 {
		font-size: var(--fs-l);
		margin: 0;
	}
	.comment {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.comment.solved {
		box-shadow: inset 4px 0 0 var(--sea);
	}
	.comment.hidden {
		opacity: 0.75;
		border: 1.5px dashed var(--line);
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: var(--fs-s);
		color: var(--ink-2);
		cursor: pointer;
	}
	.link:hover,
	.link[aria-pressed='true'] {
		color: var(--ink);
		text-decoration: underline;
	}
	.link[aria-pressed='true'] {
		font-weight: 700;
	}
	.reply {
		display: grid;
		gap: var(--sp-3);
		background: var(--surface);
		padding: var(--sp-4);
		border-radius: var(--radius-m);
	}
	.small {
		font-size: var(--fs-s);
	}
	.meta .land {
		background: var(--ink);
		color: var(--paper);
		padding: 1px 10px;
		border-radius: 999px;
		font-weight: 700;
	}
	.invite {
		margin-top: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		display: grid;
		gap: var(--sp-2);
	}
	.small-h {
		margin: 0;
		font-size: var(--fs-m, 1.05rem);
	}
	.inv-form {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.inv-form input {
		flex: 1 1 14rem;
		min-height: 44px;
	}
	.inv-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-1);
	}
	.inv-list li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-2);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
