<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { KINDS, KIND_KEYS, CONFIRMATION, featuresFor, displayName, type Kind } from '$lib/places';
	let { data, form } = $props();
	const p = $derived(data.p);
	const locked = $derived(new Set<string>(p.locked_fields ?? []));
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
	const val = (k: string) => (p.features?.[k] === true ? 'ja' : p.features?.[k] === false ? 'nein' : '');
</script>

<svelte:head><title>Ort bearbeiten – Datenzentrale</title></svelte:head>

<p><a href="/admin/daten/pruefung">← Prüffälle</a> · <a href="/orte/{p.id}">Öffentliche Seite</a></p>
<h1>{displayName(p.kind as Kind, p.name, p.region_name)}</h1>
<p class="muted">{KINDS[p.kind as Kind]?.label} · {p.region_name ?? 'ohne Region'} · Status <strong>{p.status}</strong> · geprüft {fmt(p.checked_at)}</p>

{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

<form method="POST" action="?/speichern" class="card grid">
	<div class="field"><label for="kind">Art</label>
		<select id="kind" name="kind">{#each KIND_KEYS as k}<option value={k} selected={k === p.kind}>{KINDS[k].label}</option>{/each}</select></div>
	<div class="field"><label for="name">Name {#if locked.has('name')}<span class="lock">gesperrt</span>{/if}</label><input id="name" name="name" value={p.name ?? ''} maxlength="200" /></div>
	<div class="field wide"><label for="description">Beschreibung</label><textarea id="description" name="description" rows="3" maxlength="2000">{p.description ?? ''}</textarea></div>
	<div class="field"><label for="opening_hours">Öffnungszeiten {#if locked.has('opening_hours')}<span class="lock">gesperrt</span>{/if}</label><input id="opening_hours" name="opening_hours" value={p.opening_hours ?? ''} /></div>
	<div class="field"><label for="website">Webseite {#if locked.has('website')}<span class="lock">gesperrt</span>{/if}</label><input id="website" name="website" value={p.website ?? ''} /></div>
	<div class="field"><label for="status">Status</label>
		<select id="status" name="status">{#each ['aktiv', 'archiviert', 'abgelehnt'] as s}<option value={s} selected={s === p.status}>{s}</option>{/each}{#if !['aktiv', 'archiviert', 'abgelehnt'].includes(p.status)}<option value={p.status} selected>{p.status}</option>{/if}</select></div>
	<div class="field"><label for="confirmation">Bestätigung</label>
		<select id="confirmation" name="confirmation">{#each Object.entries(CONFIRMATION) as [k, c]}<option value={k} selected={k === p.confirmation}>{c.label}</option>{/each}</select></div>
	<fieldset class="wide feats">
		<legend>Merkmale <span class="muted">(leer = unbekannt)</span></legend>
		{#each featuresFor(p.kind as Kind) as [key, d]}
			<div class="feat">
				<label for="f_{key}">{d.label}{#if locked.has(`features.${key}`)} <span class="lock">gesperrt</span>{/if}</label>
				<select id="f_{key}" name="f_{key}"><option value="" selected={val(key) === ''}>unbekannt</option><option value="ja" selected={val(key) === 'ja'}>ja</option><option value="nein" selected={val(key) === 'nein'}>nein</option></select>
			</div>
		{/each}
	</fieldset>
	<div class="wide row"><button class="btn" type="submit">Speichern</button></div>
</form>
{#if locked.size}
	<form method="POST" action="?/entsperren" class="row"><p class="muted">Gesperrte Felder: {[...locked].join(', ')}</p><button class="btn small secondary">Alle Sperren aufheben</button></form>
{/if}

<section class="card">
	<h2>Hinweise am Ort</h2>
	{#each data.notices as n}
		<div class="row note">
			<span><strong>{n.kind}</strong> · {n.origin} · {fmt(n.created_at)}{n.ended_at ? ` · beendet ${fmt(n.ended_at)}` : n.valid_until ? ` · bis ${fmt(n.valid_until)}` : ''}{n.text ? ` – ${n.text}` : ''}</span>
			{#if !n.ended_at}<form method="POST" action="?/hinweisEnde"><input type="hidden" name="id" value={n.id} /><button class="btn small secondary">Beenden</button></form>{/if}
		</div>
	{:else}<p class="muted">Keine Hinweise.</p>{/each}
	<form method="POST" action="?/hinweis" class="grid">
		<div class="field"><label for="nkind">Art</label><select id="nkind" name="kind"><option value="gesperrt">gesperrt</option><option value="defekt">defekt</option></select></div>
		<div class="field"><label for="norigin">Herkunft</label><select id="norigin" name="origin"><option value="redaktion">Redaktion</option><option value="amtlich">amtlich</option></select></div>
		<div class="field wide"><label for="ntext">Text</label><input id="ntext" name="text" maxlength="500" /></div>
		<div class="field"><label for="nurl">Quelle (Link)</label><input id="nurl" name="source_url" /></div>
		<div class="field"><label for="ndays">Gültig (Tage, leer = offen)</label><input id="ndays" name="days" type="number" min="1" max="399" /></div>
		<div class="wide"><button class="btn small">Hinweis veröffentlichen</button></div>
	</form>
</section>

<section class="card">
	<h2>Herkunft</h2>
	{#each data.sources as s}
		<p>{s.name} · <code>{s.external_id}</code> · zuerst {fmt(s.first_seen_at)} · zuletzt {fmt(s.last_seen_at)}{s.gone_at ? ` · weg seit ${fmt(s.gone_at)}` : ''} {#if s.external_url}<a href={s.external_url} rel="noopener" target="_blank">ansehen</a>{/if}</p>
	{:else}<p class="muted">Von einem Mitglied vorgeschlagen.</p>{/each}
	<h3>Verlauf</h3>
	<ul>{#each data.history as h}<li>{fmt(h.at)} · {h.action}</li>{:else}<li class="muted">Keine Einträge.</li>{/each}</ul>
</section>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
		margin: var(--sp-4) 0;
		max-width: 60rem;
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
	.feats {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--sp-2) var(--sp-4);
	}
	.feats legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.feat {
		display: grid;
		gap: 2px;
	}
	.lock {
		font-size: var(--fs-xs);
		font-weight: 700;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--surface-2);
	}
	.lock::before {
		content: '🔒 ';
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.note {
		justify-content: space-between;
		border-bottom: 1px solid var(--line);
		padding: var(--sp-2) 0;
	}
</style>
