<script lang="ts" module>
	export type NavApp = 'google' | 'apple' | 'waze' | 'osm' | 'geo';
	export const NAV_APPS: { key: NavApp; label: string }[] = [
		{ key: 'google', label: 'Google Maps' },
		{ key: 'apple', label: 'Apple Karten' },
		{ key: 'waze', label: 'Waze' },
		{ key: 'osm', label: 'OpenStreetMap' },
		{ key: 'geo', label: 'Andere Karten-App' }
	];
	/** Ziel-Link je App. Es wird nur das Ziel übergeben – der Startpunkt ermittelt die App selbst. */
	export function navUrl(app: NavApp, lat: number, lon: number, name: string): string {
		const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`;
		const n = encodeURIComponent(name);
		switch (app) {
			case 'google':
				return `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
			case 'apple':
				return `https://maps.apple.com/?daddr=${ll}&q=${n}`;
			case 'waze':
				return `https://waze.com/ul?ll=${ll}&navigate=yes`;
			case 'osm':
				return `https://www.openstreetmap.org/directions?route=%3B${encodeURIComponent(ll)}#map=17/${ll.replace(',', '/')}`;
			case 'geo':
				return `geo:${ll}?q=${ll}(${n})`;
		}
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { lat, lon, name, variant = 'button', up = false }: { lat: number; lon: number; name: string; variant?: 'button' | 'tile'; up?: boolean } = $props();
	let open = $state(false);
	let last = $state<NavApp | null>(null);
	let box: HTMLDivElement;

	const ordered = $derived(last ? [...NAV_APPS.filter((a) => a.key === last), ...NAV_APPS.filter((a) => a.key !== last)] : NAV_APPS);

	onMount(() => {
		try {
			const v = localStorage.getItem('kd_nav');
			if (v && NAV_APPS.some((a) => a.key === v)) last = v as NavApp;
		} catch {
			/* kein Speicher – egal */
		}
		const close = (e: MouseEvent) => {
			if (open && box && !box.contains(e.target as Node)) open = false;
		};
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	function remember(app: NavApp) {
		last = app;
		open = false;
		try {
			localStorage.setItem('kd_nav', app);
		} catch {
			/* egal */
		}
	}
</script>

<div class="nav" class:tile={variant === 'tile'} bind:this={box}>
	<button type="button" class={variant === 'tile' ? 'act' : 'btn secondary'} aria-expanded={open} aria-haspopup="menu" onclick={() => (open = !open)} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
		<Icon name="route" size={variant === 'tile' ? 20 : 18} /><span>Hinweg</span>
	</button>
	{#if open}
		<div class="menu" class:up role="menu" aria-label="Navigation starten mit">
			<p class="h">Navigieren mit</p>
			{#each ordered as a (a.key)}
				<a role="menuitem" href={navUrl(a.key, lat, lon, name)} target={a.key === 'geo' ? undefined : '_blank'} rel="noopener noreferrer" onclick={() => remember(a.key)}>
					<span>{a.label}</span>{#if a.key === last}<small>zuletzt</small>{/if}
				</a>
			{/each}
			<p class="note">Öffnet die App bzw. Seite des Anbieters. Wir übergeben nur das Ziel, nicht deinen Standort.</p>
		</div>
	{/if}
</div>

<style>
	.nav {
		position: relative;
		display: inline-block;
	}
	.nav > button:not(.act) {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.act {
		display: grid;
		justify-items: center;
		gap: 4px;
		width: 100%;
		padding: var(--sp-3) var(--sp-1);
		border-radius: var(--radius-m);
		background: var(--surface);
		border: 1.5px solid var(--line);
		color: var(--ink);
		font: inherit;
		font-size: var(--fs-xs);
		font-weight: 700;
		cursor: pointer;
		min-height: 64px;
	}
	.menu {
		position: absolute;
		z-index: 30;
		top: calc(100% + 8px);
		left: 0;
		min-width: 15rem;
		padding: var(--sp-2);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		display: grid;
		gap: 2px;
	}
	.menu.up {
		top: auto;
		bottom: calc(100% + 8px);
	}
	.nav.tile {
		display: block;
	}
	.h {
		margin: var(--sp-1) var(--sp-3) var(--sp-1);
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.menu a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 48px;
		padding: 0 var(--sp-3);
		border-radius: var(--radius-s);
		color: var(--ink);
		text-decoration: none;
		font-weight: 650;
	}
	.menu a:hover,
	.menu a:focus-visible {
		background: var(--surface-2);
	}
	.menu small {
		color: var(--ink-2);
		font-weight: 500;
	}
	.note {
		margin: var(--sp-1) var(--sp-3) var(--sp-1);
		font-size: var(--fs-xs);
		color: var(--ink-2);
		max-width: 15rem;
	}
</style>
