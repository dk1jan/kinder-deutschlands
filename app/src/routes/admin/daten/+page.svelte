<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Notice from '$lib/components/Notice.svelte';
	import { KINDS, type Kind } from '$lib/places';
	let { data, form } = $props();
	const o = $derived(data.o);
	const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
	const mb = (b: number) => `${(b / 1024 ** 2).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`;
	const kindRows = $derived.by(() => {
		const m = new Map<string, Record<string, number>>();
		for (const r of o.kinds) {
			if (!m.has(r.kind)) m.set(r.kind, {});
			m.get(r.kind)![r.status] = r.n;
		}
		return [...m.entries()].sort((a, b) => (b[1].aktiv ?? 0) - (a[1].aktiv ?? 0));
	});
	const statusOf = (s: (typeof o.sources)[number]) =>
		o.running.includes(s.key) ? { t: 'läuft', c: 'run' } : s.paused ? { t: 'pausiert', c: 'warn' } : s.last_error ? { t: 'Fehler', c: 'error' } : s.last_success_at ? { t: 'in Ordnung', c: 'ok' } : { t: 'noch nicht abgerufen', c: 'warn' };
	const countsText = (c: Record<string, number> | null | undefined) =>
		c ? Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${k} ${Number(v).toLocaleString('de-DE')}`).join(' · ') : '';
	onMount(() => {
		const t = setInterval(() => {
			if (o.running.length) invalidateAll();
		}, 8000);
		return () => clearInterval(t);
	});
</script>

<svelte:head><title>Daten und Orte – Verwaltung</title></svelte:head>

<h1>Daten und Orte</h1>
<p class="muted">Quellen, Abrufe und Prüffälle. Abrufe laufen automatisch nach Zeitplan; hier lassen sie sich sofort starten oder pausieren.</p>

{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

<section class="figures" aria-label="Prüffälle">
	<a href="/admin/daten/pruefung#vorschlaege"><span class="n">{o.pending.vorschlaege}</span><span class="l">Vorschläge von Mitgliedern</span></a>
	<a href="/admin/daten/pruefung#meldungen"><span class="n">{o.pending.meldungen}</span><span class="l">offene Meldungen</span></a>
	<a href="/admin/daten/pruefung#dubletten"><span class="n">{o.pending.dubletten}</span><span class="l">mögliche Dubletten</span></a>
	<div><span class="n">{o.pending.vorschau}</span><span class="l">Abrufe warten auf Freigabe</span></div>
</section>

<section aria-labelledby="quellen">
	<h2 id="quellen">Quellen</h2>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
		<table class="data">
			<thead><tr><th scope="col">Quelle</th><th scope="col">Zustand</th><th scope="col">Bestand</th><th scope="col">Letzter Abruf</th><th scope="col">Nächster</th><th scope="col"><span class="visually-hidden">Aktionen</span></th></tr></thead>
			<tbody>
				{#each o.sources as s}
					{@const st = statusOf(s)}
					<tr>
						<td><a href="/admin/daten/quelle/{s.key}"><strong>{s.name}</strong></a><br /><small class="muted">{s.operator} · {s.license}</small></td>
						<td><span class="st {st.c}">{st.t}</span>{#if s.last_error}<br /><small class="err">{s.last_error}</small>{/if}</td>
						<td>{s.kind === 'orte' ? Number(s.live).toLocaleString('de-DE') : '–'}</td>
						<td>
							{fmt(s.last_run?.started_at ?? null)}
							{#if s.last_run}<br /><small class="muted">{s.last_run.status === 'vorschau' ? 'wartet auf Freigabe · ' : ''}{countsText(s.last_run.counts)}</small>{/if}
							{#if s.last_run?.status === 'vorschau'}<br /><a href="/admin/daten/lauf/{s.last_run.id}">Vorschau prüfen</a>{/if}
						</td>
						<td>{s.paused ? '–' : fmt(s.next_run_at)}</td>
						<td class="act">
							<form method="POST" action="?/starten"><input type="hidden" name="key" value={s.key} /><button class="btn small" disabled={o.running.length > 0}>Jetzt abrufen</button></form>
							<form method="POST" action="?/pause"><input type="hidden" name="key" value={s.key} /><input type="hidden" name="paused" value={s.paused ? '0' : '1'} /><button class="btn small secondary">{s.paused ? 'Fortsetzen' : 'Pausieren'}</button></form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<div class="two">
	<section aria-labelledby="bestand">
		<h2 id="bestand">Bestand Orte</h2>
		<table class="data">
			<thead><tr><th scope="col">Art</th><th scope="col">sichtbar</th><th scope="col">Prüfung</th><th scope="col">archiviert</th></tr></thead>
			<tbody>
				{#each kindRows as [k, c]}
					<tr><td>{KINDS[k as Kind]?.plural ?? k}</td><td>{(c.aktiv ?? 0).toLocaleString('de-DE')}</td><td>{c.pruefung ?? 0}</td><td>{c.archiviert ?? 0}</td></tr>
				{:else}
					<tr><td colspan="4" class="muted">Noch keine Orte – der erste Abruf läuft nach dem Start automatisch.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
	<section aria-labelledby="karte">
		<h2 id="karte">Kartenhintergrund und Regionen</h2>
		{#if o.tiles?.present}
			<p>Build <strong>{o.tiles.build}</strong> · {mb(o.tiles.bytes)} · bis Zoom {o.tiles.maxzoom}<br /><small class="muted">Gebiet {o.tiles.bbox} · geladen {fmt(o.tiles.updated_at)}</small></p>
		{:else}
			<p class="muted">Noch keine eigenen Kartenkacheln. Sie werden automatisch geladen (Quelle „Kartenhintergrund“).</p>
		{/if}
		<table class="data">
			<thead><tr><th scope="col">Ebene</th><th scope="col">Anzahl</th><th scope="col">mit Grenze</th></tr></thead>
			<tbody>
				{#each o.regions as r}<tr><td>{r.level}</td><td>{r.n}</td><td>{r.mit_geom}</td></tr>{/each}
			</tbody>
		</table>
	</section>
</div>

<style>
	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: var(--sp-3);
		margin: var(--sp-5) 0 var(--sp-6);
	}
	.figures > * {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		display: grid;
		gap: var(--sp-1);
		color: var(--ink);
		text-decoration: none;
	}
	.figures a:hover {
		box-shadow: inset 0 -3px 0 var(--yellow);
	}
	.n {
		font-family: var(--font-display);
		font-size: var(--fs-2xl);
		font-weight: 700;
		line-height: 1;
	}
	.l {
		color: var(--ink-2);
		font-size: var(--fs-s);
	}
	.scroll {
		overflow-x: auto;
	}
	.st {
		font-weight: 700;
	}
	.st.ok {
		color: var(--ok);
	}
	.st.ok::before {
		content: '✓ ';
	}
	.st.warn {
		color: var(--warn);
	}
	.st.error,
	.err {
		color: var(--danger);
	}
	.st.error::before {
		content: '! ';
	}
	.st.run {
		color: var(--link);
	}
	.st.run::before {
		content: '↻ ';
	}
	.act {
		display: flex;
		gap: var(--sp-1);
		flex-wrap: wrap;
	}
	.two {
		display: grid;
		gap: var(--sp-5);
		margin-top: var(--sp-6);
	}
	@media (min-width: 1100px) {
		.two {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
