<script lang="ts">
	// Die Familien-ID als Wimpel-Etikett, optional mit QR-Code. Gleiche Form wie auf der Startseite.
	let { id, qr = '', name = '', tilt = true, big = false }: { id: string; qr?: string; name?: string; tilt?: boolean; big?: boolean } = $props();
	const spoken = $derived(id.replace(/-/g, ' ').split('').join(' '));
</script>

<div class="tag" class:tilt class:big>
	<span class="hole" aria-hidden="true"></span>
	<span class="kind">Familien-ID{name ? ` von ${name}` : ''}</span>
	<span class="code" aria-label={`Familien-ID ${spoken}`}>{id}</span>
	{#if qr}<div class="qr" role="img" aria-label="QR-Code zur Kontaktkarte">{@html qr}</div>{/if}
</div>

<style>
	.tag {
		position: relative;
		display: grid;
		gap: var(--sp-2);
		width: min(100%, 380px);
		padding: var(--sp-6) var(--sp-8) var(--sp-6) var(--sp-6);
		background: var(--yellow);
		color: var(--navy);
		clip-path: polygon(0 0, 100% 0, 84% 50%, 100% 100%, 0 100%);
		box-shadow: var(--shadow);
	}
	.tilt {
		transform: rotate(-2.5deg);
	}
	.big {
		width: min(100%, 460px);
	}
	.hole {
		position: absolute;
		top: 50%;
		left: 18px;
		width: 14px;
		height: 14px;
		margin-top: -7px;
		border-radius: 50%;
		background: var(--paper);
		box-shadow: inset 0 0 0 2px rgb(15 34 56 / 0.25);
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
		white-space: nowrap;
	}
	.big .code {
		font-size: clamp(2.2rem, 1.6rem + 2.4vw, 3.2rem);
	}
	.qr {
		width: 140px;
		margin: var(--sp-3) 0 0 var(--sp-4);
		padding: 10px;
		background: #fff;
		border-radius: var(--radius-s);
	}
	.big .qr {
		width: 180px;
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
