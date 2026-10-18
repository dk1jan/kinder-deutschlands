<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { KINDS, type Kind } from '$lib/places';
	let { data, form } = $props();
	const r = $derived(data.run);
	const groups = $derived(
		(['neu', 'geaendert', 'entfernt'] as const).map((a) => ({ a, items: data.items.filter((i) => i.action === a) }))
	);
	const word = { neu: 'Neu', geaendert: 'Geändert', entfernt: 'Nicht mehr in der Quelle' } as const;
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
</script>

<svelte:head><title>Abruf {r.id} – Datenzentrale</title></svelte:head>

<p><a href="/admin/daten/quelle/{r.source_key}">← {r.source_name}</a></p>
<h1>Abruf vom {fmt(r.started_at)}</h1>
<p>Status: <strong>{r.status}</strong>{r.message ? ` – ${r.message}` : ''}</p>
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

{#if r.status === 'vorschau'}
	<div class="row">
		<form method="POST" action="?/uebernehmen"><button class="btn">Alles übernehmen</button></form>
		<form method="POST" action="?/verwerfen"><button class="btn secondary">Verwerfen</button></form>
	</div>
	<p class="muted">Übernehmen legt neue Orte an, aktualisiert geänderte (redaktionell gesperrte Felder bleiben) und archiviert verschwundene – nichts wird gelöscht.</p>
{/if}

{#if !data.items.length}
	<p class="muted">Keine Einträge gespeichert (unverändert oder zur Speicherersparnis gekürzt).</p>
{/if}
{#each groups as g}
	{#if g.items.length}
		<section>
			<h2>{word[g.a]} ({g.items.length}{g.items.length >= 600 ? '+' : ''})</h2>
			<ul class="items">
				{#each g.items as i}
					<li>
						{#if i.place_id}<a href="/admin/daten/ort/{i.place_id}">{i.name ?? i.external_id}</a>{:else}{i.name ?? i.external_id}{/if}
						<small class="muted">{i.kind ? KINDS[i.kind as Kind]?.label : ''} · {i.external_id}</small>
						{#if i.url}<a class="small" href={i.url} rel="noopener" target="_blank">Quelle</a>{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/each}

<style>
	.row {
		display: flex;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}
	.items {
		columns: 2 22rem;
		padding-left: 1.1rem;
	}
	.items li {
		break-inside: avoid;
		margin-bottom: var(--sp-1);
	}
	.small {
		font-size: var(--fs-xs);
	}
</style>
