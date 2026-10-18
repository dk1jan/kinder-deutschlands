<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const s = $derived(data.src);
	const c = $derived(s.config as Record<string, unknown>);
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
	const statusWord = { laeuft: 'läuft', vorschau: 'Vorschau', uebernommen: 'übernommen', fehler: 'Fehler', verworfen: 'verworfen' } as Record<string, string>;
	const countsText = (x: Record<string, number>) => Object.entries(x ?? {}).filter(([, v]) => v).map(([k, v]) => `${k} ${Number(v).toLocaleString('de-DE')}`).join(' · ');
</script>

<svelte:head><title>{s.name} – Datenzentrale</title></svelte:head>

<p><a href="/admin/daten">← Daten und Orte</a></p>
<h1>{s.name}</h1>

{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

<section class="card" aria-labelledby="katalog">
	<h2 id="katalog">Quellenkatalog</h2>
	<dl class="kv">
		<div><dt>Betreiber</dt><dd>{s.operator}</dd></div>
		<div><dt>Format</dt><dd>{s.format}</dd></div>
		<div><dt>Zugang</dt><dd><a href={s.access} rel="noopener" target="_blank">{s.access}</a></dd></div>
		<div><dt>Nutzungsrecht</dt><dd>{#if s.license_url}<a href={s.license_url} rel="noopener" target="_blank">{s.license}</a>{:else}{s.license}{/if}</dd></div>
		<div><dt>Namensnennung</dt><dd>{s.attribution}</dd></div>
		<div><dt>Regionen / Themen</dt><dd>{s.regions.join(', ')} · {s.topics.join(', ')}</dd></div>
		<div><dt>Zuverlässigkeit</dt><dd>{s.runs_ok} erfolgreiche Abrufe{s.runs_failed ? `, zuletzt ${s.runs_failed} Fehler in Folge` : ''}</dd></div>
		<div><dt>Letzter Erfolg</dt><dd>{fmt(s.last_success_at)}</dd></div>
		<div><dt>Nächster Abruf</dt><dd>{s.paused ? 'pausiert' : fmt(s.next_run_at)}</dd></div>
		{#if s.last_error}<div><dt>Letzter Fehler</dt><dd class="err">{s.last_error}</dd></div>{/if}
	</dl>
</section>

<section class="card" aria-labelledby="regeln">
	<h2 id="regeln">Zeitplan und Freigaberegeln</h2>
	<form method="POST" action="?/speichern" class="grid">
		<div class="field"><label for="interval_hours">Rhythmus (Stunden)</label><input id="interval_hours" name="interval_hours" type="number" min="6" max="8760" value={s.interval_hours} disabled={!data.mayEdit} /></div>
		<div class="field"><label for="max_removal_pct">Höchstens entfernen ohne Freigabe (%)</label><input id="max_removal_pct" name="max_removal_pct" type="number" min="0" max="100" value={s.max_removal_pct} disabled={!data.mayEdit} /></div>
		{#if s.kind === 'orte'}
			<label class="check wide"><input type="checkbox" name="auto_apply" checked={s.auto_apply} disabled={!data.mayEdit} /><span>Änderungen automatisch übernehmen <span class="muted">(sonst wartet jeder Abruf als Vorschau auf Freigabe)</span></span></label>
		{:else}
			<input type="hidden" name="auto_apply" value="on" />
		{/if}
		{#if c.type === 'osm'}
			<fieldset class="wide"><legend>Gebiete</legend>
				{#each [['DE-HB', 'Bremen'], ['DE-NI', 'Niedersachsen']] as [v, l]}<label class="check"><input type="checkbox" name="areas" value={v} checked={(c.areas as string[]).includes(v)} disabled={!data.mayEdit} /><span>{l}</span></label>{/each}
			</fieldset>
		{/if}
		{#if c.type === 'vg250'}
			<fieldset class="wide"><legend>Länder</legend>
				{#each [['03', 'Niedersachsen'], ['04', 'Bremen']] as [v, l]}<label class="check"><input type="checkbox" name="laender" value={v} checked={(c.laender as string[]).includes(v)} disabled={!data.mayEdit} /><span>{l}</span></label>{/each}
			</fieldset>
		{/if}
		{#if c.type === 'protomaps'}
			<div class="field"><label for="bbox">Gebiet (West,Süd,Ost,Nord)</label><input id="bbox" name="bbox" value={c.bbox} disabled={!data.mayEdit} /></div>
			<div class="field"><label for="maxzoom">Höchste Zoomstufe</label><input id="maxzoom" name="maxzoom" type="number" min="10" max="15" value={c.maxzoom} disabled={!data.mayEdit} /></div>
			<p class="muted wide">Bremen + Niedersachsen bis Zoom 15 ≈ 1,5 GB, bis Zoom 14 ≈ 0,7 GB. Beim Ändern wird beim nächsten Abruf neu geladen.</p>
		{/if}
		<div class="field wide"><label for="contact">Kontakt</label><input id="contact" name="contact" value={s.contact ?? ''} disabled={!data.mayEdit} /></div>
		<div class="field wide"><label for="notes">Notizen</label><textarea id="notes" name="notes" rows="3" disabled={!data.mayEdit}>{s.notes ?? ''}</textarea></div>
		{#if data.mayEdit}<div class="wide"><button class="btn" type="submit">Speichern</button></div>{/if}
	</form>
</section>

<section aria-labelledby="laeufe">
	<h2 id="laeufe">Abrufe</h2>
	<div class="scroll">
		<table class="data">
			<thead><tr><th scope="col">Beginn</th><th scope="col">Auslöser</th><th scope="col">Status</th><th scope="col">Ergebnis</th></tr></thead>
			<tbody>
				{#each data.runs as r}
					<tr>
						<td>{fmt(r.started_at)}</td>
						<td>{r.trigger}</td>
						<td>{statusWord[r.status] ?? r.status}</td>
						<td>{countsText(r.counts)}{#if r.message}<br /><small class:err={r.status === 'fehler'}>{r.message}</small>{/if}{#if r.status === 'vorschau' || (s.kind === 'orte' && r.status === 'uebernommen')}<br /><a href="/admin/daten/lauf/{r.id}">Einträge ansehen</a>{/if}</td>
					</tr>
				{:else}
					<tr><td colspan="4" class="muted">Noch keine Abrufe.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
		margin-bottom: var(--sp-5);
		max-width: 56rem;
	}
	.kv {
		display: grid;
		gap: var(--sp-2);
		margin: 0;
	}
	.kv div {
		display: grid;
		grid-template-columns: 11rem 1fr;
		gap: var(--sp-3);
	}
	.kv dt {
		color: var(--ink-2);
	}
	.kv dd {
		margin: 0;
		word-break: break-word;
	}
	.err {
		color: var(--danger);
	}
	.grid {
		display: grid;
		gap: var(--sp-3) var(--sp-4);
	}
	@media (min-width: 720px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
		.wide {
			grid-column: 1 / -1;
		}
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-1);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 44px;
	}
	.scroll {
		overflow-x: auto;
	}
</style>
