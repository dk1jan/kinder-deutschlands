<script lang="ts">
	import type { Snippet } from 'svelte';
	import { CHILD_AGES, type PublicCard } from '$lib/visibility';
	// Kontaktkarte: zeigt ausschließlich, was der Server für diese Betrachtung freigegeben hat.
	let { card, children }: { card: PublicCard & { contactIdFormatted: string }; children?: Snippet } = $props();
	const ageLabel = (k: string) => CHILD_AGES.find((a) => a.key === k)?.label ?? k;
	const nothing = $derived(!card.displayName && !card.canHelp && !card.lookingFor && !card.interests.length && !card.childAges.length && !card.regionName && !card.family?.length);
</script>

<article class="cc">
	<header>
		<span class="flag" aria-hidden="true"></span>
		<div>
			<h2>{card.displayName ?? 'Familie'}</h2>
			<p class="id">Familien-ID {card.contactIdFormatted}</p>
		</div>
	</header>
	{#if nothing}
		<p class="muted">Diese Familie zeigt hier noch keine weiteren Angaben.</p>
	{:else}
		<dl>
			{#if card.regionName}<dt>Region</dt><dd>{card.regionName}</dd>{/if}
			{#if card.childAges.length}<dt>Kinder</dt><dd>{card.childAges.map(ageLabel).join(', ')}</dd>{/if}
			{#if card.canHelp}<dt>Kann helfen</dt><dd>{card.canHelp}</dd>{/if}
			{#if card.lookingFor}<dt>Sucht</dt><dd>{card.lookingFor}</dd>{/if}
			{#if card.family?.length}
				<dt>Gehört zusammen mit</dt>
				<dd>{#each card.family as f, i}{i ? ', ' : ''}{f.name ?? `Familien-ID ${f.contactIdFormatted}`} <small class="muted">({f.kind})</small>{/each}</dd>
			{/if}
			{#if card.interests.length}
				<dt>Interessen</dt>
				<dd><ul class="tags">{#each card.interests as i}<li>{i}</li>{/each}</ul></dd>
			{/if}
		</dl>
	{/if}
	{#if children}<footer>{@render children()}</footer>{/if}
</article>

<style>
	.cc {
		background: var(--surface);
		border-radius: var(--radius-l);
		box-shadow: var(--shadow);
		padding: var(--sp-5);
		max-width: 34rem;
		border-top: 8px solid var(--yellow);
	}
	header {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-3);
		align-items: center;
		margin-bottom: var(--sp-4);
	}
	.flag {
		width: 34px;
		height: 26px;
		background: var(--yellow);
		clip-path: polygon(0 0, 100% 50%, 0 100%);
		box-shadow: inset 4px 0 0 var(--ink);
	}
	h2 {
		font-size: var(--fs-xl);
		margin: 0;
	}
	.id {
		margin: 0;
		color: var(--ink-2);
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--sp-2) var(--sp-4);
		margin: 0;
	}
	dt {
		font-weight: 700;
		color: var(--ink-2);
		font-size: var(--fs-s);
		padding-top: 2px;
	}
	dd {
		margin: 0;
		white-space: pre-line;
	}
	.tags {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.tags li {
		padding: 2px var(--sp-3);
		border-radius: 999px;
		background: var(--surface-2);
		font-size: var(--fs-s);
	}
	footer {
		margin-top: var(--sp-5);
		padding-top: var(--sp-4);
		border-top: 1px solid var(--line);
	}
	@media (max-width: 420px) {
		dl {
			grid-template-columns: 1fr;
			gap: 0;
		}
		dd {
			margin-bottom: var(--sp-3);
		}
	}
</style>
