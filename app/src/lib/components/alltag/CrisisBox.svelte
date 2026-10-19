<script lang="ts">
	// Offizielle Notruf- und Krisennummern. Unser Chat ist kein Notfalldienst (M16).
	import { CRISIS_LINES, CRISIS_SOURCE } from '$lib/alltag';
	let { open = false, compact = false }: { open?: boolean; compact?: boolean } = $props();
</script>

<details class="crisis" {open}>
	<summary><strong>Akute Not?</strong> Hier sofort Hilfe holen – nicht im Chat warten.</summary>
	<ul>
		{#each compact ? CRISIS_LINES.slice(0, 4) : CRISIS_LINES as c}
			<li><a href="tel:{c.tel}">{c.number}</a> <span>{c.name}</span> <small>{c.hours}</small></li>
		{/each}
	</ul>
	<p class="src">Nummern laut <a href={CRISIS_SOURCE} rel="noopener" target="_blank">Familienportal des Bundesfamilienministeriums</a>. Bei Gefahr für Leib und Leben: 112 bzw. 110.</p>
</details>

<style>
	.crisis {
		background: var(--surface);
		border-left: 6px solid #d63d31;
		border-radius: var(--radius-m);
		padding: var(--sp-3) var(--sp-4);
		margin: var(--sp-3) 0;
		max-width: 52rem;
	}
	summary {
		cursor: pointer;
		min-height: 36px;
	}
	ul {
		list-style: none;
		margin: var(--sp-3) 0 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	li {
		display: grid;
		grid-template-columns: minmax(9rem, auto) 1fr;
		gap: 0 var(--sp-3);
	}
	li a {
		font-weight: 800;
		white-space: nowrap;
	}
	li small {
		grid-column: 2;
		color: var(--ink-2);
	}
	.src {
		font-size: var(--fs-xs);
		color: var(--ink-2);
		margin: var(--sp-3) 0 0;
	}
	@media (max-width: 480px) {
		li {
			grid-template-columns: 1fr;
		}
		li small {
			grid-column: 1;
		}
	}
</style>
