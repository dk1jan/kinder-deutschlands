<script lang="ts">
	import { enhance } from '$app/forms';
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { NOTICE_KINDS, RADAR_TOPICS, SOURCE_KINDS } from '$lib/angebote';

	let { data, form } = $props();
	const d = (x: string | Date) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
	const PN: Record<string, string> = { defekt: 'Defekt', gesperrt: 'Gesperrt' };
</script>

<svelte:head><title>Hinweise & Fristen – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<div class="head">
		<h1>Hinweise & Fristen</h1>
		{#if data.editor}<a class="btn small secondary" href="/admin/hinweise">Hinweis veröffentlichen</a>
		{:else if data.member}<a class="btn small secondary" href="/hinweise/neu">Hinweis vorschlagen</a>{/if}
	</div>
	<p class="lead">Was sich in deiner Region ändert: Absagen, Sperrungen, Fristen, neue Leistungen. Die Herkunft steht immer dabei.</p>

	<form method="GET" class="ff">
		<div class="field"><label for="region">Region</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
		<fieldset class="row"><legend>Art</legend>{#each Object.entries(NOTICE_KINDS) as [k, l]}<label class="pill"><input type="checkbox" name="art" value={k} checked={data.filters.kinds.includes(k)} /> {l}</label>{/each}</fieldset>
		<fieldset class="row"><legend>Thema</legend>{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="thema" value={k} checked={data.filters.topics.includes(k)} /> {l}</label>{/each}</fieldset>
		<div><button class="btn small">Anzeigen</button></div>
	</form>

	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}

	{#if data.notices.length || data.placeNotices.length}
		<ul class="notes">
			{#each data.notices as n (n.id)}
				<li id="h-{n.id}" class:urgent={n.urgent} class:amtlich={n.sourceKind === 'amtlich'}>
					<p class="top"><span class="tag">{NOTICE_KINDS[n.kind as keyof typeof NOTICE_KINDS] ?? n.kind}</span>{#if n.urgent}<span class="tag red">Wichtig</span>{/if}
						<span class="src">{SOURCE_KINDS[n.sourceKind as keyof typeof SOURCE_KINDS] ?? n.sourceKind}{n.sourceName ? ` – ${n.sourceName}` : ''}</span></p>
					<h2>{#if n.link}<a href={n.link}>{n.title}</a>{:else}{n.title}{/if}</h2>
					{#if n.body}<p class="body">{n.body}</p>{/if}
					<p class="meta">{n.regionName ?? 'Bundesweit'} · seit {d(n.validFrom)}{n.deadline ? ` · Frist ${d(n.deadline)}` : ''}{n.validUntil ? ` · bis ${d(n.validUntil)}` : ''}
						{#if n.sourceUrl} · <a href={n.sourceUrl} rel="noopener nofollow" target="_blank">Quelle</a>{/if}</p>
					{#if data.member}
						{@const saved = form && 'id' in form && form.id === n.id && 'saved' in form ? (form.saved ? '' : null) : (data.saved[n.id] ?? null)}
						<div class="acts">
							<form method="POST" action="?/merken" use:enhance><input type="hidden" name="id" value={n.id} /><button class="btn small" class:secondary={saved === null}>{saved === null ? 'Merken' : 'Gemerkt'}</button></form>
							{#if n.deadline}
								<form method="POST" action="?/erinnern" use:enhance class="rem"><input type="hidden" name="id" value={n.id} />
									<select name="offset" aria-label="An Frist erinnern"><option value="1d">1 Tag vor der Frist</option><option value="3d">3 Tage vorher</option><option value="1w">1 Woche vorher</option><option value="">keine Erinnerung</option></select>
									<button class="btn small secondary">Erinnern</button></form>
								{#if form && 'reminded' in form && form.id === n.id}<span class="small" role="status">{form.reminded ? 'Erinnerung gesetzt.' : 'Erinnerung entfernt.'}</span>{/if}
							{/if}
						</div>
					{/if}
				</li>
			{/each}
			{#each data.placeNotices as p (p.id)}
				<li class:amtlich={p.origin === 'amtlich'}>
					<p class="top"><span class="tag">{PN[p.kind] ?? p.kind}</span><span class="src">{p.origin === 'amtlich' ? 'Amtlich bestätigt' : 'Redaktion'} – Familienkarte</span></p>
					<h2><a href="/orte/{p.placeId}">{p.placeName}</a></h2>
					{#if p.text}<p class="body">{p.text}</p>{/if}
					<p class="meta">{p.regionName ?? ''} · seit {d(p.at)}{#if p.sourceUrl} · <a href={p.sourceUrl} rel="noopener nofollow" target="_blank">Quelle</a>{/if}</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">Derzeit keine Hinweise{data.filters.region ? ` für ${data.filters.region.name}` : ''}.</p>
	{/if}
	<p class="muted small">Tipp: Im <a href="/radar">Familienradar</a> bekommst du neue Hinweise für deine Region als Zusammenfassung.</p>
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}
	h1 {
		margin: 0;
	}
	.lead {
		color: var(--ink-2);
		max-width: 48rem;
	}
	.ff {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		max-width: 56rem;
		margin-bottom: var(--sp-5);
	}
	.row {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	legend {
		font-weight: 700;
		font-size: var(--fs-s);
		width: 100%;
		margin-bottom: var(--sp-1);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		font-size: var(--fs-s);
		min-height: 40px;
		background: var(--surface);
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-3);
		max-width: 52rem;
	}
	.notes li {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		border-left: 6px solid var(--yellow);
	}
	.notes li.amtlich {
		border-left-color: var(--navy);
	}
	.notes li.urgent {
		border-left-color: #d63d31;
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin: 0;
	}
	.tag {
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--yellow);
		color: var(--navy);
	}
	.tag.red {
		background: #d63d31;
		color: #fff;
	}
	.src {
		font-size: var(--fs-xs);
		color: var(--ink-2);
		font-weight: 650;
	}
	h2 {
		font-size: var(--fs-m);
		margin: var(--sp-2) 0 var(--sp-1);
	}
	.body {
		margin: 0 0 var(--sp-1);
		white-space: pre-line;
	}
	.meta {
		font-size: var(--fs-s);
		color: var(--ink-2);
		margin: 0;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin-top: var(--sp-2);
	}
	.rem {
		display: flex;
		gap: var(--sp-1);
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
