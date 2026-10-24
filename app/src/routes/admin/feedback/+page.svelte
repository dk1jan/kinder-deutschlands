<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { FEEDBACK_KINDS, FEEDBACK_STATUS } from '$lib/feedback';
	let { data, form } = $props();
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
</script>

<svelte:head><title>Feedback – Verwaltung</title></svelte:head>

<h1>Feedback</h1>
<p class="muted">Rückmeldungen aus der Fußzeile. Absender sehen wir nur als Familien-ID. Bei „Erledigt“ und „Verworfen“ bekommt die Person eine Mitteilung – mit deiner Antwort, falls du eine schreibst. Keine privaten Daten in Antworten.</p>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

<form method="GET" class="filter">
	<label>Status
		<select name="status"><option value="">Alle</option>{#each Object.entries(FEEDBACK_STATUS) as [k, l]}<option value={k} selected={data.status === k}>{l}</option>{/each}</select>
	</label>
	<label>Art
		<select name="art"><option value="">Alle</option>{#each Object.entries(FEEDBACK_KINDS) as [k, l]}<option value={k} selected={data.kind === k}>{l}</option>{/each}</select>
	</label>
	<button class="btn small secondary">Filtern</button>
</form>

{#if !data.items.length}
	<p class="muted">Noch nichts da.</p>
{/if}
{#each data.items as f (f.id)}
	<article class="card item">
		<p class="meta">
			<strong>{FEEDBACK_KINDS[f.kind]}</strong>
			<span class="st st-{f.status}">{FEEDBACK_STATUS[f.status]}</span>
			<span class="muted">{fmt(f.createdAt)}{f.from ? ` · Familien-ID ${f.from}` : ' · Konto gelöscht'}{f.page ? ` · Seite ${f.page}` : ''}</span>
		</p>
		<p class="body">{f.body}</p>
		{#if f.reply}<p class="muted">Antwort: {f.reply}</p>{/if}
		<form method="POST" action="?/bearbeiten" class="row">
			<input type="hidden" name="id" value={f.id} />
			<select name="status" aria-label="Status">{#each Object.entries(FEEDBACK_STATUS) as [k, l]}<option value={k} selected={f.status === k}>{l}</option>{/each}</select>
			<input name="reply" maxlength="500" value={f.reply ?? ''} placeholder="Antwort an die Person (optional)" aria-label="Antwort" />
			<button class="btn small">Speichern</button>
		</form>
	</article>
{/each}

<style>
	.filter {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: end;
		margin-block: var(--sp-4);
	}
	.item {
		margin-block: var(--sp-3);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: baseline;
	}
	.body {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.row input[name='reply'] {
		flex: 1 1 14rem;
	}
	.st {
		font-weight: 650;
	}
</style>
