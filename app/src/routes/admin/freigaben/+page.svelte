<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }) : '–');
	const ST: Record<string, string> = { offen: 'wartet', ausgefuehrt: 'ausgeführt', abgelehnt: 'abgelehnt', abgelaufen: 'abgelaufen', zurueckgezogen: 'zurückgezogen', fehler: 'Fehler' };
	const open = $derived(data.rows.filter((r) => r.status === 'offen'));
	const done = $derived(data.rows.filter((r) => r.status !== 'offen'));
</script>

<svelte:head><title>Freigaben – Verwaltung</title></svelte:head>

<h1>Zweite Freigabe</h1>
<p class="muted">Kritische Aktionen – Betreiber- oder Technikrolle vergeben/entziehen, Konto sperren – führt erst eine zweite berechtigte Person aus. Anträge verfallen nach 72 Stunden. Gibt es nur eine berechtigte Person, wird sofort ausgeführt und das im Protokoll vermerkt.</p>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

<h2>Offen ({open.length})</h2>
{#each open as r (r.id)}
	<section class="card">
		<h3>{r.summary}</h3>
		<p><strong>Begründung:</strong> {r.reason}</p>
		<p class="muted small">Beantragt von {r.requestedBy} am {fmt(r.requestedAt)} · verfällt {fmt(r.expiresAt)}</p>
		{#if r.mine}
			<form method="POST" action="?/zurueckziehen"><input type="hidden" name="id" value={r.id} /><button class="btn small secondary">Antrag zurückziehen</button></form>
			<p class="muted small">Eine andere berechtigte Person muss zustimmen.</p>
		{:else}
			<form method="POST" action="?/entscheiden" class="dec">
				<input type="hidden" name="id" value={r.id} />
				<input name="note" maxlength="500" placeholder="Notiz (optional)" aria-label="Notiz" />
				<button class="btn small" name="decision" value="ja">Freigeben und ausführen</button>
				<button class="btn small danger" name="decision" value="nein">Ablehnen</button>
			</form>
		{/if}
	</section>
{:else}
	<p class="muted">Nichts offen.</p>
{/each}

<h2>Verlauf</h2>
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
	<table class="data">
		<thead><tr><th scope="col">Aktion</th><th scope="col">Status</th><th scope="col">Beantragt</th><th scope="col">Entschieden</th></tr></thead>
		<tbody>
			{#each done as r (r.id)}
				<tr><td>{r.summary}<br /><small class="muted">{r.reason}</small></td><td>{ST[r.status] ?? r.status}{r.note ? ` – ${r.note}` : ''}</td><td>{r.requestedBy}<br /><small>{fmt(r.requestedAt)}</small></td><td>{r.decidedBy ?? '–'}<br /><small>{fmt(r.decidedAt)}</small></td></tr>
			{:else}<tr><td colspan="4" class="muted">Noch keine.</td></tr>{/each}
		</tbody>
	</table>
</div>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-3);
		border-left: 6px solid var(--yellow);
	}
	h3 {
		margin: 0 0 var(--sp-2);
	}
	.dec {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.dec input {
		flex: 1 1 14rem;
	}
	.scroll {
		overflow-x: auto;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
