<script lang="ts">
	import type { Snippet } from 'svelte';
	// Ehrlicher Zustand für Bereiche im Bau: was kommt, wann, welches Modul. Keine Attrappen, keine erfundenen Inhalte.
	let {
		title,
		module,
		stage,
		text,
		points = [],
		theme = 'sea',
		art
	}: { title: string; module: string; stage: string; text: string; points?: string[]; theme?: 'sea' | 'sky' | 'yellow' | 'red'; art?: Snippet } =
		$props();
</script>

<section class="planned" aria-labelledby="planned-title">
	<div class="stage-art {theme}">
		{@render art?.()}
	</div>
	<div class="container narrow body">
		<span class="tag">In Arbeit, {stage}</span>
		<h1 id="planned-title">{title}</h1>
		<p class="lead">{text}</p>
		{#if points.length}
			<h2 class="sub">Was hier kommt</h2>
			<ul class="points">
				{#each points as p}<li>{p}</li>{/each}
			</ul>
		{/if}
		<p class="module muted">Modul {module}. Den aktuellen Stand gibt es auf der <a href="/">Startseite</a>.</p>
	</div>
</section>

<style>
	.stage-art {
		display: grid;
		place-items: center;
		padding: var(--sp-6) var(--gutter) var(--sp-5);
		min-height: 220px;
		border-radius: 0 0 var(--radius-l) var(--radius-l);
	}
	.stage-art :global(svg) {
		width: min(100%, 440px);
	}
	.sea {
		background: var(--sea);
		color: var(--white);
	}
	.sky {
		background: var(--sky);
		color: var(--navy);
	}
	.yellow {
		background: var(--yellow);
		color: var(--navy);
	}
	.red {
		background: #c8392e;
		color: var(--white);
	}
	.body {
		padding-top: var(--sp-6);
		padding-bottom: var(--sp-8);
	}
	h1 {
		font-size: clamp(2.4rem, 1.6rem + 3.6vw, 4rem);
		font-stretch: 78%;
		font-weight: 800;
		margin-top: var(--sp-4);
	}
	.sub {
		font-size: var(--fs-l);
		font-stretch: 100%;
		margin-top: var(--sp-6);
	}
	.points {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.points li {
		position: relative;
		padding-left: var(--sp-6);
		line-height: 1.45;
	}
	.points li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.3em;
		width: 18px;
		height: 14px;
		background: var(--yellow);
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
	.module {
		margin-top: var(--sp-6);
		font-size: var(--fs-s);
	}
	@media (min-width: 900px) {
		.stage-art {
			max-width: var(--wide);
			margin: var(--sp-5) auto 0;
			border-radius: var(--radius-l);
			min-height: 300px;
		}
	}
</style>
