<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import NavChooser from '$lib/components/NavChooser.svelte';
	import RouteFacts from '$lib/components/RouteFacts.svelte';
	import { KINDS } from '$lib/places';
	let { data, form } = $props();
	const r = $derived(data.r);
	const fmt = (d: string | Date) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	const RK: Record<string, string> = { hindernis: 'Hindernis', gesperrt: 'Gesperrt' };
	const warnings = $derived(r.reports.filter((x) => x.kind !== 'passt'));
	const ok = $derived(r.reports.filter((x) => x.kind === 'passt').length);
</script>

<svelte:head><title>{r.title} – Kinderwagenrouten</title></svelte:head>

<article class="container page wrap">
	<a class="back" href="/routen"><Icon name="zurueck" size={18} />Kinderwagenrouten</a>
	<h1>{r.title}</h1>
	<p class="muted">{r.regionName ?? ''}{r.origin === 'redaktion' ? ' · von der Redaktion' : ' · von einem Mitglied eingezeichnet'}{ok ? ` · ${ok}× „gut gegangen“` : ''}</p>
	<RouteFacts {r} />

	{#if data.isNew || r.status === 'pruefung'}<Notice kind="info" title="Wartet auf Prüfung">Die Redaktion schaut sich die Route an (Start/Ziel öffentlich? Beschreibung ok?). Bis dahin siehst nur du sie.</Notice>{/if}
	{#if r.status === 'abgelehnt'}<Notice kind="warn" title="Nicht veröffentlicht">{r.reviewNote ?? ''}</Notice>{/if}
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'ok' in form && form.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
	{#each warnings as w}
		<div class="warnbox" role="note"><strong>{RK[w.kind] ?? w.kind}</strong> <span class="muted small">Hinweis eines Mitglieds, ungeprüft · {fmt(w.at)}</span>{#if w.text}<p>{w.text}</p>{/if}</div>
	{/each}

	<div class="mapbox"><FamilyMap mode="mini" tiles={data.tiles} center={r.coords[0]} zoom={14} lines={[{ coords: r.coords }]} label="Verlauf der Route" /></div>
	<div class="acts">
		<NavChooser lat={r.coords[0][1]} lon={r.coords[0][0]} name="Start: {r.title}" />
		<a class="btn small secondary" href="/routen/{r.id}/gpx" download>GPX-Datei</a>
	</div>

	<div class="cols">
		<section class="card">
			<h2>Beschreibung</h2>
			{#if r.description}<p class="desc">{r.description}</p>{:else}<p class="muted">Keine Beschreibung.</p>{/if}
			<dl class="facts">
				{#if r.shade !== null}<div><dt>Schatten</dt><dd>{r.shade ? 'überwiegend' : 'wenig'}</dd></div>{/if}
				{#if r.restSpots}<div><dt>Rasten</dt><dd>{r.restSpots}</dd></div>{/if}
				<div><dt>Stand</dt><dd>{fmt(r.updatedAt)}{r.checkedAt ? ` · geprüft ${fmt(r.checkedAt)}` : ''}</dd></div>
			</dl>
			<p class="muted small">Erfahrungen von Eltern, keine Garantie für Sicherheit oder Barrierefreiheit. Wege, Baustellen und Sperrungen ändern sich.</p>
		</section>
		<section class="card">
			<h2>Am Weg (bis 150 m)</h2>
			{#if r.places.length}
				<ul class="near">{#each r.places as p}<li><a href="/orte/{p.id}">{p.name ?? KINDS[p.kind as keyof typeof KINDS]?.label ?? p.kind}</a> <small>{KINDS[p.kind as keyof typeof KINDS]?.label ?? p.kind} · {p.m} m</small></li>{/each}</ul>
			{:else}<p class="muted">Keine Spielplätze, Toiletten oder Wickelmöglichkeiten aus der Familienkarte in der Nähe.</p>{/if}
		</section>
	</div>

	{#if data.member && r.status === 'aktiv'}
		<section class="card">
			<h2>Selbst gegangen?</h2>
			<form method="POST" action="?/erfahrung" class="rep">
				<select name="kind" required aria-label="Erfahrung"><option value="passt">Gut mit Kinderwagen gegangen</option><option value="hindernis">Hindernis (Baustelle, Stufe …)</option><option value="gesperrt">Weg gesperrt</option></select>
				<input name="text" maxlength="300" placeholder="Was genau? (optional)" aria-label="Was genau?" />
				<button class="btn small">Senden</button>
			</form>
			<p class="muted small">Hindernisse erscheinen sofort als ungeprüfter Hinweis (ohne Namen); die Redaktion prüft sie.</p>
		</section>
	{/if}

	{#if r.editor || r.mine}
		<section class="card">
			<h2>Verwalten</h2>
			{#if r.editor && r.status === 'pruefung'}
				<form method="POST" action="?/pruefen" class="rep">
					<input name="note" maxlength="500" placeholder="Notiz / Grund bei Ablehnung" aria-label="Notiz" />
					<button class="btn small" name="decision" value="ja">Veröffentlichen</button>
					<button class="btn small danger" name="decision" value="nein">Ablehnen</button>
				</form>
				<p class="muted small">Prüfen: Start und Ziel öffentlich (keine Wohnadresse)? Weg plausibel? Keine privaten Angaben?</p>
			{/if}
			{#if r.editor && warnings.length}<form method="POST" action="?/hinweiseErledigt"><button class="btn small secondary">Hinweise erledigt</button></form>{/if}
			<form method="POST" action="?/entfernen" onsubmit={(e) => { if (!confirm('Route entfernen?')) e.preventDefault(); }}><button class="btn small secondary">Route entfernen</button></form>
		</section>
	{/if}
</article>

<style>
	.wrap {
		max-width: 56rem;
		display: grid;
		gap: var(--sp-3);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	h1 {
		margin: 0;
	}
	.muted {
		margin: 0;
	}
	.mapbox {
		height: min(55vh, 26rem);
		border-radius: var(--radius-l);
		overflow: hidden;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
	}
	.cols {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	}
	.card {
		background: var(--surface);
		border-radius: var(--radius-l);
		padding: var(--sp-4) var(--sp-5);
	}
	.card h2 {
		margin: 0 0 var(--sp-2);
		font-size: var(--fs-l);
	}
	.desc {
		white-space: pre-line;
	}
	.facts {
		display: grid;
		gap: var(--sp-1);
	}
	.facts div {
		display: grid;
		grid-template-columns: 6rem 1fr;
	}
	.facts dt {
		color: var(--ink-2);
	}
	.facts dd {
		margin: 0;
	}
	.near {
		margin: 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 4px;
	}
	.near small {
		color: var(--ink-2);
	}
	.warnbox {
		padding: var(--sp-3);
		border-left: 6px solid #d63d31;
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.warnbox p {
		margin: var(--sp-1) 0 0;
	}
	.rep {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.rep input {
		flex: 1 1 12rem;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
