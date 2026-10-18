<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { renderMarkup } from '$lib/markup';
	let { data, form } = $props();
	const c = $derived(data.d.c);
	let action = $state('freigeben');
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
	const open = $derived(c.status !== 'erledigt');
</script>

<svelte:head><title>Fall – Moderation</title></svelte:head>

<p><a href="/admin/moderation">← Moderation</a></p>
<h1>{data.reasons[c.reason] ?? c.reason}</h1>
<p class="muted">{c.source === 'automatisch' ? 'Automatisch markiert' : c.source === 'einspruch' ? 'Einspruch' : 'Meldung'} · Priorität {c.priority} · {fmt(c.created_at)} · Status {c.status}{c.assigned_to ? (c.assigned_to === data.me ? ' · bei dir' : ' · übernommen') : ''}</p>
{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
{#if c.message}<p class="msg"><strong>{c.source === 'einspruch' ? 'Begründung des Einspruchs' : c.source === 'automatisch' ? 'Erkannt' : 'Hinweis der meldenden Person'}:</strong> {c.message}</p>{/if}

<div class="cols">
	<section class="card">
		<h2>Inhalt <span class="muted small">({data.d.content?.status ?? 'nicht mehr vorhanden'})</span></h2>
		{#if data.d.content}
			{#if data.d.content.title}<h3>{data.d.content.title}</h3>{/if}
			{#if data.d.content.stars}<p>{'★'.repeat(data.d.content.stars)}{'☆'.repeat(5 - data.d.content.stars)}</p>{/if}
			{#if data.d.content.image}<img src={data.d.content.image} alt="" class="img" />{/if}
			{#if data.d.content.body}<div class="prose box">{@html renderMarkup(data.d.content.body)}</div>{/if}
			{#if data.d.content.link}<p><a href={data.d.content.link} target="_blank">Im Zusammenhang ansehen</a></p>{/if}
		{:else}<p class="muted">Der Inhalt existiert nicht mehr.</p>{/if}
		<p class="muted small">Vorgeschichte der Person: {data.d.history.removed} ausgeblendete/entfernte Inhalte, {data.d.history.restrictions} Verwarnungen/Einschränkungen.</p>
		{#if data.d.related.length}
			<h3>Weitere Fälle zu diesem Inhalt</h3>
			<ul class="small">{#each data.d.related as r}<li>{fmt(r.created_at)} · {r.source} · {data.reasons[r.reason] ?? r.reason}{r.decision ? ` → ${r.decision}` : ''}{r.message ? ` – ${r.message}` : ''}</li>{/each}</ul>
		{/if}
	</section>

	<section class="card">
		<h2>Entscheidung</h2>
		{#if c.decision}<p><strong>{data.actions[c.decision as keyof typeof data.actions] ?? c.decision}</strong> – {c.decision_reason} <span class="muted small">({fmt(c.decided_at)})</span></p>{/if}
		{#if open}
			{#if !c.assigned_to}<form method="POST" action="?/uebernehmen"><button class="btn small secondary">Fall übernehmen</button></form>{/if}
			<form method="POST" action="?/entscheiden" class="grid">
				<label for="action">Aktion</label>
				<select id="action" name="action" bind:value={action}>
					{#each Object.entries(data.actions) as [k, l]}<option value={k}>{l}</option>{/each}
				</select>
				{#if action === 'stumm'}<label for="days">Dauer (Tage)</label><input id="days" name="days" type="number" min="1" max="90" value="7" />{/if}
				{#if action === 'kennzeichnen'}<label for="note">Sichtbarer Hinweis</label><input id="note" name="note" maxlength="300" />{/if}
				{#if action === 'verschieben'}
					<label for="topic">Thema</label>
					<select id="topic" name="topic"><option value="">kein Thema</option>{#each data.topics as t}<option value={t.key}>{t.name}</option>{/each}</select>
					<label for="region_code">Region</label><RegionPicker id="region_code" name="region_code" />
				{/if}
				<label for="reason">Begründung <span class="muted">(Pflicht, wird der Person mitgeteilt)</span></label>
				<textarea id="reason" name="reason" rows="3" required minlength="3" maxlength="500"></textarea>
				<button class="btn">Entscheiden</button>
				<p class="muted small">Entfernen sichert den Inhalt als Beweis (nur für die Moderation sichtbar). Sperren nur durch Betreiber – sonst eskalieren. Inhalte anderer werden nie inhaltlich verändert.</p>
			</form>
		{/if}
		<form method="POST" action="?/notiz" class="grid">
			<label for="inote">Interne Notiz</label>
			<textarea id="inote" name="note" rows="3">{c.internal_note ?? ''}</textarea>
			<button class="btn small secondary">Notiz speichern</button>
		</form>
	</section>
</div>

<style>
	.msg {
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-left: 5px solid var(--warn);
		border-radius: 0 var(--radius-s) var(--radius-s) 0;
	}
	.cols {
		display: grid;
		gap: var(--sp-4);
	}
	@media (min-width: 1100px) {
		.cols {
			grid-template-columns: 1.3fr 1fr;
		}
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-5);
	}
	.card h2 {
		margin-top: 0;
	}
	.box {
		padding: var(--sp-3);
		background: var(--surface-2);
		border-radius: var(--radius-s);
		max-height: 30rem;
		overflow: auto;
	}
	.img {
		max-width: 100%;
		max-height: 24rem;
		border-radius: var(--radius-s);
	}
	.grid {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.grid label {
		font-weight: 650;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
