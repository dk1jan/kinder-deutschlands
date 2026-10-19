<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Pennant from '$lib/components/Pennant.svelte';
	let { children, data } = $props();

	const items = $derived(
		[
			{ href: '/admin', label: 'Übersicht', icon: 'system', show: true },
			{ href: '/admin/nutzer', label: 'Nutzer', icon: 'nutzer', show: data.may.users },
			{ href: '/admin/rechte', label: 'Rollen und Rechte', icon: 'schild', show: data.may.rights },
			{ href: '/admin/freigaben', label: data.openApprovals ? `Freigaben (${data.openApprovals})` : 'Freigaben', icon: 'schloss', show: data.may.approvals },
			{ href: '/admin/statistik', label: 'Statistik', icon: 'daten', show: data.may.stats },
			{ href: '/admin/moderation', label: 'Moderation', icon: 'flagge', show: data.may.moderation },
			{ href: '/admin/gruppen', label: 'Gruppen', icon: 'community', show: data.may.groups },
			{ href: '/admin/wissen', label: 'Wissen', icon: 'protokoll', show: data.may.knowledge },
			{ href: '/admin/einrichtungen', label: 'Einrichtungen', icon: 'ok', show: data.may.orgs },
			{ href: '/admin/hinweise', label: 'Hinweise', icon: 'hinweis', show: data.may.notices },
			{ href: '/admin/kompass', label: 'Lebenslagen', icon: 'entdecken', show: data.may.compass },
			{ href: '/admin/routen', label: 'Routen', icon: 'route', show: data.may.routes },
			{ href: '/admin/daten', label: 'Daten und Orte', icon: 'daten', show: data.may.data },
			{ href: '/admin/protokoll', label: 'Protokoll', icon: 'protokoll', show: data.may.audit },
			{ href: '/admin/affiliate', label: 'Affiliate', icon: 'extern', show: data.may.affiliate },
			{ href: '/admin/einstellungen', label: 'Einstellungen', icon: 'einstellungen', show: data.may.settings }
		].filter((i) => i.show)
	);
	const isActive = (href: string) => (href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href));
</script>

<div class="admin">
	<aside>
		<a class="brand" href="/"><Pennant size={26} /><span>Verwaltung</span></a>
		<nav aria-label="Verwaltung">
			{#each items as i}
				<a href={i.href} aria-current={isActive(i.href) ? 'page' : undefined}><Icon name={i.icon} size={20} /><span>{i.label}</span></a>
			{/each}
		</nav>
		<p class="who muted">{data.adminEmail}</p>
		<a class="back" href="/"><Icon name="zurueck" size={18} />Zur Plattform</a>
	</aside>
	<main id="inhalt">
		{@render children()}
	</main>
</div>

<style>
	.admin {
		min-height: 100dvh;
	}
	aside {
		background: var(--surface);
		border-bottom: 1px solid var(--line);
		padding: var(--sp-3) var(--sp-4);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-display);
		font-weight: 750;
		color: var(--ink);
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: var(--sp-1);
		overflow-x: auto;
		margin-top: var(--sp-2);
	}
	nav a {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		white-space: nowrap;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: var(--radius-s);
		color: var(--ink-2);
		text-decoration: none;
	}
	nav a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
		background: var(--surface-2);
		box-shadow: inset 0 -3px 0 var(--yellow);
	}
	.who,
	.back {
		display: none;
	}
	main {
		padding: var(--sp-5) var(--sp-4) var(--sp-7);
		max-width: 72rem;
	}
	main :global(h2) {
		font-size: var(--fs-l);
		margin-top: var(--sp-6);
	}
	@media (min-width: 900px) {
		.admin {
			display: grid;
			grid-template-columns: 250px 1fr;
		}
		aside {
			position: sticky;
			top: 0;
			height: 100dvh;
			border-bottom: 0;
			border-right: 1px solid var(--line);
			padding: var(--sp-5) var(--sp-3);
			display: flex;
			flex-direction: column;
			gap: var(--sp-3);
		}
		.brand {
			padding: 0 var(--sp-3);
			font-size: var(--fs-l);
		}
		nav {
			flex-direction: column;
			overflow: visible;
		}
		nav a[aria-current='page'] {
			box-shadow: inset 4px 0 0 var(--yellow);
		}
		.who {
			display: block;
			margin: auto 0 0;
			padding: 0 var(--sp-3);
			font-size: var(--fs-xs);
			word-break: break-all;
		}
		.back {
			display: inline-flex;
			align-items: center;
			gap: var(--sp-1);
			padding: 0 var(--sp-3);
			font-size: var(--fs-s);
		}
		main {
			padding: var(--sp-6) var(--sp-7);
		}
	}
</style>
