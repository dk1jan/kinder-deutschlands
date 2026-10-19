<script lang="ts">
	// Abhaken nur im Browser (wird nicht gespeichert, verschwindet beim Neuladen) – bewusst, siehe D-053.
	import Icon from '$lib/components/Icon.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import CrisisBox from '$lib/components/alltag/CrisisBox.svelte';
	import { ORG_KINDS } from '$lib/angebote';
	let { data } = $props();
	const s = $derived(data.s);
	const sections = $derived.by(() => {
		const m = new Map<string, typeof s.steps>();
		for (const st of s.steps) {
			const k = st.section ?? '';
			if (!m.has(k)) m.set(k, []);
			m.get(k)!.push(st);
		}
		return [...m.entries()];
	});
	let done = $state<Record<string, boolean>>({});
	const d = (x: string | Date) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	};
</script>

<svelte:head><title>{s.title} – Lebenslagen-Kompass</title></svelte:head>

<article class="container page wrap">
	<a class="back" href="/kompass"><Icon name="zurueck" size={18} />Lebenslagen-Kompass</a>
	<h1>{s.title}</h1>
	<p class="lead">{s.intro}</p>
	{#if s.sensitive}<CrisisBox compact />{/if}

	{#if s.steps.length}
		<section class="card">
			<h2>Schritt für Schritt</h2>
			<p class="muted small">Zum Abhaken – wird nicht gespeichert. <button type="button" class="linkbtn" onclick={() => print()}>Drucken</button></p>
			{#each sections as [sec, list]}
				{#if sec}<h3>{sec}</h3>{/if}
				<ul class="steps">
					{#each list as st (st.id)}
						<li class:done={done[st.id]}>
							<label><input type="checkbox" bind:checked={done[st.id]} /> <span>{st.title}</span></label>
							{#if st.body}<p>{st.body}</p>{/if}
							{#if st.url}<a href={st.url} rel="noopener" target="_blank">Mehr dazu ({host(st.url)}) <Icon name="extern" size={14} /></a>{/if}
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{/if}

	{#if s.infos.length}
		<section class="card">
			<h2>Offizielle Informationen</h2>
			<ul class="links">
				{#each s.infos as i (i.id)}
					<li>{#if i.url}<a href={i.url} rel="noopener" target="_blank">{i.title} <Icon name="extern" size={14} /></a>{:else}<strong>{i.title}</strong>{/if}
						{#if i.body}<p>{i.body}</p>{/if}</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#if s.steps.length || s.infos.length}
		<p class="muted small">Quelle: {[...new Set([...s.steps, ...s.infos].map((x) => x.source).filter(Boolean))].join(', ')}{[...s.steps, ...s.infos][0]?.reviewedAt ? ` · zuletzt geprüft ${d([...s.steps, ...s.infos][0].reviewedAt!)}` : ''}. Angaben ohne Gewähr; maßgeblich sind die zuständigen Stellen.</p>
	{:else}
		<p class="empty">Für diese Lebenslage hat die Redaktion noch keine geprüften Schritte eingetragen.</p>
	{/if}

	<section class="card">
		<h2>Beratung in deiner Gegend</h2>
		<form method="GET" class="reg"><RegionPicker id="region" name="region" code={data.region?.code ?? ''} label={data.region?.name ?? ''} /><button class="btn small">Anzeigen</button></form>
		{#if s.orgs.length}
			<ul class="links">{#each s.orgs as o}<li><a href="/einrichtungen/{o.slug}">{o.name}</a> <small>{ORG_KINDS[o.kind as keyof typeof ORG_KINDS] ?? o.kind}{o.regionName ? ` · ${o.regionName}` : ''}</small></li>{/each}</ul>
		{:else}
			<p class="muted small">{data.region ? 'Hier ist noch keine passende verifizierte Einrichtung eingetragen.' : 'Wähle deine Gegend, um verifizierte Einrichtungen zu sehen.'} <a href="/einrichtungen">Alle Einrichtungen</a></p>
		{/if}
	</section>

	{#if s.knowledge.length}
		<section class="card">
			<h2>Aus dem Wissensbereich</h2>
			<ul class="links">{#each s.knowledge as k}<li><a href="/community/wissen/{k.slug}">{k.title}</a>{#if k.summary}<p>{k.summary}</p>{/if}</li>{/each}</ul>
		</section>
	{/if}

	<section class="card">
		<h2>Austausch mit anderen Familien</h2>
		{#if data.member}
			{#if s.groups.length}
				<ul class="links">{#each s.groups as g}<li><a href="/community/g/{g.slug}">{g.name}</a> <small>{g.kind === 'geschuetzt' ? 'geschützte Gruppe' : g.kind === 'beitritt' ? 'Beitritt auf Anfrage' : 'offene Gruppe'}</small></li>{/each}</ul>
			{/if}
			{#if s.topicKey}<p><a href="/community?thema={s.topicKey}">Fragen und Beiträge zum Thema in der Community</a></p>{/if}
			<p><a href="/hilfe">Familien helfen Familien</a> – Erfahrung teilen oder um Hilfe bitten.</p>
		{:else}
			<p class="muted small">Gruppen und Community sind für Mitglieder. <a href="/anmelden?weiter=/kompass/{s.key}">Anmelden</a></p>
		{/if}
	</section>
	{#if data.editor}<p><a class="btn small secondary" href="/admin/kompass?lage={s.key}">Inhalte pflegen</a></p>{/if}
</article>

<style>
	.wrap {
		max-width: 52rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.lead {
		color: var(--ink-2);
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4) var(--sp-5);
		margin: var(--sp-4) 0;
	}
	.card h2 {
		font-size: var(--fs-l);
		margin: 0 0 var(--sp-2);
	}
	h3 {
		font-size: var(--fs-m);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.steps li {
		padding: var(--sp-2) 0;
		border-bottom: 1px solid var(--line);
	}
	.steps label {
		display: flex;
		gap: var(--sp-2);
		align-items: flex-start;
		font-weight: 650;
		cursor: pointer;
	}
	.steps input {
		margin-top: 4px;
		width: 20px;
		height: 20px;
		flex: none;
	}
	.steps li.done span {
		text-decoration: line-through;
		color: var(--ink-2);
	}
	.steps p {
		margin: var(--sp-1) 0 0 28px;
		font-size: var(--fs-s);
	}
	.steps a {
		margin-left: 28px;
		font-size: var(--fs-s);
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.links {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.links a {
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.links p {
		margin: 2px 0 0;
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.links small {
		color: var(--ink-2);
	}
	.reg {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		margin-bottom: var(--sp-3);
	}
	.reg :global(> :first-child) {
		flex: 1;
	}
	.linkbtn {
		background: none;
		border: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		cursor: pointer;
	}
	.empty {
		padding: var(--sp-4);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
	}
	.small {
		font-size: var(--fs-s);
	}
	@media print {
		.back,
		.reg,
		.linkbtn {
			display: none;
		}
	}
</style>
