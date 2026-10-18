<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import LinkCard from './LinkCard.svelte';
	import type { ComponentProps } from 'svelte';
	interface Item {
		id: string;
		kind: string;
		title: string;
		excerpt: string;
		topic: { key: string; name: string } | null;
		region: { code: string; name: string } | null;
		group: { slug: string; name: string; kind: string } | null;
		author: { name: string; pseudonym: boolean };
		labels: string[];
		tags: string[];
		card: ComponentProps<typeof LinkCard>['card'] | null;
		pinned: boolean;
		closed: boolean;
		solved: boolean;
		comments: number;
		images: number;
		bookmarked: boolean;
		activityAt: Date | string;
	}
	let { item }: { item: Item } = $props();
	const KIND = { frage: 'Frage', beitrag: 'Beitrag', erfahrung: 'Erfahrung', link: 'Link-Tipp', umfrage: 'Umfrage' } as Record<string, string>;
	function ago(d: Date | string) {
		const s = (Date.now() - new Date(d).getTime()) / 1000;
		if (s < 60) return 'gerade eben';
		if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
		if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
		if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} Tag${Math.floor(s / 86400) > 1 ? 'en' : ''}`;
		return new Date(d).toLocaleDateString('de-DE');
	}
</script>

<article class="pc" class:pinned={item.pinned}>
	<p class="meta">
		<span class="kind k-{item.kind}">{KIND[item.kind] ?? item.kind}</span>
		{#if item.solved}<span class="solved">✓ gelöst</span>{/if}
		{#if item.pinned}<span class="pin">angeheftet</span>{/if}
		{#if item.closed}<span class="closed">geschlossen</span>{/if}
		{#if item.labels.includes('werbung')}<span class="ad">Eigenwerbung</span>{/if}
		{#if item.labels.includes('triggerwarnung')}<span class="tw">belastendes Thema</span>{/if}
	</p>
	<h3><a href="/community/b/{item.id}">{item.title}</a></h3>
	{#if item.excerpt && !item.labels.includes('triggerwarnung')}<p class="ex">{item.excerpt}</p>{/if}
	{#if item.card}<LinkCard card={item.card} compact />{/if}
	<p class="foot">
		<span>{item.author.name}</span>
		{#if item.group}<a href="/community/g/{item.group.slug}">{item.group.kind === 'geschuetzt' ? '🔒 ' : ''}{item.group.name}</a>{/if}
		{#if item.topic}<a href="/community?thema={item.topic.key}">{item.topic.name}</a>{/if}
		{#if item.region}<a href="/community?region={item.region.code}">{item.region.name}</a>{/if}
		<span>{ago(item.activityAt)}</span>
		<span class="stat" aria-label="{item.comments} Antworten"><Icon name="community" size={16} />{item.comments}</span>
		{#if item.images}<span class="stat">📷 {item.images}</span>{/if}
		{#if item.bookmarked}<span class="stat" aria-label="gemerkt"><Icon name="stern" size={16} /></span>{/if}
	</p>
</article>

<style>
	.pc {
		position: relative;
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-2);
	}
	.pc.pinned {
		box-shadow: inset 4px 0 0 var(--yellow);
	}
	.meta,
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: 6px var(--sp-2);
		align-items: center;
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
	.meta span {
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		font-weight: 700;
	}
	.k-frage {
		background: color-mix(in srgb, var(--sky) 55%, var(--surface)) !important;
		color: var(--navy);
	}
	.k-erfahrung {
		background: color-mix(in srgb, var(--yellow) 45%, var(--surface)) !important;
		color: var(--navy);
	}
	.solved {
		color: var(--ok);
	}
	.ad,
	.tw {
		color: var(--warn);
	}
	h3 {
		margin: 0;
		font-size: var(--fs-m);
		line-height: 1.25;
	}
	h3 a {
		color: var(--ink);
		text-decoration: none;
	}
	h3 a::after {
		content: '';
		position: absolute;
		inset: 0;
	}
	h3 a:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.ex {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.foot a {
		position: relative;
		z-index: 1;
		color: var(--ink-2);
	}
	.stat {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.pc :global(.lc) {
		position: relative;
		z-index: 1;
	}
</style>
