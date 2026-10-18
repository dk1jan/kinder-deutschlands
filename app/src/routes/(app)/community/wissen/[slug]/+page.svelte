<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { renderMarkup } from '$lib/markup';
	let { data } = $props();
	const k = $derived(data.k);
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
</script>

<svelte:head><title>{k.title} – Wissen</title>{#if k.visibility !== 'oeffentlich'}<meta name="robots" content="noindex" />{/if}</svelte:head>

<article class="page">
	<a class="back" href="/community/wissen"><Icon name="zurueck" size={18} />Wissen</a>
	{#if k.status !== 'veroeffentlicht'}<Notice kind="warn" title="Entwurf">Nur für die Redaktion sichtbar.</Notice>{/if}
	<p class="meta">{k.topic_name ?? 'Wissen'} · geprüft {fmt(k.reviewed_at)} · {k.visibility === 'oeffentlich' ? 'öffentlich' : 'für Mitglieder'}</p>
	<h1>{k.title}</h1>
	<p class="summary">{k.summary}</p>
	<div class="prose body">{@html renderMarkup(k.body)}</div>
	{#if k.sources.length}
		<section class="src">
			<h2>Quellen</h2>
			<ul>{#each k.sources as s}<li><a href={s.url} rel="noopener" target="_blank">{s.title}</a></li>{/each}</ul>
		</section>
	{/if}
	<p class="muted small">Redaktionell geprüft am {fmt(k.reviewed_at)}. Ersetzt keine persönliche Beratung (z. B. ärztlich oder rechtlich).</p>
	{#if data.editor}<a class="btn small secondary" href="/admin/wissen/{k.slug}">Bearbeiten</a>{/if}
</article>

<style>
	.page {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-3);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.meta {
		margin: 0;
		color: var(--ink-2);
		font-size: var(--fs-s);
		font-weight: 650;
	}
	h1 {
		margin: 0;
	}
	.summary {
		font-size: var(--fs-l);
		color: var(--ink-2);
		margin: 0;
	}
	.src {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
	}
	.src h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-m);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
