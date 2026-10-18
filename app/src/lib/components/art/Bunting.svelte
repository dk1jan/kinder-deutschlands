<script lang="ts">
	// Wimpelkette – das eine inszenierte Bewegungsmoment der Seite: die Wimpel fallen einmal beim Laden ein.
	let { count = 15, animate = true }: { count?: number; animate?: boolean } = $props();
	const colors = ['var(--yellow)', 'var(--red)', 'var(--sky)', 'var(--sea)'];
	const P0 = { x: -20, y: 6 };
	const P1 = { x: 720, y: 118 };
	const P2 = { x: 1460, y: 6 };
	const flags = $derived(
		Array.from({ length: count }, (_, i) => {
			const t = (i + 0.5) / count;
			const x = (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x;
			const y = (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y;
			const dx = 2 * (1 - t) * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
			const dy = 2 * (1 - t) * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
			return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI, color: colors[i % colors.length], delay: i * 55 };
		})
	);
</script>

<svg class="bunting" class:animate viewBox="0 0 1440 200" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
	<path d="M{P0.x},{P0.y} Q{P1.x},{P1.y} {P2.x},{P2.y}" fill="none" stroke="var(--ink)" stroke-width="2.5" opacity="0.55" />
	{#each flags as f}
		<g transform="translate({f.x.toFixed(1)} {f.y.toFixed(1)}) rotate({f.angle.toFixed(2)})">
			<g class="swing" style="animation-delay: {f.delay}ms">
				<path d="M-27 0 H27 L0 62 Z" fill={f.color} />
				<path d="M-27 0 H27" stroke="var(--ink)" stroke-width="3" opacity="0.55" />
			</g>
		</g>
	{/each}
</svg>

<style>
	.bunting {
		display: block;
		width: 100%;
		height: clamp(88px, 12vw, 170px);
		pointer-events: none;
	}
	.swing {
		transform-box: fill-box;
		transform-origin: 50% 0;
	}
	.animate .swing {
		animation: drop 0.9s cubic-bezier(0.2, 1.5, 0.4, 1) both;
	}
	@keyframes drop {
		0% {
			transform: translateY(-90px) rotate(-18deg);
			opacity: 0;
		}
		60% {
			opacity: 1;
		}
		100% {
			transform: none;
			opacity: 1;
		}
	}
</style>
