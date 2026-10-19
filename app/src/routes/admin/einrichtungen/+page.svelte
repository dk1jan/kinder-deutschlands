<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { ORG_KINDS } from '$lib/angebote';
	let { data, form } = $props();
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
	const pending = $derived(data.orgs.filter((o) => o.status === 'beantragt'));
	const rest = $derived(data.orgs.filter((o) => o.status !== 'beantragt'));
</script>

<svelte:head><title>Einrichtungen – Verwaltung</title></svelte:head>

<h1>Einrichtungen</h1>
<p class="muted">Verifiziert wird die Zuordnung: Spricht die antragstellende Person wirklich für die Einrichtung? Bitte über einen unabhängigen Weg prüfen (z. B. Rückruf unter der Nummer von der offiziellen Webseite). Die Prüfangaben werden nach der Entscheidung gelöscht.</p>
{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

<h2>Offene Anträge ({pending.length})</h2>
{#each pending as o (o.id)}
	<section class="card">
		<h3>{o.name} <small>{ORG_KINDS[o.kind as keyof typeof ORG_KINDS] ?? o.kind}{o.regionName ? ` · ${o.regionName}` : ''} · {fmt(o.created)}</small></h3>
		<dl>
			{#if o.website}<dt>Webseite</dt><dd><a href={o.website} rel="noopener nofollow" target="_blank">{o.website}</a></dd>{/if}
			{#if o.email}<dt>E-Mail</dt><dd>{o.email}</dd>{/if}
			{#if o.phone}<dt>Telefon</dt><dd>{o.phone}</dd>{/if}
			{#if o.address}<dt>Adresse</dt><dd>{o.address}</dd>{/if}
			<dt>Antrag von</dt><dd>{o.applicant?.name ?? 'Mitglied'} · {o.applicant?.cid ?? ''} · {o.applicant?.email ?? ''}</dd>
			<dt>Funktion</dt><dd>{o.role ?? '–'}</dd>
			<dt>Prüfweg</dt><dd>{o.proof ?? '–'}</dd>
		</dl>
		<form method="POST" action="?/entscheiden" class="dec">
			<input type="hidden" name="id" value={o.id} />
			<input name="note" required minlength="3" maxlength="500" placeholder="Begründung / wie geprüft (Pflicht)" aria-label="Begründung" />
			<button class="btn small" name="decision" value="ja">Verifizieren</button>
			<button class="btn small danger" name="decision" value="nein">Ablehnen</button>
		</form>
	</section>
{:else}
	<p class="muted">Keine offenen Anträge.</p>
{/each}

<h2>Alle Einrichtungen</h2>
<div class="scroll">
	<table class="data">
		<thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col">Team</th><th scope="col">Seit</th><th scope="col">Aktion</th></tr></thead>
		<tbody>
			{#each rest as o (o.id)}
				<tr>
					<td>{#if o.status === 'verifiziert'}<a href="/einrichtungen/{o.slug}">{o.name}</a>{:else}{o.name}{/if}{#if o.note}<br /><small class="muted">{o.note}</small>{/if}</td>
					<td>{o.status}</td><td>{o.members}</td><td>{fmt(o.verified ?? o.created)}</td>
					<td>
						{#if o.status === 'verifiziert' || o.status === 'pausiert'}
							<form method="POST" action="?/status" class="dec">
								<input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value={o.status === 'verifiziert' ? 'pausiert' : 'verifiziert'} />
								<input name="note" maxlength="500" placeholder="Grund" aria-label="Grund" />
								<button class="btn small secondary">{o.status === 'verifiziert' ? 'Pausieren' : 'Reaktivieren'}</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}<tr><td colspan="5" class="muted">Noch keine.</td></tr>{/each}
		</tbody>
	</table>
</div>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-3);
	}
	h3 small {
		font-weight: 400;
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	dl {
		display: grid;
		grid-template-columns: 8rem 1fr;
		gap: var(--sp-1) var(--sp-3);
	}
	dt {
		color: var(--ink-2);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.dec {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}
	.dec input {
		flex: 1 1 14rem;
	}
	.scroll {
		overflow-x: auto;
	}
</style>
