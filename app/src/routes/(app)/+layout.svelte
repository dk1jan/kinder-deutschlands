<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import AreaLinks from '$lib/components/AreaLinks.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Pennant from '$lib/components/Pennant.svelte';
	import CallOverlay from '$lib/components/chat/CallOverlay.svelte';
	import GroupCallOverlay from '$lib/components/chat/GroupCallOverlay.svelte';
	import { onMount } from 'svelte';
	import { unreadChats } from '$lib/chat/client.svelte';
	import { GROUPS, groupOf, type GroupId } from '$lib/areas';

	let { children, data } = $props();

	// Chat (und damit eingehende Anrufe) im Hintergrund starten – nur, wenn er auf diesem Gerät schon eingerichtet ist
	onMount(() => {
		if (!data.user) return;
		const go = async () => {
			const c = await import('$lib/chat/client.svelte');
			if (c.hasStoredChat()) void c.startChat();
		};
		if ('requestIdleCallback' in window) requestIdleCallback(() => void go(), { timeout: 4000 });
		else setTimeout(() => void go(), 1500);
	});

	// Hauptmenü (D-073, ersetzt D-069): Entdecken ▾ · Karte · Community ▾ · Nachrichten · Wissen ▾.
	// Gruppen klappen am Computer auf; am Handy öffnet „Menü“ ein Blatt mit allen Bereichen. Konto oben über „Mein Konto“.
	const G = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<GroupId, (typeof GROUPS)[number]>;
	type Item = { kind: 'group'; id: GroupId } | { kind: 'link'; href: string; label: string; icon: string };
	const desk: Item[] = [
		{ kind: 'group', id: 'entdecken' },
		{ kind: 'link', href: '/karte', label: 'Karte', icon: 'karte' },
		{ kind: 'group', id: 'community' },
		{ kind: 'link', href: '/nachrichten', label: 'Nachrichten', icon: 'nachrichten' },
		{ kind: 'group', id: 'wissen' }
	];
	const tabs = [
		{ href: '/', label: 'Entdecken', icon: 'entdecken', group: 'entdecken' as GroupId },
		{ href: '/karte', label: 'Karte', icon: 'karte' },
		{ href: '/community', label: 'Community', icon: 'community', group: 'community' as GroupId },
		{ href: '/nachrichten', label: 'Nachrichten', icon: 'nachrichten' }
	];
	const member = $derived(!!data.user);
	const chats = $derived(unreadChats());
	const bellCount = $derived((data.unread ?? 0) + chats);
	const bellLabel = $derived(
		bellCount ? [data.unread ? `${data.unread} neue Mitteilungen` : '', chats ? `${chats} ungelesene Chats` : ''].filter(Boolean).join(', ') : 'Mitteilungen'
	);

	// Vollflächige Seiten (Karte, Unterhaltung) ohne Fußzeile
	const fullscreen = $derived(page.url.pathname === '/karte' || page.url.pathname.startsWith('/nachrichten/chat/'));
	const path = $derived(page.url.pathname);
	const curGroup = $derived(groupOf(path));

	function linkActive(href: string) {
		if (href === '/nachrichten' && path.startsWith('/nachrichten/treffen')) return false;
		return path === href || path.startsWith(href + '/');
	}
	function tabActive(t: (typeof tabs)[number]) {
		return t.group ? curGroup === t.group : linkActive(t.href);
	}

	// ---- Aufklapper am Computer ----
	let open = $state<GroupId | null>(null);
	let navEl = $state<HTMLElement>();
	let hoverTimer: ReturnType<typeof setTimeout> | undefined;
	const canHover = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

	let hoverAt = 0;
	function toggle(id: GroupId) {
		// Gerade erst per Maus geöffnet? Dann soll der Klick es nicht sofort wieder schließen.
		if (open === id && Date.now() - hoverAt < 600) return;
		open = open === id ? null : id;
	}
	function hoverIn(id: GroupId) {
		if (!canHover()) return;
		clearTimeout(hoverTimer);
		if (open !== id) hoverAt = Date.now();
		open = id;
	}
	function hoverOut() {
		if (!canHover()) return;
		clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => (open = null), 220);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !open) return;
		const id = open;
		open = null;
		navEl?.querySelector<HTMLElement>(`[data-toggle="${id}"]`)?.focus();
	}
	function onPointer(e: PointerEvent) {
		if (open && navEl && !navEl.contains(e.target as Node)) open = null;
	}
	function onFocusOut(e: FocusEvent, id: GroupId) {
		const wrap = e.currentTarget as HTMLElement;
		if (open === id && !wrap.contains(e.relatedTarget as Node)) open = null;
	}

	// ---- Menü-Blatt am Handy ----
	let sheet = $state<HTMLDialogElement>();
	let sheetOpen = $state(false);
	let drag = $state(0);
	let startY = 0;
	const menuTabActive = $derived(sheetOpen || path === '/mehr' || curGroup === 'wissen');
	function openSheet(e: MouseEvent) {
		if (!sheet?.showModal) return; // ohne <dialog>-Unterstützung: normale Seite /mehr
		e.preventDefault();
		drag = 0;
		sheet.showModal();
		sheet.scrollTop = 0; // oben beginnen (Griff sichtbar, Wischen nach unten schließt)
		sheet.querySelector<HTMLElement>('.x')?.focus({ preventScroll: true });
		sheetOpen = true;
	}
	function closeSheet() {
		sheet?.close();
	}
	function onSheetClick(e: MouseEvent) {
		if (e.target === sheet) closeSheet(); // Tippen daneben
	}
	function touchStart(e: TouchEvent) {
		startY = sheet && sheet.scrollTop <= 0 ? e.touches[0].clientY : -1;
	}
	function touchMove(e: TouchEvent) {
		if (startY < 0) return;
		drag = Math.max(0, e.touches[0].clientY - startY);
	}
	function touchEnd() {
		if (drag > 90) closeSheet();
		drag = 0;
		startY = -1;
	}

	// Fenster breiter gezogen: Handy-Blatt schließen (am Computer ist es ausgeblendet)
	$effect(() => {
		const mq = matchMedia('(min-width: 960px)');
		const on = () => mq.matches && closeSheet();
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});

	afterNavigate(() => {
		open = null;
		closeSheet();
	});
</script>

<a class="skip" href="#inhalt">Zum Inhalt springen</a>

<header class="top">
	<div class="bar">
		<a class="brand" href="/" aria-label="Kinder Deutschlands – Startseite">
			<Pennant size={34} />
			<span class="word">Kinder<br />Deutschlands</span>
		</a>
		<nav class="desk" aria-label="Hauptnavigation" bind:this={navEl}>
			{#each desk as item}
				{#if item.kind === 'link'}
					<a class="top-link" href={item.href} aria-current={linkActive(item.href) ? 'page' : undefined}>{item.label}</a>
				{:else}
					{@const g = G[item.id]}
					<div class="grp" class:open={open === g.id} class:cur={curGroup === g.id} role="presentation" onmouseenter={() => hoverIn(g.id)} onmouseleave={hoverOut} onfocusout={(e) => onFocusOut(e, g.id)}>
						{#if g.id === 'wissen'}
							<a class="top-link" href={g.href} data-toggle={g.id} aria-expanded={open === g.id} aria-controls="menu-{g.id}" onclick={(e) => { e.preventDefault(); toggle(g.id); }}>{g.label}<svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
						{:else}
							<a class="top-link" href={g.href} aria-current={path === g.href ? 'page' : undefined}>{g.label}</a>
							<button class="chev-btn" type="button" data-toggle={g.id} aria-expanded={open === g.id} aria-controls="menu-{g.id}" aria-label="Weitere Bereiche unter {g.label}" onclick={() => toggle(g.id)}><svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
						{/if}
						<div class="panel" id="menu-{g.id}" hidden={open !== g.id}>
							<AreaLinks group={g.id} {member} current={path} onpick={() => (open = null)} />
						</div>
					</div>
				{/if}
			{/each}
		</nav>
		<div class="actions">
			{#if data.canAdmin}
				<a class="admin" href="/admin"><Icon name="schild" size={18} /><span>Verwaltung</span></a>
			{/if}
			{#if data.user}
				<a class="bell" href="/profil/mitteilungen" aria-label={bellLabel}>
					<Icon name="hinweis" size={22} />{#if bellCount}<span class="dot">{bellCount > 9 ? '9+' : bellCount}</span>{/if}
				</a>
				<a class="btn small secondary" href="/profil">Mein Konto</a>
			{:else}
				<a class="btn small" href="/anmelden">Anmelden</a>
			{/if}
		</div>
	</div>
</header>

<main id="inhalt" tabindex="-1">
	{@render children()}
	<CallOverlay />
	<GroupCallOverlay />
	{#if !fullscreen}
		<footer class="foot">
			<nav aria-label="Rechtliches">
				<a href="/impressum">Impressum</a>
				<a href="/datenschutz">Datenschutz</a>
				<a href="/partnerlinks">Partnerlinks</a>
				<a href="/karte/quellen">Datenquellen</a>
			</nav>
		</footer>
	{/if}
</main>

<nav class="tabs" aria-label="Hauptnavigation">
	<ul>
		{#each tabs as item}
			<li>
				<a href={item.href} aria-current={tabActive(item) ? 'page' : undefined}>
					<span class="pin" aria-hidden="true"></span>
					<Icon name={item.icon} />{#if item.href === '/nachrichten' && chats}<span class="cdot">{chats > 9 ? '9+' : chats}<span class="sr"> ungelesene Chats</span></span>{/if}
					<span class="label">{item.label}</span>
				</a>
			</li>
		{/each}
		<li>
			<a href="/mehr" aria-haspopup="dialog" aria-expanded={sheetOpen} aria-current={menuTabActive ? 'page' : undefined} onclick={openSheet}>
				<span class="pin" aria-hidden="true"></span>
				<Icon name="liste" />
				<span class="label">Menü</span>
			</a>
		</li>
	</ul>
</nav>

<dialog class="sheet" bind:this={sheet} aria-labelledby="sheet-t" onclick={onSheetClick} onclose={() => (sheetOpen = false)} ontouchstart={touchStart} ontouchmove={touchMove} ontouchend={touchEnd} style:transform={drag ? `translateY(${drag}px)` : undefined}>
	<div class="sheet-in">
		<span class="grip" aria-hidden="true"></span>
		<div class="sheet-head">
			<h2 id="sheet-t">Menü</h2>
			<button class="x" type="button" onclick={closeSheet} aria-label="Menü schließen"><Icon name="schliessen" /></button>
		</div>
		{#each GROUPS as g (g.id)}
			<section aria-labelledby="sh-{g.id}">
				<h3 id="sh-{g.id}">{#if g.id === 'wissen'}{g.label}{:else}<a href={g.href}>{g.label}</a>{/if}</h3>
				<AreaLinks group={g.id} {member} current={path} onpick={closeSheet} />
			</section>
		{/each}
		<section aria-labelledby="sh-konto">
			<h3 id="sh-konto">Konto und Infos</h3>
			<ul class="plain" role="list">
				{#if data.user}<li><a href="/profil">Mein Konto</a></li><li><a href="/profil/mitteilungen">Mitteilungen</a></li>{:else}<li><a href="/anmelden">Anmelden</a></li>{/if}
				{#if data.canAdmin}<li><a href="/admin">Verwaltung</a></li>{/if}
				<li><a href="/impressum">Impressum</a></li>
				<li><a href="/datenschutz">Datenschutz</a></li>
				<li><a href="/partnerlinks">Partnerlinks</a></li>
				<li><a href="/karte/quellen">Datenquellen</a></li>
			</ul>
		</section>
	</div>
</dialog>

<svelte:window onkeydown={onKey} onpointerdown={onPointer} />

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
	.bell {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		color: var(--ink);
	}
	.bell:hover {
		background: var(--surface-2);
	}
	.bell .dot {
		position: absolute;
		top: 4px;
		right: 2px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: 999px;
		background: var(--red);
		color: #fff;
		font-size: 11px;
		font-weight: 800;
		display: grid;
		place-items: center;
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

	.foot {
		max-width: var(--wide);
		margin: var(--sp-7) auto 0;
		padding: var(--sp-4) var(--gutter) var(--sp-5);
		border-top: 1px solid var(--line);
		font-size: var(--fs-s);
	}
	.foot nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2) var(--sp-5);
	}
	.foot a {
		color: var(--ink-2);
	}

	.cdot {
		position: absolute;
		top: 6px;
		left: calc(50% + 6px);
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: #b3261e;
		color: #fff;
		font-size: 0.7rem;
		font-weight: 800;
		line-height: 18px;
		text-align: center;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
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
	.tabs ul {
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


	/* Menü-Blatt am Handy (F-016) */
	.sheet {
		margin: auto 0 0;
		width: 100%;
		max-width: 100%;
		max-height: min(86vh, 860px);
		padding: 0;
		border: 0;
		border-radius: var(--radius-l) var(--radius-l) 0 0;
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
		overflow-y: auto;
		overscroll-behavior: contain;
		transition: transform 0.18s ease;
	}
	.sheet[open] {
		animation: up 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
	}
	@keyframes up {
		from {
			transform: translateY(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet,
		.sheet[open] {
			animation: none;
			transition: none;
		}
	}
	.sheet::backdrop {
		background: rgb(8 18 32 / 0.55);
	}
	.sheet-in {
		padding: var(--sp-2) var(--gutter) calc(var(--sp-5) + env(safe-area-inset-bottom));
		display: grid;
		gap: var(--sp-4);
	}
	.grip {
		justify-self: center;
		width: 44px;
		height: 5px;
		border-radius: 99px;
		background: var(--line);
	}
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sheet h2 {
		margin: 0;
		font-size: var(--fs-l);
	}
	.sheet h3 {
		margin: 0 0 var(--sp-1);
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-2);
	}
	.sheet h3 a {
		color: inherit;
	}
	.x {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.plain a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--sp-3);
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--ink);
		text-decoration: none;
		font-size: var(--fs-s);
		font-weight: 600;
	}

	/* Aufklapper am Computer */
	.grp {
		position: relative;
		display: flex;
		align-items: center;
	}
	.chev {
		margin-left: 4px;
		transition: transform 0.15s;
	}
	.grp.open .chev {
		transform: rotate(180deg);
	}
	.chev-btn {
		display: grid;
		place-items: center;
		width: 26px;
		height: 36px;
		margin-left: -6px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: none;
		color: var(--ink-2);
		cursor: pointer;
	}
	.chev-btn .chev {
		margin: 0;
	}
	.chev-btn:hover {
		color: var(--ink);
		background: var(--surface-2);
	}
	.panel {
		position: absolute;
		top: calc(100% + 10px);
		left: -8px;
		z-index: 40;
		width: 22rem;
		padding: var(--sp-2);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
	}
	.panel::before {
		/* Brücke, damit das Menü beim Hinüberfahren mit der Maus nicht zuklappt */
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -12px;
		height: 12px;
	}
	.panel[hidden] {
		display: none;
	}

	@media (min-width: 960px) {
		.desk {
			display: flex;
			gap: var(--sp-1);
			margin-left: var(--sp-6);
		}
		.desk .top-link {
			position: relative;
			display: inline-flex;
			align-items: center;
			padding: var(--sp-2) var(--sp-3);
			color: var(--ink-2);
			text-decoration: none;
			font-weight: 600;
			border-radius: var(--radius-s);
		}
		.desk .top-link:hover {
			color: var(--ink);
			background: var(--surface-2);
		}
		.desk .top-link[aria-current='page'],
		.grp.cur > .top-link {
			color: var(--ink);
		}
		.desk > .top-link[aria-current='page']::after,
		.grp.cur > .top-link::after {
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
		.tabs,
		.sheet {
			display: none;
		}
		main {
			padding-bottom: 0;
		}
	}
</style>
