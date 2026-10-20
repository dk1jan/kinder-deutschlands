<script lang="ts">
	// Liste der Bereiche einer Gruppe im Menü (Desktop-Aufklapper und Handy-Menü, F-016).
	import Icon from '$lib/components/Icon.svelte';
	import { areaHref, areasOf, type GroupId } from '$lib/areas';
	let { group, member = false, current = '', onpick }: { group: GroupId; member?: boolean; current?: string; onpick?: () => void } = $props();
</script>

<ul class="links" role="list">
	{#each areasOf(group) as a (a.href)}
		<li>
			<a href={areaHref(a, member)} aria-current={current === a.href ? 'page' : undefined} onclick={() => onpick?.()}>
				<span class="ic" style:background={a.color} style:color={a.ink}><Icon name={a.icon} size={20} /></span>
				<span class="txt">
					<strong>{a.label}</strong>
					<small>{a.text}</small>
				</span>
				{#if a.members && !member}<span class="lock" title="mit Anmeldung"><Icon name="schloss" size={14} /><span class="sr">mit Anmeldung</span></span>{/if}
			</a>
		</li>
	{/each}
</ul>

<style>
	.links {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	a {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		min-height: 52px;
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-s);
		color: var(--ink);
		text-decoration: none;
	}
	a:hover,
	a:focus-visible {
		background: var(--surface-2);
	}
	a[aria-current='page'] {
		background: var(--surface-2);
		box-shadow: inset 3px 0 0 var(--yellow);
	}
	.ic {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 11px;
		box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.35);
	}
	.txt {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	strong {
		font-size: var(--fs-s);
		line-height: 1.2;
	}
	small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
		line-height: 1.3;
	}
	.lock {
		color: var(--ink-2);
		display: inline-flex;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
