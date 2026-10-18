<script lang="ts">
	let { data } = $props();
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
	const CONSENT = { nicht_noetig: '–', angefragt: 'wartet auf Zustimmung', erteilt: 'zugestimmt', abgelehnt: 'abgelehnt' } as Record<string, string>;
</script>

<svelte:head><title>Wissen – Verwaltung</title></svelte:head>

<h1>Wissenseinträge</h1>
<p class="muted">Geprüfte Einträge mit Quellen. Aus Beiträgen nur mit Zustimmung (Knopf „Als Wissen aufbereiten“ am Beitrag), nie aus Gruppen.</p>
<p><a class="btn small" href="/admin/wissen/neu">Neuer Eintrag</a></p>
<div class="scroll">
	<table class="data">
		<thead><tr><th scope="col">Titel</th><th scope="col">Thema</th><th scope="col">Status</th><th scope="col">Sichtbar</th><th scope="col">Zustimmung</th><th scope="col">Geprüft</th></tr></thead>
		<tbody>
			{#each data.rows as r}
				<tr><td><a href="/admin/wissen/{r.slug}">{r.title}</a></td><td>{r.topic ?? '–'}</td><td>{r.status}</td><td>{r.visibility}</td><td>{CONSENT[r.consent]}</td><td>{fmt(r.reviewed_at)}</td></tr>
			{:else}<tr><td colspan="6" class="muted">Noch keine Einträge.</td></tr>{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		overflow-x: auto;
	}
</style>
