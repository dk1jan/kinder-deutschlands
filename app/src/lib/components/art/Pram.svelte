<script lang="ts">
	// Kinderwagen mit Kontakt-Wimpel (QR) – Bildmarke für „Kontakt ohne Telefonnummer“.
	let { title = '' }: { title?: string } = $props();
</script>

<svg viewBox="0 0 360 300" class="pram" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
	<!-- Boden -->
	<ellipse cx="185" cy="276" rx="150" ry="10" fill="var(--ink)" opacity="0.12" />
	<!-- Wimpelstange und Wimpel mit QR-Andeutung -->
	<line x1="268" y1="128" x2="268" y2="18" stroke="var(--ink)" stroke-width="6" stroke-linecap="round" />
	<g class="flag">
		<path d="M268 20 L350 46 L268 72 Z" fill="var(--yellow)" stroke="var(--ink)" stroke-width="4" stroke-linejoin="round" />
		<g fill="var(--navy)">
			<rect x="277" y="34" width="10" height="10" rx="1.5" />
			<rect x="277" y="48" width="10" height="10" rx="1.5" />
			<rect x="291" y="41" width="10" height="10" rx="1.5" />
			<rect x="305" y="44" width="5" height="5" rx="1" />
		</g>
	</g>
	<!-- Schiebebügel -->
	<path d="M300 130 L330 70" stroke="var(--ink)" stroke-width="9" stroke-linecap="round" />
	<path d="M318 66 L344 74" stroke="var(--ink)" stroke-width="12" stroke-linecap="round" />
	<!-- Gestell -->
	<path d="M140 196 L118 236 M240 196 L262 236" stroke="var(--ink)" stroke-width="8" stroke-linecap="round" />
	<!-- Wanne -->
	<path d="M64 124 H306 Q306 200 228 204 H140 Q64 200 64 124 Z" fill="var(--sea)" stroke="var(--ink)" stroke-width="5" stroke-linejoin="round" />
	<path d="M86 150 H286" stroke="var(--white)" stroke-width="5" stroke-linecap="round" opacity="0.55" />
	<!-- Verdeck mit Leuchtturmstreifen -->
	<path d="M64 124 A92 92 0 0 1 156 32 V124 Z" fill="var(--red)" stroke="var(--ink)" stroke-width="5" stroke-linejoin="round" />
	<path d="M92 63 A92 92 0 0 1 104 52 L134 124 H112 Z" fill="var(--white)" opacity="0.9" />
	<!-- Räder -->
	<g>
		<circle cx="112" cy="240" r="30" fill="var(--surface)" stroke="var(--ink)" stroke-width="8" />
		<circle cx="112" cy="240" r="7" fill="var(--ink)" />
		<circle cx="268" cy="240" r="30" fill="var(--surface)" stroke="var(--ink)" stroke-width="8" />
		<circle cx="268" cy="240" r="7" fill="var(--ink)" />
	</g>
</svg>

<style>
	.pram {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.flag {
		transform-box: fill-box;
		transform-origin: 0 50%;
		animation: flutter 3.2s ease-in-out 1.4s 2;
	}
	@keyframes flutter {
		0%,
		100% {
			transform: none;
		}
		30% {
			transform: skewY(-5deg) scaleX(0.94);
		}
		60% {
			transform: skewY(3deg) scaleX(1.02);
		}
	}
</style>
