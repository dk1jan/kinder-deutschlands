<script lang="ts">
	import type { Snippet } from 'svelte';
	import Pram from './art/Pram.svelte';
	// Rahmen für Anmelden, Registrieren und Passwort: links (Desktop) die Bildwelt, rechts das Formular.
	let { title, lead, children }: { title: string; lead?: string; children: Snippet } = $props();
</script>

<div class="auth">
	<aside class="side" aria-hidden="true">
		<div class="side-inner">
			<Pram />
			<p>Kontakt über die Familien-ID. Telefonnummer und Adresse bleiben bei dir.</p>
		</div>
	</aside>
	<section class="main">
		<h1>{title}</h1>
		{#if lead}<p class="lead">{lead}</p>{/if}
		{@render children()}
	</section>
</div>

<style>
	.auth {
		display: grid;
		max-width: var(--wide);
		margin: 0 auto;
		padding: var(--sp-6) var(--gutter) var(--sp-8);
		gap: var(--sp-7);
	}
	.side {
		display: none;
	}
	.main {
		max-width: 30rem;
		width: 100%;
	}
	.main h1 {
		font-size: clamp(2.4rem, 1.7rem + 3vw, 3.6rem);
		font-stretch: 78%;
		font-weight: 800;
	}
	@media (min-width: 960px) {
		.auth {
			grid-template-columns: 1fr 1fr;
			align-items: start;
			padding-top: var(--sp-7);
		}
		.side {
			display: block;
			position: sticky;
			top: calc(var(--header-h) + var(--sp-6));
		}
		.side-inner {
			background: var(--band);
			color: var(--on-band);
			border-radius: var(--radius-l);
			padding: var(--sp-7) var(--sp-7) var(--sp-6);
			--ink: var(--on-band);
			--surface: var(--band);
		}
		.side-inner :global(svg) {
			max-width: 340px;
			margin: 0 auto var(--sp-5);
		}
		.side-inner p {
			font-family: var(--font-display);
			font-size: var(--fs-xl);
			font-weight: 700;
			font-stretch: 85%;
			line-height: 1.15;
			margin: 0;
		}
	}
</style>
