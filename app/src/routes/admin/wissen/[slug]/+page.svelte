<script lang="ts">
	import { page } from '$app/state';
	import Notice from '$lib/components/Notice.svelte';
	import Editor from '$lib/components/community/Editor.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	let { data, form } = $props();
	const k = $derived(data.k);
	const sources = $derived(((k?.sources ?? []) as { title: string; url: string }[]).map((s) => `${s.title} ${s.url}`).join('\n'));
</script>

<svelte:head><title>Wissenseintrag – Verwaltung</title></svelte:head>

<p><a href="/admin/wissen">← Wissen</a>{#if k} · <a href="/community/wissen/{k.slug}">Ansehen</a>{/if}</p>
<h1>{k ? k.title : 'Neuer Wissenseintrag'}</h1>
{#if page.url.searchParams.has('gespeichert')}<Notice kind="ok">Gespeichert.</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
{#if k?.consent === 'angefragt'}<Notice kind="info" title="Zustimmung angefragt">Aus einem Beitrag übernommen – veröffentlichen erst nach Zustimmung der Autorin/des Autors.</Notice>{/if}
{#if k?.consent === 'abgelehnt'}<Notice kind="warn">Die Autorin/der Autor hat abgelehnt. Bitte nicht veröffentlichen.</Notice>{/if}

<form method="POST" class="grid card">
	<div class="field wide"><label for="title">Titel</label><input id="title" name="title" required value={k?.title ?? ''} /></div>
	<div class="field"><label for="slug">Kurzname</label><input id="slug" name="slug" value={k?.slug ?? ''} placeholder="wird aus dem Titel gebildet" /></div>
	<div class="field"><label for="topic">Thema</label><select id="topic" name="topic"><option value="">keins</option>{#each data.topics as t}<option value={t.key} selected={k?.topic_key === t.key}>{t.name}</option>{/each}</select></div>
	<div class="field wide"><label for="summary">Kurz zusammengefasst</label><textarea id="summary" name="summary" rows="2" required>{k?.summary ?? ''}</textarea></div>
	<div class="wide"><Editor name="body" value={k?.body ?? ''} label="Inhalt" rows={14} /></div>
	<div class="field wide"><label for="sources">Quellen (eine je Zeile: Titel und Link)</label>
		<textarea id="sources" name="sources" rows="4" placeholder="Familienportal des Bundes https://familienportal.de/…">{sources}</textarea></div>
	<div class="field"><label for="region_code">Region (optional)</label><RegionPicker id="region_code" name="region_code" code={k?.region_code ?? ''} label={k?.region_name ?? ''} /></div>
	<div class="field"><label for="visibility">Sichtbarkeit</label><select id="visibility" name="visibility"><option value="mitglieder" selected={k?.visibility !== 'oeffentlich'}>nur Mitglieder</option><option value="oeffentlich" selected={k?.visibility === 'oeffentlich'}>öffentlich (auch ohne Anmeldung)</option></select></div>
	<div class="wide row"><button class="btn secondary" name="publish" value="0">Als Entwurf speichern</button><button class="btn" name="publish" value="1">Geprüft – veröffentlichen</button></div>
	<p class="muted small wide">„Veröffentlichen“ setzt das Prüfdatum auf heute. Bitte Fakten gegen die Quellen prüfen; keine medizinischen oder rechtlichen Einzelfallratschläge.</p>
</form>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
		max-width: 56rem;
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
	.row {
		display: flex;
		gap: var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
