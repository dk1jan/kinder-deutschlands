<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	// svelte-ignore state_referenced_locally
	let lage = $state(data.lage || data.situations[0]?.key || '');
	const list = $derived(data.items.filter((i) => i.situation === lage));
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
</script>

<svelte:head><title>Lebenslagen-Kompass – Verwaltung</title></svelte:head>

<h1>Lebenslagen-Kompass</h1>
<p class="muted">Schritte und Links nur aus geprüften, offiziellen Quellen – mit Quelle. Speichern setzt das Prüfdatum. Besucher sehen ihre Auswahl nicht gespeichert.</p>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

<label class="sel">Lebenslage
	<select bind:value={lage}>{#each data.situations as s}<option value={s.key}>{s.title} ({s.items})</option>{/each}</select>
</label>
<p><a href="/kompass/{lage}" target="_blank">Öffentliche Seite ansehen</a></p>

{#each list as i (i.id)}
	<details class="card">
		<summary><strong>{i.kind === 'schritt' ? 'Schritt' : 'Info'}</strong>{i.section ? ` · ${i.section}` : ''} · {i.title} <small class="muted">({i.source ?? '–'}, geprüft {fmt(i.reviewedAt)})</small></summary>
		<form method="POST" action="?/speichern" class="f">
			<input type="hidden" name="id" value={i.id} /><input type="hidden" name="situation" value={i.situation} />
			<div class="two">
				<label>Art<select name="kind"><option value="schritt" selected={i.kind === 'schritt'}>Schritt (zum Abhaken)</option><option value="info" selected={i.kind === 'info'}>Information / Link</option></select></label>
				<label>Abschnitt<input name="section" value={i.section ?? ''} /></label>
				<label>Reihenfolge<input name="sort" type="number" value={i.sort} /></label>
			</div>
			<label>Titel<input name="title" required value={i.title} /></label>
			<label>Text<textarea name="body" rows="2">{i.body}</textarea></label>
			<div class="two"><label>Link<input name="url" type="url" value={i.url ?? ''} /></label><label>Quelle<input name="source" required value={i.source ?? ''} /></label></div>
			<div class="row"><button class="btn small">Speichern</button></div>
		</form>
		<form method="POST" action="?/loeschen"><input type="hidden" name="id" value={i.id} /><button class="btn small secondary">Löschen</button></form>
	</details>
{:else}<p class="muted">Noch keine Einträge für diese Lebenslage.</p>{/each}

<details class="card" open={!list.length}>
	<summary><strong>Neuer Eintrag</strong></summary>
	<form method="POST" action="?/speichern" class="f">
		<input type="hidden" name="situation" value={lage} />
		<div class="two">
			<label>Art<select name="kind"><option value="schritt">Schritt (zum Abhaken)</option><option value="info">Information / Link</option></select></label>
			<label>Abschnitt<input name="section" placeholder="z. B. Nach der Geburt" /></label>
			<label>Reihenfolge<input name="sort" type="number" value="100" /></label>
		</div>
		<label>Titel<input name="title" required /></label>
		<label>Text<textarea name="body" rows="2"></textarea></label>
		<div class="two"><label>Link<input name="url" type="url" placeholder="https://…" /></label><label>Quelle<input name="source" required placeholder="z. B. Familienportal (BMFSFJ)" /></label></div>
		<div class="row"><button class="btn small">Anlegen</button></div>
	</form>
</details>

<style>
	.sel {
		display: grid;
		gap: 4px;
		max-width: 24rem;
		font-weight: 650;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-3) var(--sp-4);
		margin-bottom: var(--sp-2);
	}
	summary {
		cursor: pointer;
	}
	.f {
		display: grid;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}
	.f label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.two {
		display: grid;
		gap: var(--sp-2);
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	}
	.row {
		display: flex;
		gap: var(--sp-2);
	}
</style>
