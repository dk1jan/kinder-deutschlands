<script lang="ts">
	import Bunting from '$lib/components/art/Bunting.svelte';
	import Pram from '$lib/components/art/Pram.svelte';
	import RegionMap from '$lib/components/art/RegionMap.svelte';
	import ModuleArt from '$lib/components/art/ModuleArt.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data } = $props();

	type Theme = 'sea' | 'yellow' | 'sky' | 'red' | 'navy' | 'paper';
	const modules: { art: 'karte' | 'treffen' | 'community' | 'radar' | 'markt' | 'nachrichten'; title: string; text: string; stage: string; theme: Theme }[] = [
		{
			art: 'karte',
			title: 'Die Familienkarte',
			text: 'Spielplätze, Wickelräume, Familiencafés und Ausflugsziele. Jeder Ort mit Quelle und Stand, Erfahrungen nur von echten Eltern.',
			stage: 'Bauabschnitt 2',
			theme: 'sea'
		},
		{
			art: 'treffen',
			title: 'Treffen',
			text: 'Kinderwagenrunde am Werdersee? Treffpunkt teilen und den Standort nur für 15, 30 oder 60 Minuten freigeben.',
			stage: 'Bauabschnitt 4',
			theme: 'yellow'
		},
		{
			art: 'community',
			title: 'Fragen und Gruppen',
			text: 'Austausch nach Region und Thema. Geschützte Gruppen, zum Beispiel für Alleinerziehende, sind für Fremde unsichtbar.',
			stage: 'Bauabschnitt 3',
			theme: 'sky'
		},
		{
			art: 'radar',
			title: 'Familienradar',
			text: 'Flohmärkte, Ferienprogramme, Kurse und neue Leistungen aus deiner Region, einmal pro Woche gesammelt.',
			stage: 'Bauabschnitt 5',
			theme: 'red'
		},
		{
			art: 'markt',
			title: 'Marktplatz',
			text: 'Kinderwagen, Kleidung und Spielzeug weitergeben. Kontakt über die Familien-ID, die Übergabe vereinbart ihr selbst.',
			stage: 'Bauabschnitt 6',
			theme: 'navy'
		},
		{
			art: 'nachrichten',
			title: 'Schreiben und anrufen',
			text: 'Kontaktanfragen über die Familien-ID gehen schon. Nachrichten, Gruppen-Chats und Anrufe folgen, Ende-zu-Ende-verschlüsselt.',
			stage: 'Bauabschnitte 4 und 7',
			theme: 'paper'
		}
	];

	const promises = [
		{ title: 'Keine Telefonnummern, keine Adressen', text: 'Kontakt läuft über die Familien-ID. Was andere sehen, entscheidest du.' },
		{ title: 'Keine Kinderprofile', text: 'Konten gehören Erwachsenen. Namen und Geburtstage von Kindern musst du nirgends angeben.' },
		{ title: 'Nichts Erfundenes', text: 'Keine gekauften Bewertungen, keine geschönten Mitgliederzahlen, keine Platzhalter-Familien.' },
		{ title: 'Kein Handel mit Familiendaten', text: 'Die Finanzierung wird offen gelegt. Private Chats und geschützte Gruppen bleiben werbefrei.' }
	];
</script>

<svelte:head>
	<title>Kinder Deutschlands – Eltern finden Eltern</title>
	<meta name="description" content="Geschütztes Familiennetzwerk für Eltern in Bremen und Niedersachsen: Kontakt über eine Familien-ID statt Telefonnummer, Familienkarte, Treffen und Gruppen." />
</svelte:head>

<section class="hero">
	<Bunting />
	<div class="container hero-grid">
		<div class="copy">
			<span class="tag">Im Aufbau. Start in Bremen und Niedersachsen.</span>
			<h1 class="display">Eltern finden Eltern.</h1>
			<p class="lead">
				Kinder Deutschlands verbindet Familien in deiner Gegend. Mit einer eigenen Familien-ID statt Telefonnummer, einer
				Karte voller Spielplätze und Familienorte und Gruppen, die geschützt bleiben.
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

<section class="modules" aria-labelledby="mod-titel">
	<div class="container">
		<div class="mod-head">
			<h2 id="mod-titel">Was hier entsteht.</h2>
			<p class="lead">Kein Forum mit tausend leeren Ecken, sondern Werkzeuge für den Familienalltag. Schritt für Schritt, jedes Teil erst, wenn es wirklich funktioniert.</p>
		</div>
	</div>
	<ul class="cards" role="list">
		{#each modules as m}
			<li class="postcard {m.theme}">
				<ModuleArt name={m.art} />
				<h3>{m.title}</h3>
				<p>{m.text}</p>
				<span class="stage">In Arbeit, {m.stage}</span>
			</li>
		{/each}
	</ul>
</section>

<section class="region" aria-labelledby="reg-titel">
	<div class="container reg-grid">
		<div class="atlas">
			<RegionMap />
			<p class="atlas-note">Schematische Darstellung</p>
		</div>
		<div>
			<h2 id="reg-titel">Zuerst der Norden.</h2>
			<p class="lead">
				Bremen, Bremerhaven und Niedersachsen machen den Anfang. Lieber wenige lebendige Gruppen als hunderte leere Foren. Gebaut
				ist alles trotzdem für ganz Deutschland.
			</p>
			<p>
				Land Bremen, Stadt Bremen und Bremerhaven sind von Anfang an sauber getrennt, damit Nachrichten und Angebote dort
				ankommen, wo sie gelten. Orte sollen aus offenen Daten wie OpenStreetMap kommen, immer mit Quelle und Stand.
			</p>
		</div>
	</div>
</section>

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
			<h2 id="los-titel">{data.mailOpen ? 'Mach mit.' : 'Mitmachen, sobald es losgeht.'}</h2>
			<p>{data.mailOpen ? 'Konto anlegen, Familien-ID bekommen, Wimpel drucken. Karte und Gruppen folgen Schritt für Schritt.' : 'Die Registrierung öffnet, sobald der E-Mail-Versand eingerichtet ist. Wer schon einen Zugang hat, meldet sich hier an.'}</p>
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
		<span>Ein Familiennetzwerk aus Bremen. Testbetrieb, noch nicht öffentlich.</span>
	</div>
</footer>

<style>
	/* ---------- Hero ---------- */
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

	/* ---------- Region ---------- */
	.region {
		padding: var(--sp-7) 0 var(--sp-8);
	}
	.reg-grid {
		display: grid;
		gap: var(--sp-6);
		align-items: center;
	}
	.atlas {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4);
		box-shadow: var(--shadow);
		background-image:
			linear-gradient(var(--line) 1px, transparent 1px),
			linear-gradient(90deg, var(--line) 1px, transparent 1px);
		background-size: 46px 46px;
		background-position: -1px -1px;
	}
	.atlas-note {
		margin: var(--sp-2) 0 0;
		text-align: right;
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
	@media (min-width: 900px) {
		.reg-grid {
			grid-template-columns: 1fr 1fr;
			gap: var(--sp-8);
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
</style>
