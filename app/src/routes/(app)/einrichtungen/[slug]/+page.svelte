<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import NavChooser from '$lib/components/NavChooser.svelte';
	import ReportBox from '$lib/components/community/ReportBox.svelte';
	import EventCard from '$lib/components/angebote/EventCard.svelte';
	import OfferCard from '$lib/components/angebote/OfferCard.svelte';
	import { NOTICE_KINDS, ORG_KINDS, RADAR_TOPICS } from '$lib/angebote';

	let { data, form } = $props();
	const o = $derived(data.org);
	const following = $derived(form && 'following' in form ? !!form.following : o.following);
	const fmt = (d: string | Date) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
</script>

<svelte:head><title>{o.name} – Kinder Deutschlands</title><meta name="description" content={o.description.slice(0, 160)} /></svelte:head>

<article class="org">
	<a class="back" href="/einrichtungen"><Icon name="zurueck" size={18} />Einrichtungen</a>
	<p class="kind">{ORG_KINDS[o.kind as keyof typeof ORG_KINDS] ?? o.kind}{o.regionName ? ` · ${o.regionName}` : ''}</p>
	<h1>{o.name}</h1>
	{#if o.status === 'verifiziert'}
		<p class="ver"><Icon name="ok" size={18} /> Verifizierte Einrichtung{o.verifiedAt ? ` seit ${fmt(o.verifiedAt)}` : ''}</p>
	{:else}
		<Notice kind="warn" title="Nicht öffentlich">Status: {o.status}. Nur für das Team sichtbar.</Notice>
	{/if}
	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'reported' in form}<Notice kind="ok">Danke, die Moderation schaut es sich an.</Notice>{/if}

	<div class="acts">
		{#if data.member}
			<form method="POST" action="?/folgen" use:enhance><button class="btn small" class:secondary={following} aria-pressed={following}>{following ? 'Du folgst' : 'Folgen'}</button></form>
		{:else}
			<a class="btn small" href="/anmelden?weiter=/einrichtungen/{o.slug}">Folgen</a>
		{/if}
		{#if o.lat !== null && o.lon !== null}<NavChooser lat={o.lat} lon={o.lon} name={o.name} />{/if}
		{#if o.role}<a class="btn small secondary" href="/einrichtungen/verwalten/{o.slug}">Verwalten</a>{/if}
	</div>
	<p class="muted small">Folgen: Neues dieser Einrichtung erscheint in deinem Familienradar. Die Einrichtung sieht nur eine grobe Zahl ({o.followersText}), nicht wer folgt.</p>

	<div class="cols">
		<section class="card">
			<h2>Über uns</h2>
			{#if o.description}<p class="desc">{o.description}</p>{/if}
			<dl class="facts">
				{#if o.address}<div><dt>Adresse</dt><dd>{o.address}</dd></div>{/if}
				{#if o.website}<div><dt>Webseite</dt><dd><a href={o.website} rel="noopener nofollow" target="_blank">{o.website.replace(/^https?:\/\//, '')}</a></dd></div>{/if}
				{#if o.email}<div><dt>E-Mail</dt><dd><a href="mailto:{o.email}">{o.email}</a></dd></div>{/if}
				{#if o.phone}<div><dt>Telefon</dt><dd><a href="tel:{o.phone.replace(/[^+\d]/g, '')}">{o.phone}</a></dd></div>{/if}
				{#if o.topics.length}<div><dt>Themen</dt><dd>{o.topics.map((t) => RADAR_TOPICS[t as keyof typeof RADAR_TOPICS] ?? t).join(', ')}</dd></div>{/if}
			</dl>
		</section>

		{#if data.notices.length}
			<section class="card">
				<h2>Aktuelle Hinweise</h2>
				<ul class="notes">
					{#each data.notices as n}<li><span class="tag">{NOTICE_KINDS[n.kind as keyof typeof NOTICE_KINDS] ?? n.kind}</span> <strong>{n.title}</strong>{#if n.deadline} · Frist {fmt(n.deadline)}{/if}{#if n.body}<p>{n.body}</p>{/if}</li>{/each}
				</ul>
			</section>
		{/if}
	</div>

	<section>
		<h2>Freie Plätze & Kurse</h2>
		{#if data.offers.length}
			<div class="grid">{#each data.offers as of (of.id)}<OfferCard o={of} showOrg={false} />{/each}</div>
		{:else}<p class="muted">Derzeit keine Angebote eingetragen.</p>{/if}
	</section>

	<section>
		<h2>Nächste Termine</h2>
		{#if data.events.length}
			<div class="list">{#each data.events as e (e.id + e.date)}<EventCard {e} />{/each}</div>
		{:else}<p class="muted">Derzeit keine Termine eingetragen.</p>{/if}
	</section>

	{#if data.member && !o.role}<ReportBox action="?/melden" type="org" id={o.id} label="Einrichtung melden" />{/if}
</article>

<style>
	.org {
		max-width: var(--wide);
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
		display: grid;
		gap: var(--sp-3);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.kind {
		margin: var(--sp-3) 0 0;
		color: var(--ink-2);
		font-weight: 650;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.9rem, 1.2rem + 3vw, 3rem);
		line-height: 1.05;
		font-stretch: 85%;
	}
	h2 {
		font-size: var(--fs-l);
		margin: var(--sp-4) 0 var(--sp-3);
	}
	.ver {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--navy);
		font-weight: 700;
		margin: 0;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.cols {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-5);
	}
	.card h2 {
		margin-top: 0;
	}
	.desc {
		white-space: pre-line;
	}
	.facts {
		display: grid;
		gap: var(--sp-2);
	}
	.facts div {
		display: grid;
		grid-template-columns: 6.5rem 1fr;
		gap: var(--sp-2);
	}
	.facts dt {
		color: var(--ink-2);
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
	}
	.notes p {
		margin: var(--sp-1) 0 0;
	}
	.tag {
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--yellow);
		color: var(--navy);
	}
	.grid {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
	}
	.list {
		display: grid;
		gap: var(--sp-3);
		max-width: 52rem;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
