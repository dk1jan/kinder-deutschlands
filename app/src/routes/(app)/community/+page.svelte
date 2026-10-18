<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PostCard from '$lib/components/community/PostCard.svelte';
	import ModuleArt from '$lib/components/art/ModuleArt.svelte';

	let { data, form } = $props();

	const TABS = [
		{ key: 'abos', label: 'Für dich' },
		{ key: 'neu', label: 'Neu' },
		{ key: 'geloest', label: 'Gelöst & Tipps' },
		{ key: 'lesezeichen', label: 'Gemerkt' }
	];
	const subscribed = (kind: 'region' | 'topic', key: string) => data.member && data.subs.some((s) => s.kind === kind && s.key === key);
	const href = (params: Record<string, string | null | undefined>) => {
		const u = new URLSearchParams();
		for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
		const s = u.toString();
		return `/community${s ? '?' + s : ''}`;
	};
</script>

<svelte:head><title>Community – Kinder Deutschlands</title></svelte:head>

{#if !data.member}
	<section class="teaser">
		<div class="tx">
			<p class="eyebrow">Community</p>
			<h1>Fragen, Erfahrungen, Gruppen.</h1>
			<p class="lead">Austausch nach Region und Thema – nur unter angemeldeten Eltern, nicht im offenen Internet. Geschützte Gruppen sind für Fremde unsichtbar.</p>
			<div class="row">
				<a class="btn" href="/anmelden?weiter=/community">Anmelden</a>
				<a class="btn secondary" href="/registrieren">Konto anlegen</a>
			</div>
			<ul class="topics">{#each data.topics as t}<li>{t.name}</li>{/each}</ul>
		</div>
		<div class="art"><ModuleArt name="community" /></div>
	</section>
	{#if data.knowledge.length}
		<section class="page">
			<h2>Aus dem Wissen der Community</h2>
			<ul class="kn">
				{#each data.knowledge as k}<li><a href="/community/wissen/{k.slug}"><b>{k.title}</b><span>{k.summary}</span></a></li>{/each}
			</ul>
			<a href="/community/wissen">Alle Wissenseinträge</a>
		</section>
	{/if}
{:else}
	<div class="layout">
		<div class="main">
			<header class="top">
				<h1>
					{#if data.filter.topic}{data.filter.topic.name}
					{:else if data.filter.region}{data.filter.region.name}
					{:else if data.filter.q}Suche: „{data.filter.q}“
					{:else if data.filter.tag}#{data.filter.tag}
					{:else}Community{/if}
				</h1>
				<a class="btn signal" href={href({ thema: data.filter.topic?.key, region: data.filter.region?.code }).replace('/community', '/community/neu')}>
					<Icon name="plus" size={18} />Beitrag schreiben
				</a>
			</header>
			{#if data.filter.topic || data.filter.region}
				{@const kind = data.filter.topic ? 'topic' : 'region'}
				{@const key = data.filter.topic?.key ?? data.filter.region?.code ?? ''}
				<div class="scopebar">
					<p>{data.filter.topic?.description ?? 'Beiträge aus dieser Region und allen Orten darin.'}</p>
					<form method="POST" action="?/abo" use:enhance>
						<input type="hidden" name="kind" value={kind} /><input type="hidden" name="key" value={key} />
						<input type="hidden" name="on" value={subscribed(kind, key) ? '0' : '1'} />
						<button class="btn small {subscribed(kind, key) ? 'secondary' : ''}" type="submit">{subscribed(kind, key) ? '✓ Abonniert' : 'Abonnieren'}</button>
					</form>
					<a class="small" href="/community">Alle anzeigen</a>
				</div>
			{/if}

			<form class="search" role="search" method="GET" action="/community">
				<label class="sf"><Icon name="suche" size={20} /><span class="sr">Community durchsuchen</span>
					<input type="search" name="q" value={data.filter.q ?? ''} placeholder="Suchen, z. B. „Eingewöhnung Kita“" />
				</label>
			</form>

			{#if !data.filter.topic && !data.filter.region && !data.filter.q && !data.filter.tag}
				<nav class="tabs" aria-label="Ansicht">
					{#each TABS as t}
						<a href={href({ ansicht: t.key })} aria-current={data.mode === t.key ? 'page' : undefined}>{t.label}</a>
					{/each}
				</nav>
			{/if}
			<nav class="chips" aria-label="Themen">
				{#each data.topics as t}
					<a class="chip" href={href({ thema: t.key })} aria-current={data.filter.topic?.key === t.key ? 'page' : undefined}>{t.name}</a>
				{/each}
			</nav>

			{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
			{#if data.mode === 'abos' && data.feed.subsNone}
				<Notice kind="info" title="Noch keine Abos">Abonniere Themen und deine Region – dann siehst du hier, was dich interessiert. Bis dahin zeigen wir alles Neue.</Notice>
			{/if}

			{#if data.feed.items.length}
				<ul class="feed">
					{#each data.feed.items as item (item.id)}<li><PostCard {item} /></li>{/each}
				</ul>
				{#if data.feed.next}
					<a class="btn secondary more" href={href({ ansicht: data.mode, thema: data.filter.topic?.key, region: data.filter.region?.code, q: data.filter.q, schlagwort: data.filter.tag, vor: data.feed.next })}>Ältere laden</a>
				{/if}
			{:else}
				<div class="empty">
					<p><strong>{data.mode === 'lesezeichen' ? 'Noch nichts gemerkt.' : data.filter.q ? 'Nichts gefunden.' : 'Hier ist es noch ruhig.'}</strong></p>
					<p class="muted">{data.mode === 'lesezeichen' ? 'Tippe bei einem Beitrag auf „Merken“.' : 'Stell die erste Frage oder teile eine Erfahrung – echte Beiträge von echten Eltern, keine Füllinhalte.'}</p>
					{#if data.mode !== 'lesezeichen'}<a class="btn" href="/community/neu{data.filter.topic ? '?thema=' + data.filter.topic.key : ''}">Ersten Beitrag schreiben</a>{/if}
				</div>
			{/if}
		</div>

		<aside class="side">
			<section>
				<h2>Meine Abos</h2>
				{#if data.subs.length}
					<ul class="links">
						{#each data.subs as s}<li><a href={href(s.kind === 'topic' ? { thema: s.key } : { region: s.key })}>{s.kind === 'region' ? '📍 ' : ''}{s.name}</a></li>{/each}
					</ul>
				{:else}
					<p class="muted small">Noch keine.</p>
				{/if}
				<a class="small" href="/community/abos">Abos verwalten</a>
			</section>
			<section>
				<h2>Meine Gruppen</h2>
				{#if data.groups.length}
					<ul class="links">{#each data.groups as g}<li><a href="/community/g/{g.slug}">{g.kind === 'geschuetzt' ? '🔒 ' : ''}{g.name}</a></li>{/each}</ul>
				{:else}
					<p class="muted small">Noch keine.</p>
				{/if}
				<a class="small" href="/community/gruppen">Gruppen entdecken</a>
			</section>
			<section>
				<h2>Wissen</h2>
				<p class="muted small">Geprüfte Antworten mit Quellen.</p>
				<a class="small" href="/community/wissen">Zum Wissen</a>
			</section>
		</aside>
	</div>
{/if}

<style>
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.teaser {
		max-width: var(--wide);
		margin: 0 auto;
		padding: var(--sp-6) var(--gutter);
		display: grid;
		gap: var(--sp-5);
		align-items: center;
	}
	.eyebrow {
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: var(--fs-xs);
		color: var(--sea);
		margin: 0;
	}
	.teaser h1 {
		font-size: clamp(2.2rem, 1.4rem + 4vw, 4rem);
		line-height: 1;
		margin: var(--sp-2) 0 var(--sp-3);
	}
	.lead {
		color: var(--ink-2);
		font-size: var(--fs-l);
		max-width: 34rem;
	}
	.row {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.topics {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		list-style: none;
		padding: 0;
		margin: var(--sp-5) 0 0;
	}
	.topics li {
		padding: 6px 14px;
		border-radius: 999px;
		background: var(--surface);
		font-weight: 650;
		font-size: var(--fs-s);
	}
	.art {
		max-width: 28rem;
	}
	@media (min-width: 900px) {
		.teaser {
			grid-template-columns: 1.2fr 1fr;
		}
	}
	.page {
		max-width: var(--wide);
		margin: 0 auto;
		padding: 0 var(--gutter) var(--sp-7);
	}
	.kn {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.kn a {
		display: grid;
		gap: 4px;
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		color: var(--ink);
		text-decoration: none;
	}
	.kn span {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}

	.layout {
		max-width: var(--wide);
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-6);
	}
	.main {
		display: grid;
		gap: var(--sp-3);
		min-width: 0;
		align-content: start;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.top h1 {
		margin: 0;
		font-size: clamp(1.8rem, 1.3rem + 2vw, 2.6rem);
	}
	.top .btn {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.scopebar {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
	}
	.scopebar p {
		margin: 0;
		flex: 1 1 16rem;
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.sf {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		height: 52px;
		padding: 0 var(--sp-4);
		background: var(--surface);
		border: 1.5px solid var(--line);
		border-radius: 999px;
		color: var(--ink-2);
	}
	.sf input {
		flex: 1;
		border: 0;
		background: transparent;
		min-height: 0;
		padding: 0;
		height: 100%;
	}
	.sf input:focus {
		outline: none;
	}
	.sf:focus-within {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.tabs {
		display: flex;
		gap: var(--sp-1);
		overflow-x: auto;
		border-bottom: 1px solid var(--line);
	}
	.tabs a {
		white-space: nowrap;
		padding: var(--sp-2) var(--sp-3) var(--sp-3);
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 650;
	}
	.tabs a[aria-current='page'] {
		color: var(--ink);
		box-shadow: inset 0 -3px 0 var(--yellow);
	}
	.chips {
		display: flex;
		gap: var(--sp-2);
		overflow-x: auto;
		padding-bottom: 4px;
		scrollbar-width: none;
	}
	.chip {
		flex: none;
		padding: 8px 14px;
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		text-decoration: none;
		font-size: var(--fs-s);
		font-weight: 650;
	}
	.chip[aria-current='page'] {
		background: var(--navy);
		color: #fff;
		border-color: var(--navy);
	}
	.feed {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.more {
		justify-self: center;
	}
	.empty {
		padding: var(--sp-6) var(--sp-4);
		text-align: center;
		background: var(--surface);
		border-radius: var(--radius-m);
	}
	.side {
		display: grid;
		gap: var(--sp-4);
		align-content: start;
	}
	.side section {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
	}
	.side h2 {
		font-size: var(--fs-m);
		margin: 0 0 var(--sp-2);
	}
	.links {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--sp-2);
		display: grid;
		gap: 4px;
	}
	.small {
		font-size: var(--fs-s);
	}
	@media (min-width: 960px) {
		.layout {
			grid-template-columns: minmax(0, 1fr) 300px;
		}
		.chips {
			flex-wrap: wrap;
			overflow: visible;
		}
	}
</style>
