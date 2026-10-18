<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Pennant from '$lib/components/Pennant.svelte';

	let { children, data } = $props();

	// Fünf Hauptziele (DECISIONS D-007). Veranstaltungen, Marktplatz und Hilfe laufen über „Entdecken“.
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

<header class="top">
	<div class="bar">
		<a class="brand" href="/" aria-label="Kinder Deutschlands – Startseite">
			<Pennant size={34} />
			<span class="word">Kinder<br />Deutschlands</span>
		</a>
		<nav class="desk" aria-label="Hauptnavigation">
			{#each nav as item}
				<a href={item.href} aria-current={active(item.href) ? 'page' : undefined}>{item.label}</a>
			{/each}
		</nav>
		<div class="actions">
			{#if data.canAdmin}
				<a class="admin" href="/admin"><Icon name="schild" size={18} /><span>Verwaltung</span></a>
			{/if}
			{#if data.user}
				<a class="btn small secondary" href="/profil">Mein Konto</a>
			{:else}
				<a class="btn small" href="/anmelden">Anmelden</a>
			{/if}
		</div>
	</div>
</header>

<main id="inhalt" tabindex="-1">
	{@render children()}
</main>

<nav class="tabs" aria-label="Hauptnavigation">
	<ul>
		{#each nav as item}
			<li>
				<a href={item.href} aria-current={active(item.href) ? 'page' : undefined}>
					<span class="pin" aria-hidden="true"></span>
					<Icon name={item.icon} />
					<span class="label">{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.skip {
		position: absolute;
		left: var(--sp-3);
		top: -100px;
		z-index: 50;
		background: var(--ink);
		color: var(--paper);
		padding: var(--sp-2) var(--sp-4);
		border-radius: var(--radius-s);
	}
	.skip:focus {
		top: var(--sp-3);
	}

	.top {
		position: sticky;
		top: 0;
		z-index: 30;
		background: color-mix(in srgb, var(--paper) 86%, transparent);
		backdrop-filter: saturate(1.4) blur(14px);
		-webkit-backdrop-filter: saturate(1.4) blur(14px);
		border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		height: var(--header-h);
		max-width: var(--wide);
		margin: 0 auto;
		padding: 0 var(--gutter);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--ink);
		text-decoration: none;
	}
	.word {
		font-family: var(--font-display);
		font-weight: 780;
		font-stretch: 82%;
		font-size: 1.05rem;
		line-height: 0.95;
		letter-spacing: -0.01em;
	}
	.desk {
		display: none;
	}
	.actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}
	.admin {
		display: none;
		align-items: center;
		gap: var(--sp-1);
		color: var(--ink-2);
		font-size: var(--fs-s);
		text-decoration: none;
	}
	.admin:hover {
		color: var(--ink);
	}

	main {
		outline: none;
		padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom));
	}

	/* Mobil: Leiste unten, einhändig */
	.tabs {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 30;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-top: 1px solid var(--line);
		padding-bottom: env(safe-area-inset-bottom);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		height: var(--nav-h);
	}
	.tabs a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		height: 100%;
		color: var(--ink-2);
		text-decoration: none;
		font-size: 0.75rem;
	}
	.tabs a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
	}
	/* Aktiver Bereich: Wimpel über dem Symbol (Form + Fettung, nicht nur Farbe) */
	.pin {
		position: absolute;
		top: 0;
		left: 50%;
		width: 26px;
		height: 14px;
		margin-left: -13px;
		background: var(--yellow);
		clip-path: polygon(0 0, 100% 0, 50% 100%);
		opacity: 0;
		transform: translateY(-8px);
		transition:
			transform 0.25s cubic-bezier(0.2, 1.4, 0.4, 1),
			opacity 0.15s ease;
	}
	.tabs a[aria-current='page'] .pin {
		opacity: 1;
		transform: none;
	}

	@media (min-width: 960px) {
		.desk {
			display: flex;
			gap: var(--sp-1);
			margin-left: var(--sp-6);
		}
		.desk a {
			position: relative;
			padding: var(--sp-2) var(--sp-3);
			color: var(--ink-2);
			text-decoration: none;
			font-weight: 600;
			border-radius: var(--radius-s);
		}
		.desk a:hover {
			color: var(--ink);
			background: var(--surface-2);
		}
		.desk a[aria-current='page'] {
			color: var(--ink);
		}
		.desk a[aria-current='page']::after {
			content: '';
			position: absolute;
			left: 50%;
			bottom: -11px;
			width: 22px;
			height: 12px;
			margin-left: -11px;
			background: var(--yellow);
			clip-path: polygon(0 0, 100% 0, 50% 100%);
		}
		.admin {
			display: inline-flex;
		}
		.tabs {
			display: none;
		}
		main {
			padding-bottom: 0;
		}
	}
</style>
