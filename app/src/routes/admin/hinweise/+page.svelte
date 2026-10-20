<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { NOTICE_KINDS, RADAR_TOPICS, SOURCE_KINDS } from '$lib/angebote';
	let { data, form } = $props();
	const fv = $derived((form && 'values' in form && form.values ? form.values : {}) as Record<string, string[]>);
	const v = (k: string) => fv[k]?.[0] ?? '';
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
</script>

<svelte:head><title>Hinweise – Verwaltung</title></svelte:head>

<h1>Regionale Hinweise</h1>
<p class="muted">Absagen, Sperrungen, Fristen, neue Leistungen. „Amtlich“ nur mit Link auf die amtliche Quelle. „Wichtig“ schickt einen Push ohne Inhalt – nur an Personen, die das in ihren Benachrichtigungen eingeschaltet haben und deren Radar die Region umfasst. Sparsam einsetzen.</p>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

{#if data.proposals.length}
	<section class="card prop">
		<h2>Vorschläge von Mitgliedern ({data.proposals.length})</h2>
		<p class="muted">Freigeben heißt: plausibel, keine privaten Daten, passt zur Region. Es bleibt sichtbar als „Hinweis eines Mitglieds“ – nicht amtlich.</p>
		{#each data.proposals as p (p.id)}
			<article>
				<p><strong>{NOTICE_KINDS[p.kind as keyof typeof NOTICE_KINDS] ?? p.kind}: {p.title}</strong> · {p.regionName ?? '–'} · bis {fmt(p.validUntil)}</p>
				{#if p.body}<p class="body">{p.body}</p>{/if}
				{#if p.sourceUrl}<p><a href={p.sourceUrl} rel="noopener nofollow" target="_blank">Quelle</a></p>{/if}
				<form method="POST" action="?/pruefen" class="row">
					<input type="hidden" name="id" value={p.id} />
					<input name="note" maxlength="300" placeholder="Begründung (bei Ablehnung Pflicht)" aria-label="Begründung" />
					<button class="btn small" name="decision" value="ja">Freigeben</button>
					<button class="btn small secondary" name="decision" value="nein">Ablehnen</button>
				</form>
			</article>
		{/each}
	</section>
{/if}

<details class="card" open={!!(form && 'error' in form)}>
	<summary>Neuer Hinweis</summary>
	{#key form}
		<form method="POST" action="?/neu" class="f">
			<div class="two">
				<label>Art<select name="kind" required>{#each Object.entries(NOTICE_KINDS) as [k, l]}<option value={k} selected={v('kind') === k}>{l}</option>{/each}</select></label>
				<label>Herkunft<select name="source_kind">{#each Object.entries(SOURCE_KINDS).filter(([k]) => k === 'amtlich' || k === 'redaktion') as [k, l]}<option value={k} selected={v('source_kind') === k}>{l}</option>{/each}</select></label>
				<label>Frist<input type="date" name="deadline" value={v('deadline')} /></label>
				<label>Anzeigen bis<input type="date" name="valid_until" value={v('valid_until')} /></label>
			</div>
			<label>Titel<input name="title" required minlength="3" maxlength="200" value={v('title')} /></label>
			<label>Text<textarea name="body" rows="3" maxlength="1200">{v('body')}</textarea></label>
			<label>Quelle (Link)<input type="url" name="source_url" maxlength="500" value={v('source_url')} /></label>
			<div class="field"><label for="hr">Region (leer = bundesweit)</label><RegionPicker id="hr" name="region_code" /></div>
			<fieldset class="pills"><legend>Themen</legend>{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="topics" value={k} checked={(fv.topics ?? []).includes(k)} /> {l}</label>{/each}</fieldset>
			<label class="check"><input type="checkbox" name="urgent" /> Wichtig – Push an Personen mit eingeschalteten „dringenden Hinweisen“</label>
			<div><button class="btn small">Veröffentlichen</button></div>
		</form>
	{/key}
</details>

<div class="scroll">
	<table class="data">
		<thead><tr><th scope="col">Hinweis</th><th scope="col">Herkunft</th><th scope="col">Region</th><th scope="col">Frist</th><th scope="col">Seit</th><th scope="col"></th></tr></thead>
		<tbody>
			{#each data.rows as n (n.id)}
				<tr>
					<td>{NOTICE_KINDS[n.kind as keyof typeof NOTICE_KINDS] ?? n.kind}: <a href="/hinweise#h-{n.id}">{n.title}</a>{n.urgent ? ' · wichtig' : ''}</td>
					<td>{SOURCE_KINDS[n.sourceKind as keyof typeof SOURCE_KINDS] ?? n.sourceKind}{n.orgName ? ` (${n.orgName})` : ''}</td>
					<td>{n.regionName ?? 'bundesweit'}</td><td>{fmt(n.deadline)}</td><td>{fmt(n.created)}</td>
					<td><form method="POST" action="?/beenden"><input type="hidden" name="id" value={n.id} /><button class="btn small secondary">Beenden</button></form></td>
				</tr>
			{:else}<tr><td colspan="6" class="muted">Keine aktiven Hinweise.</td></tr>{/each}
		</tbody>
	</table>
</div>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}
	.prop article {
		border-top: 1px solid var(--line);
		padding: var(--sp-3) 0;
	}
	.prop h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-l);
	}
	.prop .body {
		white-space: pre-line;
	}
	.prop .row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.prop .row input {
		flex: 1 1 14rem;
	}
	summary {
		cursor: pointer;
		font-weight: 700;
	}
	.f {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.f label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	}
	.pills {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.pill {
		display: inline-flex !important;
		align-items: center;
		gap: 4px;
		font-weight: 400 !important;
		padding: 4px 10px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
	}
	.f .check {
		display: flex;
		gap: var(--sp-2);
		font-weight: 400;
	}
	.scroll {
		overflow-x: auto;
	}
</style>
