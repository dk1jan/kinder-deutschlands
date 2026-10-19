<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ReportBox from '$lib/components/community/ReportBox.svelte';
	import { CONDITIONS, LISTING_STATUS, MARKET_CATEGORIES, MARKET_KINDS, SAFETY_CATEGORIES, priceLabel } from '$lib/alltag';
	import { ageLabel } from '$lib/angebote';

	let { data, form } = $props();
	const l = $derived(data.l);
	const saved = $derived(form && 'saved' in form ? !!form.saved : data.saved);
	const d = (x: string | Date) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
	let shown = $state(0);
	const age = $derived(ageLabel(l.ageMin, l.ageMax));
	const active = $derived(l.status === 'verfuegbar' || l.status === 'reserviert');
</script>

<svelte:head><title>{l.title} – Marktplatz</title><meta name="robots" content="noindex" /></svelte:head>

<article class="ml">
	<a class="back" href="/marktplatz"><Icon name="zurueck" size={18} />Marktplatz</a>
	{#if data.held || l.status === 'pruefung'}<Notice kind="info" title="Wird geprüft">Deine Anzeige enthält vermutlich private Daten (z. B. Telefonnummer). Die Moderation schaut kurz drauf, bevor andere sie sehen.</Notice>{/if}
	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}
	{#if form && 'reported' in form}<Notice kind="ok">Danke, die Moderation schaut es sich an.</Notice>{/if}

	<div class="cols">
		<div class="gallery">
			{#if l.images.length}
				<img class="main" src="/medien/{l.images[shown]?.id}" alt={l.images[shown]?.alt ?? `Foto: ${l.title}`} width={l.images[shown]?.width} height={l.images[shown]?.height} />
				{#if l.images.length > 1}
					<div class="thumbs">{#each l.images as img, i}<button type="button" class:on={i === shown} onclick={() => (shown = i)} aria-label="Foto {i + 1}"><img src="/medien/{img.id}" alt="" /></button>{/each}</div>
				{/if}
			{:else}
				<div class="noimg"><Icon name="bild" size={48} /><span>Kein Foto</span></div>
			{/if}
		</div>

		<div class="info">
			<p class="kind">{MARKET_KINDS[l.kind as keyof typeof MARKET_KINDS]} · {MARKET_CATEGORIES[l.category as keyof typeof MARKET_CATEGORIES]}</p>
			<h1>{l.title}</h1>
			<p class="price" class:free={l.kind === 'verschenken'}>{priceLabel(l.kind, l.priceCents, l.negotiable)}</p>
			{#if l.status !== 'verfuegbar'}<p class="status">{LISTING_STATUS[l.status as keyof typeof LISTING_STATUS] ?? l.status}</p>{/if}
			<dl class="facts">
				{#if l.condition}<div><dt>Zustand</dt><dd>{CONDITIONS[l.condition as keyof typeof CONDITIONS]}</dd></div>{/if}
				{#if l.sizeText}<div><dt>Größe</dt><dd>{l.sizeText}</dd></div>{/if}
				{#if age}<div><dt>Alter</dt><dd>{age}</dd></div>{/if}
				<div><dt>Gegend</dt><dd>{l.regionName ?? '–'}</dd></div>
				<div><dt>Eingestellt</dt><dd>{d(l.createdAt)}{active ? ` · läuft bis ${d(l.expiresAt)}` : ''}</dd></div>
				<div><dt>Von</dt><dd>{l.seller.name}{l.seller.others ? ` · ${l.seller.others} weitere ${l.seller.others === 1 ? 'Anzeige' : 'Anzeigen'}` : ''}</dd></div>
			</dl>
			{#if SAFETY_CATEGORIES.includes(l.category) && l.kind !== 'suchen'}
				<p class="safety"><strong>Sicherheitsrelevanter Artikel.</strong> {l.safetyAck ? 'Die anbietende Person bestätigt ihre Angaben zu Zustand, Unfallfreiheit und Vollständigkeit.' : ''} Bitte vor Ort prüfen: Gurte, Verschlüsse, Risse, Prüfnorm-Aufkleber und Herstellungsjahr. Wir prüfen Artikel nicht.</p>
			{/if}

			{#if l.mine}
				<section class="own">
					<h2>Deine Anzeige</h2>
					{#if l.status !== 'pruefung' && l.status !== 'entfernt'}
						<form method="POST" action="?/status" class="row">
							{#each [['verfuegbar', 'Verfügbar'], ['reserviert', 'Reserviert'], ['abgegeben', 'Abgegeben']] as [k, lab]}
								<button class="btn small" class:secondary={l.status !== k} name="status" value={k} disabled={l.status === 'abgelaufen' && k !== 'abgegeben'}>{lab}</button>
							{/each}
						</form>
						<div class="row">
							<a class="btn small secondary" href="/marktplatz/{l.id}/bearbeiten">Bearbeiten</a>
							{#if l.status !== 'abgegeben'}<form method="POST" action="?/verlaengern"><button class="btn small secondary">Um 30 Tage verlängern</button></form>{/if}
							<form method="POST" action="?/loeschen" onsubmit={(e) => { if (!confirm('Anzeige löschen?')) e.preventDefault(); }}><button class="btn small secondary">Löschen</button></form>
						</div>
						{#if l.images.length < 6}
							<details><summary>Fotos hinzufügen</summary>
								<form method="POST" action="?/bilder" enctype="multipart/form-data" class="stack">
									<input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple required />
									<label class="check"><input type="checkbox" name="no_people" required /> <span>Keine Personen erkennbar.</span></label>
									<button class="btn small">Hochladen</button>
								</form>
							</details>
						{/if}
						{#if l.images.length}
							<details><summary>Foto entfernen</summary>
								<div class="row">{#each l.images as img, i}<form method="POST" action="?/bildWeg"><input type="hidden" name="media" value={img.id} /><button class="btn small secondary">Foto {i + 1} entfernen</button></form>{/each}</div>
							</details>
						{/if}
					{/if}
				</section>
			{:else}
				<div class="row">
					<form method="POST" action="?/merken" use:enhance><button class="btn small" class:secondary={!saved} aria-pressed={saved}><Icon name="stern" size={16} /> {saved ? 'Gemerkt' : 'Merken'}</button></form>
				</div>
				{#if active}
					<section class="contact">
						<h2>{l.kind === 'suchen' ? 'Ich habe das' : 'Interesse?'}</h2>
						{#if l.contact === 'kontakt' || (form && 'inquired' in form && form.inquired === 'direkt')}
							<p>Ihr seid schon verbunden.</p>
							<a class="btn small" href="/nachrichten/familie?id={l.seller.contactId}">Nachricht schreiben</a>
						{:else if l.contact === 'angefragt' || (form && 'inquired' in form)}
							<Notice kind="ok">Deine Anfrage ist unterwegs. Sobald sie angenommen wird, könnt ihr verschlüsselt chatten. Du findest sie unter <a href="/nachrichten?ansicht=kontakte">Kontakte</a>.</Notice>
						{:else}
							<form method="POST" action="?/anfragen" class="stack">
								<label for="msg">Nachricht an die anbietende Person</label>
								<textarea id="msg" name="message" rows="3" maxlength="500" required minlength="5" placeholder="Hallo, ist der Artikel noch da? Ich könnte am Samstag abholen."></textarea>
								<p class="muted small">Geht als Kontaktanfrage über die Familien-ID. Keine Telefonnummer nötig. Übergabeort vereinbart ihr im Chat – am besten an einem öffentlichen Ort.</p>
								<button class="btn small">Anfrage senden</button>
							</form>
						{/if}
					</section>
				{/if}
				<ReportBox action="?/melden" type="listing" id={l.id} label="Anzeige melden (Betrug, unzulässig …)" />
			{/if}
		</div>
	</div>

	{#if l.description}<section class="card"><h2>Beschreibung</h2><p class="desc">{l.description}</p></section>{/if}
	<p class="muted small">Kein Kauf über Kinder Deutschlands: keine Bezahlung, kein Versand, keine Garantie. Nicht vorab überweisen. Bei Verdacht auf Betrug bitte melden.</p>
</article>

<style>
	.ml {
		max-width: var(--wide);
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
	.cols {
		display: grid;
		gap: var(--sp-5);
	}
	@media (min-width: 860px) {
		.cols {
			grid-template-columns: 1.1fr 1fr;
		}
	}
	.main {
		width: 100%;
		height: auto;
		max-height: 70vh;
		object-fit: contain;
		background: var(--line);
		border-radius: var(--radius-m);
	}
	.thumbs {
		display: flex;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		flex-wrap: wrap;
	}
	.thumbs button {
		padding: 0;
		border: 2px solid transparent;
		border-radius: var(--radius-s);
		background: none;
		cursor: pointer;
		width: 64px;
		height: 64px;
		overflow: hidden;
	}
	.thumbs button.on {
		border-color: var(--navy);
	}
	.thumbs img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.noimg {
		aspect-ratio: 4 / 3;
		display: grid;
		place-items: center;
		align-content: center;
		gap: var(--sp-2);
		background: var(--line);
		border-radius: var(--radius-m);
		color: var(--ink-2);
	}
	.kind {
		margin: 0;
		color: var(--ink-2);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-1) 0;
		font-size: clamp(1.7rem, 1.2rem + 2vw, 2.4rem);
		line-height: 1.1;
	}
	.price {
		font-size: var(--fs-l);
		font-weight: 800;
		margin: 0;
	}
	.price.free {
		color: #1f7468;
	}
	.status {
		display: inline-block;
		background: var(--navy);
		color: var(--yellow);
		font-weight: 800;
		padding: 2px 10px;
		border-radius: 999px;
		margin: var(--sp-2) 0 0;
	}
	.facts {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-4) 0;
	}
	.facts div {
		display: grid;
		grid-template-columns: 7rem 1fr;
		gap: var(--sp-2);
	}
	.facts dt {
		color: var(--ink-2);
	}
	.facts dd {
		margin: 0;
	}
	.safety {
		padding: var(--sp-3);
		border-left: 6px solid var(--yellow);
		background: var(--surface);
		border-radius: var(--radius-s);
		font-size: var(--fs-s);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin: var(--sp-2) 0;
	}
	.row .btn {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.stack {
		display: grid;
		gap: var(--sp-2);
	}
	.own,
	.contact,
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4) var(--sp-5);
		margin: var(--sp-3) 0;
	}
	h2 {
		font-size: var(--fs-m);
		margin: 0 0 var(--sp-2);
	}
	.desc {
		white-space: pre-line;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
	details summary {
		cursor: pointer;
		font-weight: 650;
		min-height: 36px;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
