<script lang="ts">
	// Eine amtliche Warnung. Stufe nie nur über Farbe: Farbe + Wort + Ziffer. Warntexte unverändert (DWD).
	import Icon from '$lib/components/Icon.svelte';
	interface W {
		id: string;
		level: number;
		levelLabel: string;
		headline: string;
		description: string | null;
		instruction: string | null;
		areaDesc: string | null;
		onset: Date | string | null;
		expires: Date | string | null;
		provider?: string;
		sourceLabel?: string;
	}
	let { w, full = false }: { w: W; full?: boolean } = $props();
	const fmt = (d: Date | string | null) =>
		d ? new Date(d).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }) : null;
	const span = $derived([fmt(w.onset) ? `ab ${fmt(w.onset)}` : null, fmt(w.expires) ? `bis ${fmt(w.expires)}` : null].filter(Boolean).join(' · '));
</script>

<article class="w lvl{w.level}" class:nina={w.provider === 'nina'}>
	<p class="badge"><Icon name="warnung" size={18} /><span>{#if w.provider === 'nina'}{w.sourceLabel} · {w.levelLabel}{:else}Stufe {w.level} · {w.levelLabel}{/if}</span></p>
	<h3>{#if full}{w.headline}{:else}<a href="/warnungen/{encodeURIComponent(w.id)}">{w.headline}</a>{/if}</h3>
	{#if span}<p class="when">{span}</p>{/if}
	{#if w.description}
		{#if full}<p class="txt">{w.description}</p>{:else}<p class="txt clamp">{w.description}</p>{/if}
	{/if}
	{#if w.instruction && full}<p class="txt instr"><strong>Was tun?</strong> {w.instruction}</p>{/if}
</article>

<style>
	.w {
		position: relative;
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4) var(--sp-4) var(--sp-4) calc(var(--sp-4) + 8px);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.w::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 8px;
		background: var(--lvl);
	}
	.lvl0,
	.lvl1 {
		--lvl: #f2c500;
		--lvl-ink: #0f2238;
	}
	.lvl2 {
		--lvl: #f08a00;
		--lvl-ink: #0f2238;
	}
	.lvl3 {
		--lvl: #d63d31;
		--lvl-ink: #ffffff;
	}
	.lvl4 {
		--lvl: #8e1f7a;
		--lvl-ink: #ffffff;
	}
	.w.nina {
		--lvl: #7b3fa0;
		--lvl-ink: #ffffff;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		margin: 0;
		padding: 2px 10px 2px 8px;
		border-radius: 999px;
		background: var(--lvl);
		color: var(--lvl-ink);
		font-size: var(--fs-s);
		font-weight: 700;
	}
	h3 {
		margin: var(--sp-2) 0 var(--sp-1);
		font-size: var(--fs-l);
		line-height: 1.2;
	}
	h3 a {
		color: inherit;
	}
	.when {
		margin: 0 0 var(--sp-2);
		color: var(--ink-2);
		font-size: var(--fs-s);
		font-weight: 650;
	}
	.txt {
		margin: 0;
		white-space: pre-line;
		line-height: 1.45;
	}
	.clamp {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.instr {
		margin-top: var(--sp-3);
	}
</style>
