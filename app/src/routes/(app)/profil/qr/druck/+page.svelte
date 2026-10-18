<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Wimpel drucken – Kinder Deutschlands</title></svelte:head>

<div class="screen-only container page">
	<p><a href="/profil/qr">Zurück zu den QR-Codes</a></p>
	<h1>Wimpel drucken</h1>
	<p class="lead">Drucke die Seite aus, schneide den Wimpel an der Linie aus und laminiere ihn, wenn er draußen hängen soll.</p>
	<button class="btn signal" type="button" onclick={() => window.print()}>Drucken</button>
</div>

<div class="sheet">
	<svg class="pennant" viewBox="0 0 600 420" aria-label={`Wimpel mit Familien-ID ${data.contactId}`} role="img">
		<path d="M10 10 H590 L300 410 Z" fill="#ffc53d" stroke="#0f2238" stroke-width="3" stroke-dasharray="10 8" />
		<text x="300" y="70" text-anchor="middle" class="t1">Hallo! Schreib uns über</text>
		<text x="300" y="104" text-anchor="middle" class="t1">Kinder Deutschlands</text>
		<foreignObject x="215" y="122" width="170" height="170">
			<div class="qrbox">{@html data.svg}</div>
		</foreignObject>
		<text x="300" y="330" text-anchor="middle" class="id">{data.contactId}</text>
	</svg>
	<p class="note">Keine Telefonnummer, keine Adresse: Kontakt nur über die Plattform.</p>
</div>

<style>
	.sheet {
		max-width: 640px;
		margin: 0 auto var(--sp-8);
		padding: 0 var(--gutter);
	}
	.pennant {
		width: 100%;
		height: auto;
		display: block;
	}
	.t1 {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 30px;
		fill: #0f2238;
	}
	.id {
		font-family: var(--font-display);
		font-weight: 800;
		font-stretch: 80%;
		font-size: 44px;
		letter-spacing: 2px;
		fill: #0f2238;
	}
	.qrbox {
		background: #fff;
		padding: 10px;
		border-radius: 10px;
		width: 170px;
		height: 170px;
		box-sizing: border-box;
	}
	.qrbox :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.note {
		text-align: center;
		color: var(--ink-2);
		margin: var(--sp-3) auto 0;
	}
	@media print {
		:global(header.top),
		:global(nav.tabs),
		.screen-only {
			display: none !important;
		}
		.sheet {
			margin: 0;
		}
	}
</style>
