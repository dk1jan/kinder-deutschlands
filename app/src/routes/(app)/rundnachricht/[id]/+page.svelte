<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	let { data } = $props();
	const b = $derived(data.b);
	const external = $derived(!!b.link && /^https:\/\//.test(b.link));
</script>

<svelte:head><title>{b.title} – Kinder Deutschlands</title></svelte:head>

<div class="page">
	<a class="back" href="/profil/mitteilungen"><Icon name="zurueck" size={18} />Mitteilungen</a>
	<p class="eyebrow"><Icon name="megafon" size={18} /> Nachricht vom Team · {new Date(b.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
	<h1>{b.title}</h1>
	<p class="body">{b.body}</p>
	{#if b.link}
		<p><a class="btn" href={b.link} rel={external ? 'noopener' : undefined} target={external ? '_blank' : undefined}>{external ? 'Mehr dazu' : 'Ansehen'}</a></p>
	{/if}
</div>

<style>
	.page {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin: var(--sp-5) 0 0;
		color: var(--ink-2);
		font-size: var(--fs-s);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-2) 0 var(--sp-4);
	}
	.body {
		white-space: pre-line;
		font-size: var(--fs-l);
		line-height: 1.5;
	}
</style>
