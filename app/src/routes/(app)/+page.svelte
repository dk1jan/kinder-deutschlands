<script lang="ts">
	import Bunting from '$lib/components/art/Bunting.svelte';
	import Pram from '$lib/components/art/Pram.svelte';
	import ModuleArt from '$lib/components/art/ModuleArt.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import AreaTiles from '$lib/components/AreaTiles.svelte';
	import { GROUPS } from '$lib/areas';
	let { data } = $props();

	// Datenübersicht (F-029): was schon drin ist – echte Zählung, Gruppen wie auf der Karte
	const c = (k: string) => (data.counts as Record<string, number | undefined>)[k] ?? 0;
	const facts = $derived(
		[
			{ n: c('spielplatz'), l: 'Spielplätze' },
			{ n: c('toilette') + c('wickelraum'), l: 'Toiletten und Wickelplätze' },
			{ n: c('indoorspielplatz'), l: 'Indoorspielplätze' },
			{ n: c('ausflugsort') + c('schwimmbad'), l: 'Ausflugsziele und Bäder' },
			{ n: c('familiencafe') + c('stillraum'), l: 'Eltern- und Familiencafés, Stillorte' },
			{ n: c('unterkunft'), l: 'Unterkünfte für Familien' },
			{ n: c('bibliothek') + c('familienzentrum'), l: 'Bibliotheken und Familienzentren' }
		].filter((f) => f.n > 0)
	);
	const total = $derived(Object.values(data.counts as Record<string, number>).reduce((a, b) => a + (b ?? 0), 0));
	const fmtN = (n: number) => n.toLocaleString('de-DE');

	type Theme = 'sea' | 'yellow' | 'sky' | 'red' | 'navy' | 'paper';
	const modules: { art: 'karte' | 'treffen' | 'community' | 'radar' | 'markt' | 'nachrichten'; title: string; text: string; stage: string; theme: Theme; href?: string }[] = $derived([
		{
			art: 'karte',
			title: 'Die Familienkarte',
			text: 'Spielplätze, Wickelmöglichkeiten, Toiletten und Ausflugsziele. Jeder Ort mit Quelle und Stand, Erfahrungen nur von echten Eltern.',
			stage: (data.counts.spielplatz ?? 0) > 0 ? `${(data.counts.spielplatz ?? 0).toLocaleString('de-DE')} Spielplätze` : 'Daten werden übernommen',
			theme: 'sea',
			href: '/karte'
		},
		{
			art: 'treffen',
			title: 'Treffen',
			text: 'Kinderwagenrunde im Park? Treffpunkt teilen und den Standort nur für 15, 30 oder 60 Minuten freigeben.',
			stage: 'Treffpunkt teilen, Standort auf Zeit',
			theme: 'yellow',
			href: '/nachrichten/treffen'
		},
		{
			art: 'community',
			title: 'Fragen und Gruppen',
			text: 'Austausch nach Region und Thema. Geschützte Gruppen, zum Beispiel für Alleinerziehende, sind für Fremde unsichtbar.',
			stage: 'Fragen, Gruppen, Wissen',
			theme: 'sky',
			href: '/community'
		},
		{
			art: 'radar',
			title: 'Veranstaltungen und Familienradar',
			text: 'Flohmärkte, Ferienprogramme, freie Kursplätze und neue Leistungen aus deiner Region – auf Wunsch einmal pro Woche gesammelt.',
			stage: 'Termine, freie Plätze, Hinweise',
			theme: 'red',
			href: '/veranstaltungen'
		},
		{
			art: 'markt',
			title: 'Marktplatz',
			text: 'Kinderwagen, Kleidung und Spielzeug weitergeben. Kontakt über die Familien-ID, die Übergabe vereinbart ihr selbst.',
			stage: 'Verkaufen, verschenken, tauschen, suchen',
			theme: 'navy',
			href: '/marktplatz'
		},
		{
			art: 'nachrichten',
			title: 'Schreiben und anrufen',
			text: 'Nachrichten, Gruppen-Chats und Anrufe über die Familien-ID, Ende-zu-Ende-verschlüsselt.',
			stage: 'Chat und Anrufe verschlüsselt',
			theme: 'paper',
			href: '/nachrichten'
		}
	]);

	const promises = [
		{ title: 'Keine Telefonnummern, keine Adressen', text: 'Kontakt läuft über die Familien-ID. Was andere sehen, entscheidest du.' },
		{ title: 'Keine Kinderprofile', text: 'Konten gehören Erwachsenen. Namen und Geburtstage von Kindern musst du nirgends angeben.' },
		{ title: 'Nichts Erfundenes', text: 'Keine gekauften Bewertungen, keine geschönten Mitgliederzahlen, keine Platzhalter-Familien.' },
		{ title: 'Kein Handel mit Familiendaten', text: 'Die Finanzierung wird offen gelegt. Private Chats und geschützte Gruppen bleiben werbefrei.' }
	];
</script>

<svelte:head>
	<title>Kinder Deutschlands – Familien finden Familien</title>
	<meta name="description" content="Geschütztes Familiennetzwerk für Eltern in ganz Deutschland: Kontakt über eine Familien-ID statt Telefonnummer, Familienkarte, Unwetterwarnungen, Treffen und Gruppen." />
</svelte:head>

<section class="hero">
	<Bunting />
	<div class="container hero-grid">
		<div class="copy">
			<span class="tag">Für Familien in ganz Deutschland.</span>
			<h1 class="display">Familien finden Familien.</h1>
			<p class="lead">
				Kinder Deutschlands verbindet Familien in deiner Gegend. Mit einer eigenen Familien-ID statt Telefonnummer, einer
				Karte voller Spielplätze und Familienorte und Gruppen, die geschützt bleiben.
				Adresse und Telefonnummer bleiben bei dir – du bestimmst, wer was sieht.
			</p>
			{#if data.deleted}<Notice kind="ok" title="Konto gelöscht">Deine Daten wurden entfernt. Danke, dass du dabei warst.</Notice>{/if}
			<div class="cta">
				{#if data.user}
					<a class="btn signal" href="/profil">Meine Familien-ID</a>
					<a class="btn secondary" href="/nachrichten">Kontakte</a>
				{:else if data.mailOpen}
					<a class="btn signal" href="/registrieren">Konto anlegen</a>
					<a class="btn secondary" href="/anmelden">Anmelden</a>
				{:else}
					<a class="btn signal" href="#familien-id">So funktioniert die Familien-ID</a>
					<a class="btn secondary" href="/anmelden">Anmelden</a>
				{/if}
			</div>
		</div>
		<div class="visual">
			<Pram />
		</div>
	</div>
	<svg class="wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
		<path d="M0 60 C120 30 240 30 360 52 S600 84 720 58 S960 18 1080 44 S1320 80 1440 50 V90 H0 Z" fill="var(--band)" />
	</svg>
</section>

<section class="band" id="familien-id" aria-labelledby="id-titel">
	<div class="container id-grid">
		<div>
			<h2 id="id-titel">Ein Wimpel statt deiner Handynummer.</h2>
			<p class="band-lead">
				Jedes Mitglied bekommt eine Familien-ID mit QR-Code: auf dem Handy, als Anhänger oder als Wimpel am Kinderwagen.
				Wer scannt, sieht nur, was du freigibst.
			</p>
			<ol class="steps">
				<li><span><strong>Zeigen.</strong> Auf dem Spielplatz, im Kurs, beim Spaziergang.</span></li>
				<li><span><strong>Scannen lassen.</strong> Die andere Person sieht deine freigegebene Kontaktkarte, kein Vollprofil.</span></li>
				<li><span><strong>Anfrage annehmen oder nicht.</strong> Ihr schreibt über die Plattform. Nummer und Adresse bleiben bei dir.</span></li>
			</ol>
		</div>
		<figure class="idcard">
			<div class="tagcard">
				<span class="hole" aria-hidden="true"></span>
				<span class="kind">Familien-ID</span>
				<span class="code" aria-label="Beispiel-ID K 7 M, 4 Q X, 2 H D">K7M 4QX 2HD</span>
				<div class="qr">{@html data.qr}</div>
			</div>
			<figcaption>Beispiel. Echte Familien-IDs haben genau dieses Format, der QR-Code oben führt auf diese Seite.</figcaption>
		</figure>
	</div>
</section>

<section class="container tilesec" aria-labelledby="bereiche">
	<h2 id="bereiche">Was es hier alles gibt.</h2>
	<p class="lead">Alle Bereiche findest du auch im Menü.{data.user ? '' : ' Manche sind nur für Mitglieder.'}</p>
	{#each GROUPS as g (g.id)}
		<h3 class="grp-t">{g.label}</h3>
		<AreaTiles group={g.id} member={!!data.user} />
	{/each}
</section>

<section class="modules" aria-labelledby="mod-titel">
	<div class="container">
		<div class="mod-head">
			<h2 id="mod-titel">Alles für den Familienalltag.</h2>
			<p class="lead">Vom Spielplatz um die Ecke bis zur Kinderwagenrunde, vom Marktplatz bis zum verschlüsselten Chat – in ganz Deutschland.</p>
		</div>
	</div>
	<ul class="cards" role="list">
		{#each modules as m}
			<li class="postcard {m.theme}" class:live={!!m.href}>
				<ModuleArt name={m.art} />
				<h3>{#if m.href}<a href={m.href}>{m.title}</a>{:else}{m.title}{/if}</h3>
				<p>{m.text}</p>
				<span class="stage">{m.stage}</span>
			</li>
		{/each}
	</ul>
</section>

<section class="warnband" aria-labelledby="warn-titel">
	<div class="container warn-grid">
		<div>
			<p class="eyebrow">Deutscher Wetterdienst</p>
			<h2 id="warn-titel">Warnungen direkt aufs Handy.</h2>
			<p class="band-lead">
				Der Deutsche Wetterdienst ist der amtliche Wetterdienst des Bundes. Seine Warnungen vor Sturm, Starkregen oder Gewitter bekommst du hier bei uns – du musst
				nichts installieren. Wähle deine Region, gern gleich für Kita, Schule oder Großeltern mit. Neue Warnungen kommen als Mitteilung und auf Wunsch aufs Handy,
				für jeden Kreis in Deutschland.
			</p>
			{#if data.warn.severe > 0}
				<p class="warn-live"><span class="pulse" aria-hidden="true"></span>Gerade aktiv: {data.warn.severe.toLocaleString('de-DE')} {data.warn.severe === 1 ? 'Unwetterwarnung' : 'Unwetterwarnungen'} in {data.warn.kreise === 1 ? '1 Kreis' : `${data.warn.kreise.toLocaleString('de-DE')} Kreisen`}</p>
			{:else if data.warn.markant > 0}
				<p class="warn-live calm">Gerade aktiv: {data.warn.markant.toLocaleString('de-DE')} {data.warn.markant === 1 ? 'markante Wetterwarnung' : 'markante Wetterwarnungen'}</p>
			{/if}
			<div class="cta">
				<a class="btn signal" href="/warnungen">{data.user ? 'Warnungen einrichten' : 'Warnungen ansehen'}</a>
			</div>
		</div>
		<div class="warn-art"><ModuleArt name="warnung" /></div>
	</div>
</section>

{#if total > 0}
	<section class="container facts" aria-labelledby="daten-titel">
		<h2 id="daten-titel"><span class="big">{fmtN(total)}</span> Familienorte in ganz Deutschland.</h2>
		<ul>
			{#each facts as f}<li><strong>{fmtN(f.n)}</strong><span>{f.l}</span></li>{/each}
		</ul>
		<a class="btn secondary small" href="/karte">Zur Karte</a>
	</section>
{/if}

<section class="promises" aria-labelledby="ver-titel">
	<div class="container">
		<h2 id="ver-titel">Was wir nicht machen.</h2>
		<ul role="list">
			{#each promises as p}
				<li>
					<span class="x" aria-hidden="true"></span>
					<div>
						<h3>{p.title}</h3>
						<p>{p.text}</p>
					</div>
				</li>
			{/each}
		</ul>
	</div>
</section>

<section class="final" aria-labelledby="los-titel">
	<div class="container final-inner">
		<div>
			<h2 id="los-titel">{data.user ? 'Schön, dass du dabei bist.' : data.mailOpen ? 'Mach mit.' : 'Schon dabei?'}</h2>
			<p>{data.user ? 'Familien-ID teilen, Wimpel drucken, deine Region für Unwetterwarnungen abonnieren.' : data.mailOpen ? 'Konto anlegen, Familien-ID bekommen, Wimpel drucken – und los.' : 'Melde dich mit deinem Zugang an.'}</p>
		</div>
		{#if data.user}
			<a class="btn" href="/profil">Zu meinem Konto</a>
		{:else if data.mailOpen}
			<a class="btn" href="/registrieren">Konto anlegen</a>
		{:else}
			<a class="btn" href="/anmelden">Anmelden</a>
		{/if}
	</div>
</section>

<footer class="foot">
	<div class="container foot-inner">
		<span class="foot-brand">Kinder Deutschlands</span>
		<span>Das Familiennetzwerk für ganz Deutschland.</span>
	</div>
</footer>

<style>
	/* ---------- Hero ---------- */
	.facts {
		padding-block: var(--sp-7) var(--sp-8);
	}
	.facts h2 {
		margin: 0 0 var(--sp-4);
		font-size: var(--fs-2xl);
		line-height: 1.1;
	}
	.facts .big {
		color: var(--sea-ink);
	}
	.facts ul {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--sp-3);
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		gap: var(--sp-3);
	}
	.facts li {
		align-content: start;
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-3) var(--sp-4);
		display: grid;
		gap: 2px;
	}
	.facts li strong {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		line-height: 1.1;
	}
	.facts li span {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.hero {
		position: relative;
		overflow: hidden;
		padding-bottom: clamp(5rem, 9vw, 8rem);
	}
	.hero-grid {
		display: grid;
		gap: var(--sp-5);
		margin-top: calc(-1 * clamp(10px, 2vw, 40px));
	}
	.display {
		font-size: var(--fs-hero);
		font-weight: 800;
		font-stretch: 80%;
		line-height: 0.92;
		letter-spacing: -0.012em;
		margin: var(--sp-5) 0 var(--sp-5);
		max-width: 9ch;
	}
	.cta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin-top: var(--sp-5);
	}
	.visual {
		max-width: 360px;
		width: 78%;
		justify-self: end;
		margin-top: calc(-1 * var(--sp-4));
	}
	.wave {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		width: 100%;
		height: clamp(40px, 6vw, 90px);
	}
	@media (min-width: 900px) {
		.hero-grid {
			grid-template-columns: 1.2fr 0.8fr;
			align-items: center;
		}
		.visual {
			width: 100%;
			max-width: 440px;
			margin-top: var(--sp-7);
		}
	}

	/* ---------- Familien-ID ---------- */
	.band {
		background: var(--band);
		color: var(--on-band);
		padding: var(--sp-7) 0 var(--sp-9);
	}
	.band h2 {
		color: var(--white);
		max-width: 12ch;
	}
	.band-lead {
		font-size: clamp(1.125rem, 1rem + 0.5vw, 1.375rem);
		opacity: 0.9;
	}
	.id-grid {
		display: grid;
		gap: var(--sp-7);
		align-items: center;
	}
	.steps {
		list-style: none;
		counter-reset: s;
		padding: 0;
		margin: var(--sp-6) 0 0;
		display: grid;
		gap: var(--sp-4);
		max-width: 34rem;
	}
	.steps li {
		counter-increment: s;
		display: grid;
		grid-template-columns: 2.6rem 1fr;
		gap: var(--sp-3);
		align-items: start;
		line-height: 1.45;
	}
	.steps li::before {
		content: counter(s);
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 50%;
		background: var(--yellow);
		color: var(--navy);
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 1.2rem;
	}
	.steps strong {
		display: block;
		color: var(--white);
		font-size: var(--fs-l);
		font-family: var(--font-display);
		font-weight: 700;
	}
	.idcard {
		margin: 0;
		justify-self: center;
		width: min(100%, 360px);
	}
	.tagcard {
		position: relative;
		display: grid;
		gap: var(--sp-2);
		padding: var(--sp-6) var(--sp-7) var(--sp-6) var(--sp-6);
		background: var(--yellow);
		color: var(--navy);
		clip-path: polygon(0 0, 100% 0, 84% 50%, 100% 100%, 0 100%);
		transform: rotate(-4deg);
		box-shadow: var(--shadow);
	}
	.hole {
		position: absolute;
		top: 50%;
		left: 18px;
		width: 14px;
		height: 14px;
		margin-top: -7px;
		border-radius: 50%;
		background: var(--band);
	}
	.kind {
		font-weight: 700;
		font-size: var(--fs-s);
		margin-left: var(--sp-4);
	}
	.code {
		font-family: var(--font-display);
		font-weight: 800;
		font-stretch: 80%;
		font-size: clamp(2rem, 1.6rem + 1.6vw, 2.6rem);
		letter-spacing: 0.04em;
		line-height: 1;
		margin-left: var(--sp-4);
	}
	.qr {
		width: 132px;
		margin: var(--sp-3) 0 0 var(--sp-4);
		padding: 10px;
		background: var(--white);
		border-radius: var(--radius-s);
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	figcaption {
		margin-top: var(--sp-5);
		font-size: var(--fs-s);
		opacity: 0.75;
		max-width: 30rem;
	}
	@media (min-width: 900px) {
		.id-grid {
			grid-template-columns: 1.1fr 0.9fr;
		}
	}

	/* ---------- Unwetterwarnungen ---------- */
	.warnband {
		background: linear-gradient(160deg, #1b2f4f 0%, #0f2238 70%);
		color: var(--on-band);
		padding: var(--sp-7) 0;
	}
	.warnband h2 {
		color: var(--white);
		max-width: 14ch;
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.warnband .eyebrow {
		margin: 0;
		color: var(--yellow);
		font-weight: 700;
	}
	.warn-grid {
		display: grid;
		gap: var(--sp-5);
		align-items: center;
	}
	.warn-art {
		color: var(--sky);
		max-width: 380px;
		justify-self: center;
		width: 100%;
	}
	.warn-live {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin: var(--sp-2) 0 0;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-m);
		background: #d63d31;
		color: var(--white);
		font-weight: 700;
	}
	.warn-live.calm {
		background: #f08a00;
		color: var(--navy);
	}
	.pulse {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--white);
		animation: pulse 1.6s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.pulse {
			animation: none;
		}
	}
	@media (min-width: 900px) {
		.warn-grid {
			grid-template-columns: 1.2fr 0.8fr;
		}
	}

	/* ---------- Module: Postkarten ---------- */
	.modules {
		padding: var(--sp-8) 0 var(--sp-8);
	}
	.mod-head {
		display: grid;
		gap: var(--sp-2);
		margin-bottom: var(--sp-6);
	}
	.cards {
		list-style: none;
		margin: 0;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: min(82vw, 330px);
		gap: var(--sp-4);
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		padding: var(--sp-2) var(--gutter) var(--sp-5);
		scroll-padding-inline: var(--gutter);
		scrollbar-width: thin;
	}
	.postcard {
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-5);
		border-radius: var(--radius-l);
		min-height: 360px;
	}
	.postcard h3 {
		font-size: var(--fs-xl);
		font-stretch: 85%;
		font-weight: 760;
		margin: var(--sp-3) 0 0;
	}
	.postcard p {
		margin: 0;
		line-height: 1.45;
	}
	.postcard.live {
		position: relative;
	}
	.postcard.live h3 a {
		color: inherit;
		text-decoration: none;
	}
	.postcard.live h3 a::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	.postcard.live h3 a:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 4px;
	}
	.stage {
		margin-top: auto;
		padding-top: var(--sp-4);
		font-size: var(--fs-s);
		font-weight: 700;
	}
	.stage::before {
		content: '';
		display: inline-block;
		width: 12px;
		height: 10px;
		margin-right: var(--sp-2);
		background: currentColor;
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
	.sea {
		background: var(--sea);
		color: var(--white);
	}
	.yellow {
		background: var(--yellow);
		color: var(--navy);
	}
	.sky {
		background: var(--sky);
		color: var(--navy);
	}
	.red {
		background: #c8392e;
		color: var(--white);
	}
	.navy {
		background: var(--navy);
		color: var(--white);
		box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--white) 14%, transparent);
	}
	.paper {
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	@media (min-width: 900px) {
		.cards {
			grid-auto-flow: row;
			grid-template-columns: repeat(3, 1fr);
			overflow: visible;
			max-width: var(--wide);
			margin: 0 auto;
			padding: 0 var(--gutter);
		}
		.postcard:nth-child(1) {
			grid-column: span 2;
			display: grid;
			grid-template-columns: 1fr 0.9fr;
			grid-template-rows: 1fr auto auto;
			column-gap: var(--sp-6);
		}
		.postcard:nth-child(1) :global(.art) {
			grid-column: 2;
			grid-row: 1 / 4;
			align-self: center;
			max-height: 280px;
		}
		.postcard:nth-child(1) h3 {
			font-size: var(--fs-2xl);
			align-self: end;
		}
		.postcard:nth-child(1) p {
			font-size: var(--fs-l);
		}
		.postcard:last-child {
			grid-column: 1 / -1;
			min-height: 0;
			display: grid;
			grid-template-columns: 220px 1fr auto;
			grid-template-rows: auto 1fr;
			column-gap: var(--sp-6);
			align-items: center;
		}
		.postcard:last-child :global(.art) {
			grid-row: 1 / 3;
		}
		.postcard:last-child h3 {
			margin: 0;
			align-self: end;
		}
		.postcard:last-child p {
			align-self: start;
			grid-column: 2;
		}
		.postcard:last-child .stage {
			grid-column: 3;
			grid-row: 1 / 3;
			margin: 0;
			padding: 0;
		}
	}

	/* ---------- Versprechen ---------- */
	.promises {
		padding: var(--sp-7) 0 var(--sp-8);
		border-top: 1px solid var(--line);
	}
	.promises ul {
		list-style: none;
		padding: 0;
		margin: var(--sp-6) 0 0;
		display: grid;
		gap: var(--sp-5) var(--sp-7);
	}
	.promises li {
		display: grid;
		grid-template-columns: 2.4rem 1fr;
		gap: var(--sp-4);
	}
	.promises h3 {
		margin-bottom: var(--sp-2);
	}
	.promises p {
		margin: 0;
		color: var(--ink-2);
	}
	.x {
		position: relative;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 50%;
		background: var(--red);
	}
	.x::before,
	.x::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 16px;
		height: 3.5px;
		margin: -1.75px 0 0 -8px;
		background: var(--white);
		border-radius: 2px;
		transform: rotate(45deg);
	}
	.x::after {
		transform: rotate(-45deg);
	}
	@media (min-width: 900px) {
		.promises ul {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* ---------- Abschluss ---------- */
	.final {
		background: var(--yellow);
		color: var(--navy);
		padding: var(--sp-7) 0;
	}
	.final h2 {
		color: var(--navy);
	}
	.final .btn {
		background: var(--navy);
		border-color: var(--navy);
		color: var(--white);
	}
	.final-inner {
		display: grid;
		gap: var(--sp-4);
		align-items: center;
	}
	@media (min-width: 900px) {
		.final-inner {
			grid-template-columns: 1fr auto;
		}
	}
	.foot {
		padding: var(--sp-6) 0 var(--sp-7);
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.foot-inner {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-5);
		justify-content: space-between;
	}
	.foot-brand {
		font-family: var(--font-display);
		font-weight: 780;
		font-stretch: 85%;
		color: var(--ink);
	}
	.tilesec {
		margin-top: var(--sp-6);
		margin-bottom: var(--sp-6);
	}
	.tilesec .lead {
		margin-top: 0;
	}
	.grp-t {
		margin: var(--sp-5) 0 var(--sp-2);
		font-size: var(--fs-s);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
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
