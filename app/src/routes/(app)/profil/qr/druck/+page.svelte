<script lang="ts">
	// Wimpel zum Ausdrucken (M01): ein Wimpel je A4-Seite (18 cm breit), QR ca. 6 cm breit (gut scanbar), Familien-ID groß und lesbar.
	// Alles liegt im breiten oberen Teil des Dreiecks, damit nichts an den Schrägen anstößt.
	let { data } = $props();
</script>

<svelte:head><title>Wimpel drucken – Kinder Deutschlands</title></svelte:head>

<div class="screen-only container page">
	<p><a href="/profil/qr">Zurück zu den QR-Codes</a></p>
	<h1>Wimpel drucken</h1>
	<p class="lead">Auf A4 drucken (Skalierung 100 %), an der gestrichelten Linie ausschneiden, die beiden Punkte oben lochen und mit einer Schnur an den Kinderwagen hängen. Für draußen laminieren.</p>
	<button class="btn signal" type="button" onclick={() => window.print()}>Drucken</button>
</div>

<div class="sheet">
	<!-- Dreieck 600 × 900, Spitze unten. Halbe Breite bei Höhe y: 300 · (1 − y/900) – alles steht im breiten oberen Teil -->
	<svg class="pennant" viewBox="-12 -12 624 930" role="img" aria-label={`Wimpel mit QR-Code und Familien-ID ${data.contactId}`}>
		<defs>
			<clipPath id="wimpel"><path d="M0 0 H600 L300 900 Z" /></clipPath>
		</defs>
		<!-- Schnittlinie etwas außerhalb, damit beim Ausschneiden keine Farbe fehlt -->
		<path d="M-8 -8 H608 L300 914 Z" fill="none" stroke="#7a8796" stroke-width="1.5" stroke-dasharray="8 7" />
		<g clip-path="url(#wimpel)">
			<path d="M0 0 H600 L300 900 Z" fill="#ffc53d" />
			<rect x="0" y="0" width="600" height="64" fill="#0f2238" />
			<rect x="0" y="64" width="600" height="6" fill="#d63d31" />
		</g>
		<!-- Lochpunkte für die Schnur -->
		<circle cx="46" cy="32" r="9" fill="#ffffff" stroke="#ffc53d" stroke-width="3" />
		<circle cx="554" cy="32" r="9" fill="#ffffff" stroke="#ffc53d" stroke-width="3" />
		<!-- Kopfzeile: Wimpel-Zeichen + Name -->
		<g transform="translate(92 15)">
			<rect x="0" y="2" width="3.4" height="30" rx="1.7" fill="#ffffff" />
			<path d="M3.4 4 L27 11.5 L3.4 19 Z" fill="#ffc53d" />
		</g>
		<text x="316" y="42" text-anchor="middle" class="brand">KINDER DEUTSCHLANDS</text>

		<text x="300" y="148" text-anchor="middle" class="hello">Hallo!</text>
		<text x="300" y="190" text-anchor="middle" class="sub">Schreib uns – ganz ohne Telefonnummer.</text>

		<text x="300" y="232" text-anchor="middle" class="label">FAMILIEN-ID</text>
		<rect x="186" y="246" width="228" height="56" rx="28" fill="#0f2238" />
		<text x="300" y="284" text-anchor="middle" class="id">{data.contactId}</text>

		<!-- QR 196 breit in weißem Feld 216 (y 322–538; dort ist der Wimpel noch ≥ 241 breit) -->
		<rect x="192" y="322" width="216" height="216" rx="20" fill="#ffffff" />
		<svg x="202" y="332" width="196" height="196" viewBox={data.qr.viewBox} shape-rendering="crispEdges">{@html data.qr.body}</svg>
		<text x="300" y="574" text-anchor="middle" class="scan">Scannen</text>

		<!-- kleines Wimpel-Zeichen in der Spitze -->
		<g transform="translate(288 640)">
			<rect x="0" y="0" width="3" height="34" rx="1.5" fill="#0f2238" />
			<path d="M3 2 L26 10 L3 18 Z" fill="#d63d31" />
		</g>
	</svg>
	<p class="note">Keine Telefonnummer, keine Adresse: Wer scannt, sieht nur, was du freigibst.</p>
</div>

<style>
	.sheet {
		max-width: 620px;
		margin: 0 auto var(--sp-8);
		padding: 0 var(--gutter);
	}
	.pennant {
		width: 100%;
		height: auto;
		display: block;
	}
	text {
		font-family: var(--font-display);
	}
	.brand {
		font-weight: 800;
		font-size: 22px;
		letter-spacing: 0.18em;
		fill: #ffffff;
	}
	.hello {
		font-weight: 800;
		font-stretch: 80%;
		font-size: 76px;
		letter-spacing: -0.01em;
		fill: #0f2238;
	}
	.sub {
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 21px;
		fill: #0f2238;
	}
	.label {
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 15px;
		letter-spacing: 0.2em;
		fill: #0f2238;
	}
	.scan {
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 16px;
		letter-spacing: 0.12em;
		fill: #0f2238;
		text-transform: uppercase;
	}
	.id {
		font-family: var(--font-body);
		font-weight: 700;
		font-size: 26px;
		letter-spacing: 0.06em;
		fill: #ffffff;
		font-variant-numeric: tabular-nums;
	}
	.note {
		text-align: center;
		color: var(--ink-2);
		margin: var(--sp-3) auto 0;
	}
	@page {
		size: A4 portrait;
		margin: 10mm;
	}
	@media print {
		:global(header.top),
		:global(nav.tabs),
		:global(footer.foot),
		:global(.skip),
		.screen-only {
			display: none !important;
		}
		:global(body),
		:global(main) {
			background: #fff !important;
			padding: 0 !important;
		}
		.sheet {
			margin: 0 auto;
			padding: 0;
			max-width: 172mm;
		}
		.note {
			display: none;
		}
		.pennant {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
	}
</style>
