<script lang="ts">
	// Kacheln der Bereiche einer Gruppe (F-001, F-016): Übersicht „Was es hier alles gibt“ auf der Startseite und Seite „Mehr“.
	import Icon from '$lib/components/Icon.svelte';
	import { AREAS, areaHref, type GroupId } from '$lib/areas';
	let { member = false, compact = false, group }: { member?: boolean; compact?: boolean; group?: GroupId } = $props();
	const list = $derived(group ? AREAS.filter((a) => a.group === group) : AREAS);
</script>

<ul class="tiles" class:compact role="list">
	{#each list as a (a.href)}
		<li>
			<a href={areaHref(a, member)}>
				<span class="ic" style:background={a.color} style:color={a.ink}><Icon name={a.icon} size={compact ? 22 : 26} /></span>
				<strong>{a.label}</strong>
				{#if !compact}<small>{a.text}{a.members && !member ? ' · mit Anmeldung' : ''}</small>{/if}
			</a>
		</li>
	{/each}
</ul>

<style>
	.tiles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
	}
	.tiles a {
		display: grid;
		gap: 6px;
		align-content: start;
		height: 100%;
		min-height: 7.5rem;
		padding: var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
	}
	.tiles a:hover strong {
		text-decoration: underline;
	}
	.ic {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 14px;
		box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.35);
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
	.compact a {
		min-height: 0;
		grid-template-columns: auto 1fr;
		align-items: center;
	}
	.compact .ic {
		width: 38px;
		height: 38px;
		border-radius: 12px;
	}
	@media (min-width: 720px) {
		.tiles:not(.compact) {
			grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		}
	}
</style>
