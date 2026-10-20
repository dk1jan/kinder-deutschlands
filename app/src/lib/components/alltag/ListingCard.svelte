<script lang="ts">
	// Anzeige in Listen: Bild, Preis/Art, Titel, Zustand, grobe Gegend, Status.
	import Icon from '$lib/components/Icon.svelte';
	import { CONDITIONS, LISTING_STATUS, MARKET_CATEGORIES, priceLabel } from '$lib/alltag';
	interface Item {
		id: string;
		kind: string;
		category: string;
		title: string;
		priceCents: number | null;
		negotiable: boolean;
		condition: string | null;
		sizeText: string | null;
		status: string;
		regionName: string | null;
		km: number | null;
		image: string | null;
	}
	let { l }: { l: Item } = $props();
</script>

<a class="lc" href="/marktplatz/{l.id}" class:off={l.status !== 'verfuegbar'}>
	<span class="img">{#if l.image}<img src="/medien/{l.image}" alt="" loading="lazy" />{:else}<Icon name="bild" size={34} />{/if}
		{#if l.status !== 'verfuegbar'}<span class="st">{LISTING_STATUS[l.status as keyof typeof LISTING_STATUS] ?? l.status}</span>{/if}</span>
	<span class="body">
		<strong class="price" class:free={l.kind === 'verschenken'}>{priceLabel(l.kind, l.priceCents, l.negotiable)}</strong>
		<span class="title">{l.kind === 'suchen' ? 'Suche: ' : ''}{l.title}</span>
		<small>{[MARKET_CATEGORIES[l.category as keyof typeof MARKET_CATEGORIES], l.condition ? CONDITIONS[l.condition as keyof typeof CONDITIONS] : null, l.sizeText].filter(Boolean).join(' · ')}</small>
		<small class="where">{l.regionName ?? ''}{l.km !== null ? ` · ca. ${l.km} km` : ''}</small>
	</span>
</a>

<style>
	.lc {
		display: grid;
		grid-template-rows: auto 1fr;
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		overflow: hidden;
		color: var(--ink);
		text-decoration: none;
		height: 100%;
	}
	.lc.off .img :global(img) {
		opacity: 0.6;
	}
	.img {
		position: relative;
		aspect-ratio: 4 / 3;
		background: var(--line);
		display: grid;
		place-items: center;
		color: var(--ink-2);
	}
	.img img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.st {
		position: absolute;
		left: 8px;
		top: 8px;
		background: var(--navy);
		color: var(--yellow);
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.body {
		display: grid;
		gap: 2px;
		padding: var(--sp-3);
		align-content: start;
	}
	.price {
		font-size: var(--fs-m);
	}
	.price.free {
		color: #1f7468;
	}
	.title {
		font-weight: 650;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
</style>
