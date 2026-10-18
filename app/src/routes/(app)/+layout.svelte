<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Pennant from '$lib/components/Pennant.svelte';

	let { children, data } = $props();

	// Fünf Hauptziele. Marktplatz, Veranstaltungen und Hilfe werden über „Entdecken“ erreicht (siehe DECISIONS.md).
	const nav = [
		{ href: '/', label: 'Entdecken', icon: 'entdecken' },
		{ href: '/karte', label: 'Karte', icon: 'karte' },
		{ href: '/community', label: 'Community', icon: 'community' },
		{ href: '/nachrichten', label: 'Nachrichten', icon: 'nachrichten' },
		{ href: '/profil', label: 'Profil', icon: 'profil' }
	];

	function active(href: string) {
		const p = page.url.pathname;
		return href === '/' ? p === '/' : p === href || p.startsWith(href + '/');
	}
</script>

<a class="skip" href="#inhalt">Zum Inhalt springen</a>

<div class="shell">
	<nav class="nav" aria-label="Hauptnavigation">
		<a class="brand" href="/">
			<Pennant size={30} />
			<span>Kinder Deutschlands</span>
		</a>
		<ul>
			{#each nav as item}
				<li>
					<a href={item.href} aria-current={active(item.href) ? 'page' : undefined}>
						<span class="flag" aria-hidden="true"></span>
						<Icon name={item.icon} />
						<span class="label">{item.label}</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if data.canAdmin}
			<a class="admin-link" href="/admin">
				<Icon name="schild" size={20} />
				<span>Verwaltung</span>
			</a>
		{/if}
	</nav>

	<main id="inhalt" tabindex="-1">
		{@render children()}
	</main>
</div>

<style>
	.skip {
		position: absolute;
		left: var(--sp-3);
		top: -100px;
		z-index: 20;
		background: var(--ink);
		color: var(--bg);
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-s);
	}
	.skip:focus {
		top: var(--sp-3);
	}

	main {
		padding: var(--sp-5) var(--sp-4) calc(var(--nav-h) + var(--sp-6) + env(safe-area-inset-bottom));
		max-width: 52rem;
		outline: none;
	}

	/* Mobil: Leiste unten, einhändig erreichbar */
	.nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 10;
		background: var(--surface);
		border-top: 1px solid var(--line);
		padding-bottom: env(safe-area-inset-bottom);
	}
	.brand,
	.admin-link {
		display: none;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		height: var(--nav-h);
	}
	ul a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: 100%;
		color: var(--ink-2);
		text-decoration: none;
		font-size: var(--fs-xs);
	}
	ul a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
	}
	/* Aktiver Bereich: kleiner Wimpel über dem Symbol (Form + Fettung, nicht nur Farbe) */
	.flag {
		position: absolute;
		top: 6px;
		left: calc(50% + 9px);
		width: 0;
		height: 0;
		border-top: 5px solid transparent;
		border-bottom: 5px solid transparent;
		border-left: 11px solid var(--signal);
		opacity: 0;
		transform: translateX(-4px);
		transition:
			opacity 0.18s ease,
			transform 0.18s ease;
	}
	ul a[aria-current='page'] .flag {
		opacity: 1;
		transform: none;
	}

	/* Desktop: linke Leiste */
	@media (min-width: 900px) {
		.shell {
			display: grid;
			grid-template-columns: 240px 1fr;
			min-height: 100dvh;
		}
		.nav {
			position: sticky;
			top: 0;
			height: 100dvh;
			border-top: 0;
			border-right: 1px solid var(--line);
			padding: var(--sp-5) var(--sp-3);
			display: flex;
			flex-direction: column;
			gap: var(--sp-5);
		}
		.brand {
			display: flex;
			align-items: center;
			gap: var(--sp-2);
			padding: 0 var(--sp-3);
			color: var(--ink);
			text-decoration: none;
			font-family: var(--font-display);
			font-weight: 750;
			font-size: var(--fs-l);
			line-height: 1.1;
		}
		ul {
			display: flex;
			flex-direction: column;
			height: auto;
			gap: var(--sp-1);
		}
		ul a {
			flex-direction: row;
			justify-content: flex-start;
			gap: var(--sp-3);
			height: var(--touch);
			padding: 0 var(--sp-3);
			border-radius: var(--radius-s);
			font-size: var(--fs-m);
		}
		ul a:hover {
			background: var(--surface-2);
		}
		.flag {
			top: 50%;
			left: auto;
			right: var(--sp-3);
			margin-top: -5px;
		}
		.admin-link {
			display: flex;
			align-items: center;
			gap: var(--sp-2);
			margin-top: auto;
			padding: var(--sp-2) var(--sp-3);
			color: var(--ink-2);
			font-size: var(--fs-s);
		}
		main {
			padding: var(--sp-7) var(--sp-7) var(--sp-7);
		}
	}
</style>
