<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { GROUP_KIND_UI } from '$lib/community';
	let { data, form } = $props();
	const g = $derived(data.groups.find((x) => x.id === data.edit) ?? null);
</script>

<svelte:head><title>Gruppen – Verwaltung</title></svelte:head>

<h1>Gruppen</h1>
<p class="muted">Gruppen anlegen und bearbeiten. Moderation einer Gruppe vergibst du unter <a href="/admin/rechte">Rollen und Rechte</a>: Rolle „Moderation (geschützte Gruppe)“, Geltungsbereich „Gruppe“, Kennung = Gruppen-ID. Geschützte Gruppen sind für allgemeine Moderation nicht automatisch offen.</p>
{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
	<table class="data">
		<thead><tr><th scope="col">Gruppe</th><th scope="col">Art</th><th scope="col">Mitglieder</th><th scope="col">Anfragen</th><th scope="col">Moderation</th><th scope="col">ID</th><th scope="col"></th></tr></thead>
		<tbody>
			{#each data.groups as x}
				<tr>
					<td><a href="/community/g/{x.slug}">{x.name}</a>{x.region_name ? ` · ${x.region_name}` : ''}</td>
					<td>{GROUP_KIND_UI[x.kind as keyof typeof GROUP_KIND_UI]?.label}</td>
					<td>{x.members}</td>
					<td>{x.pending}</td>
					<td>{x.mods ? `${x.mods} zugewiesen` : x.kind === 'geschuetzt' ? '⚠ niemand' : 'allgemein'}</td>
					<td><code class="small">{x.id}</code></td>
					<td><a href="?bearbeiten={x.id}">Bearbeiten</a></td>
				</tr>
			{:else}<tr><td colspan="7" class="muted">Noch keine Gruppen.</td></tr>{/each}
		</tbody>
	</table>
</div>

<section class="card">
	<h2>{g ? `„${g.name}“ bearbeiten` : 'Neue Gruppe'}</h2>
	{#key g?.id}
		<form method="POST" action="?/speichern" class="grid">
			{#if g}<input type="hidden" name="id" value={g.id} />{/if}
			<div class="field"><label for="name">Name</label><input id="name" name="name" required value={g?.name ?? ''} maxlength="80" /></div>
			<div class="field"><label for="slug">Kurzname (Adresse)</label><input id="slug" name="slug" required pattern="[a-z0-9-]{'{'}3,60{'}'}" value={g?.slug ?? ''} placeholder="alleinerziehende" /></div>
			<div class="field"><label for="kind">Art</label>
				<select id="kind" name="kind">{#each Object.entries(GROUP_KIND_UI) as [k, v]}<option value={k} selected={(g?.kind ?? 'offen') === k}>{v.label} – {v.text}</option>{/each}</select></div>
			<div class="field"><label for="topic">Thema</label>
				<select id="topic" name="topic"><option value="">keins</option>{#each data.topics as t}<option value={t.key} selected={g?.topic_key === t.key}>{t.name}</option>{/each}</select></div>
			<div class="field wide"><label for="region_code">Region (optional)</label><RegionPicker id="region_code" name="region_code" code={g?.region_code ?? ''} label={g?.region_name ?? ''} /></div>
			<div class="field wide"><label for="description">Beschreibung</label><textarea id="description" name="description" rows="3" required>{g?.description ?? ''}</textarea></div>
			<div class="field wide"><label for="rules">Regeln (optional)</label><textarea id="rules" name="rules" rows="4">{g?.rules ?? ''}</textarea></div>
			<div class="field wide"><label for="admission">Aufnahmefragen für geschützte Gruppen (eine je Zeile, höchstens 5)</label>
				<textarea id="admission" name="admission" rows="3" placeholder="Was erhoffst du dir von der Gruppe?">{((g?.admission ?? []) as string[]).join('\n')}</textarea>
				<span class="hint">Datensparsam fragen: keine Nachweise, keine Ausweise, keine Details über Kinder. Antworten werden nach der Entscheidung gelöscht.</span></div>
			<div class="field wide"><label for="partner">Aufnahme auch durch Partnerorganisation (optional, nicht bei offenen Gruppen)</label>
				<select id="partner" name="partner"><option value="">keine</option>{#each data.orgs as o}<option value={o.id} selected={g?.partner_org_id === o.id}>{o.name}</option>{/each}</select>
				<span class="hint">Die Verwaltung dieser verifizierten Einrichtung entscheidet über Anfragen (sieht nur Gruppennamen und Antworten), moderiert aber keine Inhalte.</span></div>
			<div class="wide"><button class="btn">Speichern</button>{#if g}<a class="btn secondary" href="/admin/gruppen">Neue Gruppe</a>{/if}</div>
		</form>
	{/key}
</section>

<style>
	.scroll {
		overflow-x: auto;
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
		margin-top: var(--sp-5);
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
	.hint {
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
	.small {
		font-size: var(--fs-xs);
	}
</style>
