<script lang="ts">
	let { data } = $props();
	const TYPE = { post: 'Beitrag', comment: 'Antwort', media: 'Bild', review: 'Bewertung', user: 'Konto', group: 'Gruppe', chat: 'Chat', event: 'Termin', offer: 'Angebot', org: 'Einrichtung' } as Record<string, string>;
	const SRC = { meldung: 'Meldung', automatisch: 'Automatisch', einspruch: 'Einspruch' } as Record<string, string>;
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
</script>

<svelte:head><title>Moderation – Verwaltung</title></svelte:head>

<h1>Moderation</h1>
<p class="muted">Gemeldete und automatisch markierte Inhalte aus deiner Zuständigkeit. Automatische Markierungen sind Hinweise, keine Urteile – Fehlalarme kommen vor.</p>

<section class="figures">
	<div><span class="n">{data.stats.offen}</span><span class="l">offen</span></div>
	<div><span class="n">{data.stats.in_arbeit}</span><span class="l">in Arbeit</span></div>
	<div><span class="n">{data.stats.eskaliert}</span><span class="l">eskaliert</span></div>
	<div><span class="n">{data.stats.erledigt7}</span><span class="l">erledigt (7 Tage)</span></div>
	<div><span class="n">{data.stats.median_h} h</span><span class="l">mittlere Bearbeitungszeit (30 Tage)</span></div>
</section>

<form method="GET" class="filters">
	<select name="status" aria-label="Status"><option value="">Offen + in Arbeit + eskaliert</option>{#each ['offen', 'in_arbeit', 'eskaliert', 'erledigt'] as s}<option value={s} selected={data.filter.status === s}>{s}</option>{/each}</select>
	<select name="typ" aria-label="Inhaltstyp"><option value="">Alle Typen</option>{#each Object.entries(TYPE) as [k, l]}<option value={k} selected={data.filter.typ === k}>{l}</option>{/each}</select>
	<select name="grund" aria-label="Grund"><option value="">Alle Gründe</option>{#each Object.entries(data.reasons) as [k, l]}<option value={k} selected={data.filter.grund === k}>{l}</option>{/each}</select>
	<select name="prio" aria-label="Priorität"><option value="">Alle Prioritäten</option><option value="1" selected={data.filter.prio === '1'}>1 – dringend</option><option value="2" selected={data.filter.prio === '2'}>2</option><option value="3" selected={data.filter.prio === '3'}>3</option></select>
	<label class="check"><input type="checkbox" name="meine" checked={'meine' in data.filter} /><span>nur meine</span></label>
	<button class="btn small">Filtern</button>
</form>

{#if data.cases.length}
	<div class="scroll">
		<table class="data">
			<thead><tr><th scope="col">Prio</th><th scope="col">Grund</th><th scope="col">Inhalt</th><th scope="col">Herkunft</th><th scope="col">Bereich</th><th scope="col">Eingang</th><th scope="col">Status</th></tr></thead>
			<tbody>
				{#each data.cases as c}
					<tr class="p{c.priority}">
						<td><span class="prio">{c.priority === 1 ? '! 1' : c.priority}</span></td>
						<td><a href="/admin/moderation/{c.id}"><strong>{c.reasonLabel}</strong></a>{#if c.preview}<br /><span class="pv">„{c.preview}“</span>{/if}{#if c.message}<br /><small class="muted">{c.message.slice(0, 80)}</small>{/if}</td>
						<td>{TYPE[c.targetType] ?? c.targetType}{c.reports > 1 ? ` · ${c.reports}×` : ''}</td>
						<td>{SRC[c.source]}</td>
						<td>{[c.group ? '🔒 ' + c.group : null, c.topic, c.region].filter(Boolean).join(' · ') || '–'}</td>
						<td>{fmt(c.createdAt)}</td>
						<td>{c.status}{c.assigned ? ` (${c.assigned})` : ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{:else}
	<p class="muted">Keine Fälle in deiner Zuständigkeit. 🎉</p>
{/if}

<style>
	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: var(--sp-3);
		margin: var(--sp-4) 0;
	}
	.figures div {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
	}
	.n {
		font-family: var(--font-display);
		font-size: var(--fs-xl);
		font-weight: 700;
	}
	.l {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin-bottom: var(--sp-4);
	}
	.filters select {
		width: auto;
	}
	.check {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.scroll {
		overflow-x: auto;
	}
	.prio {
		font-weight: 800;
	}
	tr.p1 .prio {
		color: var(--danger);
	}
	.pv {
		font-size: var(--fs-s);
	}
</style>
