<script lang="ts">
	// Datenschutzfreundliche Linkkarte: nichts lädt von Dritten. Videos (YouTube/Vimeo) erst nach Klick, mit Hinweis.
	import Icon from '$lib/components/Icon.svelte';
	interface Card {
		url: string;
		host: string;
		title: string | null;
		description: string | null;
		site: string | null;
		provider: string;
		embed: { type: 'youtube' | 'vimeo'; id: string } | null;
		ok: boolean;
		imageId: string | null;
	}
	let { card, compact = false }: { card: Card; compact?: boolean } = $props();
	let play = $state(false);
	const PROVIDER: Record<string, string> = { youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', web: '' };
	const src = $derived(
		card.embed?.type === 'youtube'
			? `https://www.youtube-nocookie.com/embed/${card.embed.id}?autoplay=1&rel=0`
			: card.embed?.type === 'vimeo'
				? `https://player.vimeo.com/video/${card.embed.id}?autoplay=1&dnt=1`
				: ''
	);
</script>

<div class="lc" class:compact>
	{#if play && src}
		<div class="frame"><iframe {src} title={card.title ?? 'Video'} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
	{:else if card.imageId && !compact}
		<div class="img">
			<img src="/medien/{card.imageId}" alt="" loading="lazy" />
			{#if card.embed}
				<button type="button" class="playbtn" onclick={() => (play = true)} aria-label="Video laden und abspielen">▶</button>
			{/if}
		</div>
	{/if}
	<div class="txt">
		<p class="src">{PROVIDER[card.provider] || card.site || card.host} · {card.host}</p>
		<a href={card.url} rel="nofollow ugc noopener noreferrer" target="_blank" class="t">{card.title ?? card.url}<Icon name="extern" size={14} /></a>
		{#if card.description && !compact}<p class="d">{card.description}</p>{/if}
		{#if !card.ok}<p class="d muted">Vorschau nicht verfügbar – der Inhalt ist evtl. privat, gelöscht oder lässt keine Vorschau zu.</p>{/if}
		{#if card.embed && !play && !compact}
			<p class="note">
				<button type="button" class="linkbtn" onclick={() => (play = true)}>Video hier abspielen</button> – lädt den Player von {PROVIDER[card.provider]}; dabei gelten deren Datenschutzregeln.
			</p>
		{:else if (card.provider === 'instagram' || card.provider === 'tiktok' || card.provider === 'facebook') && !compact}
			<p class="note">Wird bei {PROVIDER[card.provider]} geöffnet. Wir laden keine Inhalte von dort in die Seite.</p>
		{/if}
	</div>
</div>

<style>
	.lc {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-m);
		overflow: hidden;
		background: var(--surface);
	}
	.img {
		position: relative;
		aspect-ratio: 1.91;
		background: var(--surface-2);
	}
	.img img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.playbtn {
		position: absolute;
		inset: 50% auto auto 50%;
		transform: translate(-50%, -50%);
		width: 64px;
		height: 64px;
		border-radius: 50%;
		border: 0;
		background: rgb(15 34 56 / 0.85);
		color: #fff;
		font-size: 24px;
		cursor: pointer;
	}
	.frame {
		aspect-ratio: 16 / 9;
	}
	.frame iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.txt {
		padding: var(--sp-3) var(--sp-4);
		display: grid;
		gap: 4px;
	}
	.src {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.t {
		font-weight: 700;
		display: inline-flex;
		gap: 6px;
		align-items: center;
		word-break: break-word;
	}
	.d {
		margin: 0;
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.note {
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
	.linkbtn {
		border: 0;
		background: none;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		font-weight: 650;
		cursor: pointer;
	}
	.compact .txt {
		padding: var(--sp-2) var(--sp-3);
	}
</style>
