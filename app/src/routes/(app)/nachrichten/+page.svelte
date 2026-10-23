<script lang="ts">
	import Planned from '$lib/components/Planned.svelte';
	import ModuleArt from '$lib/components/art/ModuleArt.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ChatList from '$lib/components/chat/ChatList.svelte';
	let { data, form } = $props();
	const via: Record<string, string> = { qr: 'über deinen QR-Code', id: 'über deine ID', entdecken: 'über „Familien entdecken“', markt: 'über den Marktplatz', hilfe: 'über „Familien helfen Familien“' };
</script>

<svelte:head><title>Nachrichten – Kinder Deutschlands</title></svelte:head>

{#if !data.member}
	<Planned
		title="Kontakte und Nachrichten"
		module="M01, M02, M06"
		stage="Kontakte, Chats, Anrufe"
		theme="sea"
		text="Familien über die Familien-ID finden, Kontaktanfragen annehmen, schreiben und anrufen – ohne Telefonnummer oder E-Mail weiterzugeben."
		points={[
			'Kontakt über die Familien-ID oder den QR-Code, angefragt und bestätigt',
			'Blockieren jederzeit: blockierte Familien finden dich nicht mehr',
			'Ende-zu-Ende-verschlüsselte Chats, Anrufe und Gruppenanrufe'
		]}
	>
		{#snippet art()}<ModuleArt name="nachrichten" />{/snippet}
	</Planned>
	<div class="container narrow guest-cta">
		<a class="btn" href="/anmelden?weiter=%2Fnachrichten">Anmelden</a>
	</div>
{:else}
	<div class="container page">
		<h1>Nachrichten</h1>
		<nav class="viewtabs" aria-label="Ansicht">
			<a href="/nachrichten" aria-current={data.view === 'chats' ? 'page' : undefined}>Chats</a>
			<a href="/nachrichten?ansicht=kontakte" aria-current={data.view === 'kontakte' ? 'page' : undefined}>Kontakte{#if data.incoming.length} <span class="count small">{data.incoming.length}</span>{/if}</a>
		</nav>
		{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
		{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

		{#if data.view === 'chats'}
			{#if data.incoming.length}
				<p class="reqhint"><a href="/nachrichten?ansicht=kontakte#neu">{data.incoming.length === 1 ? 'Eine neue Kontaktanfrage' : `${data.incoming.length} neue Kontaktanfragen`}</a> – nach dem Annehmen könnt ihr schreiben.</p>
			{/if}
			<ChatList />
		{:else}
		<section class="find card">
			<form method="GET" action="/nachrichten/familie" class="search">
				<div class="field">
					<label for="id">Familie über ihre ID finden</label>
					<span class="hint">Neun Zeichen, zum Beispiel K7M-4QX-2HD. Bindestriche und Groß-/Kleinschreibung egal.</span>
					<input id="id" name="id" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="15" required />
				</div>
				<button class="btn" type="submit">Suchen</button>
			</form>
			<p class="alt"><a href="/nachrichten/entdecken">Oder Familien in deiner Region entdecken</a></p>
		</section>

		{#if data.incoming.length}
			<section class="block" aria-labelledby="neu">
				<h2 id="neu">Neue Anfragen <span class="count">{data.incoming.length}</span></h2>
				<ul class="list">
					{#each data.incoming as r}
						<li class="item">
							<div>
								<a class="who" href={`/nachrichten/familie?id=${r.cid}`}>{r.name ?? 'Familie'} <span class="muted">{r.contactId}</span></a>
								<p class="muted meta">{r.at}, {via[r.via] ?? ''}</p>
								{#if r.ref}<p class="meta">{r.ref.kind === 'listing' ? 'Anzeige' : 'Eintrag'}: <a href={r.ref.href}>{r.ref.title}</a></p>{/if}
								{#if r.message}<p class="msg">„{r.message}“</p>{/if}
							</div>
							<div class="acts">
								<form method="POST" action="?ansicht=kontakte&/annehmen"><input type="hidden" name="id" value={r.id} /><button class="btn small signal" type="submit">Annehmen</button></form>
								<form method="POST" action="?ansicht=kontakte&/ablehnen"><input type="hidden" name="id" value={r.id} /><button class="btn small secondary" type="submit">Ablehnen</button></form>
								<form method="POST" action="?ansicht=kontakte&/anfrageBlockieren"><input type="hidden" name="id" value={r.id} /><button class="btn small danger" type="submit">Blockieren</button></form>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="block" aria-labelledby="kontakte">
			<h2 id="kontakte">Deine Kontakte</h2>
			{#if data.contacts.length === 0}
				<p class="empty">Noch keine Kontakte. Zeig deine Familien-ID oder deinen <a href="/profil/qr">QR-Code</a>, oder suche eine Familie über ihre ID.</p>
			{:else}
				<ul class="list">
					{#each data.contacts as c}
						<li class="item">
							<div>
								<a class="who" href={`/nachrichten/familie?id=${c.cid}`}>{c.name ?? 'Familie'} <span class="muted">{c.id}</span></a>
								<p class="muted meta">Verbunden seit {c.since}</p>
							</div>
							<a class="btn small" href={`/nachrichten/chat/neu?mit=${c.cid}`}>Nachricht</a>
							<details class="more">
								<summary>Optionen</summary>
								<div class="acts">
									<form method="POST" action="?ansicht=kontakte&/entfernen"><input type="hidden" name="cid" value={c.cid} /><button class="btn small secondary" type="submit">Kontakt entfernen</button></form>
									<form method="POST" action="?ansicht=kontakte&/blockieren"><input type="hidden" name="cid" value={c.cid} /><button class="btn small danger" type="submit">Blockieren</button></form>
								</div>
							</details>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="muted chatnote">Schreiben und anrufen könnt ihr Ende-zu-Ende-verschlüsselt über „Nachricht“.</p>
		</section>

		{#if data.outgoing.length}
			<section class="block" aria-labelledby="gesendet">
				<h2 id="gesendet">Gesendete Anfragen</h2>
				<ul class="list">
					{#each data.outgoing as r}
						<li class="item">
							<div><span class="who">{r.contactId}</span><p class="muted meta">gesendet am {r.at}</p></div>
							<form method="POST" action="?ansicht=kontakte&/zurueckziehen"><input type="hidden" name="id" value={r.id} /><button class="btn small secondary" type="submit">Zurückziehen</button></form>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.blocked.length}
			<section class="block" aria-labelledby="blockiert">
				<h2 id="blockiert">Blockiert</h2>
				<ul class="list">
					{#each data.blocked as b}
						<li class="item">
							<span class="who">{b.contactId}</span>
							<form method="POST" action="?ansicht=kontakte&/freigeben"><input type="hidden" name="cid" value={b.cid} /><button class="btn small secondary" type="submit">Blockierung aufheben</button></form>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{/if}
	</div>
{/if}

<style>
	.viewtabs {
		display: flex;
		gap: var(--sp-1);
		margin: 0 0 var(--sp-5);
		border-bottom: 2px solid var(--line);
	}
	.viewtabs a {
		padding: var(--sp-2) var(--sp-4);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 700;
		border-bottom: 4px solid transparent;
		margin-bottom: -2px;
	}
	.viewtabs a[aria-current='page'] {
		color: var(--ink);
		border-bottom-color: var(--yellow);
	}
	.count.small {
		min-width: 1.5rem;
		height: 1.5rem;
		font-size: var(--fs-xs);
	}
	.reqhint {
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-m);
		background: #fff3d1;
		color: var(--navy);
		max-width: 52rem;
	}
	.reqhint a {
		color: var(--navy);
		font-weight: 700;
	}
	.guest-cta {
		margin-top: calc(-1 * var(--sp-6));
		padding-bottom: var(--sp-8);
	}
	.find {
		margin-bottom: var(--sp-6);
		border-top: 8px solid var(--yellow);
		max-width: 44rem;
	}
	.search {
		display: grid;
		gap: 0 var(--sp-3);
	}
	.search input {
		font-family: var(--font-display);
		font-size: var(--fs-l);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.alt {
		margin: var(--sp-2) 0 0;
	}
	.block {
		margin-bottom: var(--sp-7);
	}
	.block h2 {
		font-size: var(--fs-xl);
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.count {
		display: inline-grid;
		place-items: center;
		min-width: 2rem;
		height: 2rem;
		padding: 0 var(--sp-2);
		border-radius: 999px;
		background: var(--red);
		color: #fff;
		font-size: var(--fs-s);
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-3);
		max-width: 52rem;
	}
	.item {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
	}
	.who {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: var(--fs-l);
		color: var(--ink);
		text-decoration: none;
	}
	a.who:hover {
		text-decoration: underline;
	}
	.who .muted {
		font-family: var(--font-body);
		font-size: var(--fs-s);
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	.meta {
		margin: 0;
		font-size: var(--fs-s);
	}
	.msg {
		margin: var(--sp-2) 0 0;
		font-style: italic;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.more summary {
		cursor: pointer;
		color: var(--ink-2);
		font-size: var(--fs-s);
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.more[open] .acts {
		margin-top: var(--sp-2);
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
	.chatnote {
		font-size: var(--fs-s);
		margin-top: var(--sp-4);
	}
	@media (min-width: 700px) {
		.search {
			grid-template-columns: 1fr auto;
			align-items: end;
		}
		.search .btn {
			margin-bottom: var(--sp-4);
		}
	}
</style>
