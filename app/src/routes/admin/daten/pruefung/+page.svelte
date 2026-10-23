<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { KINDS, REPORT_KINDS, FEATURES, type Kind } from '$lib/places';
	let { data, form } = $props();
	const q = $derived(data.q);
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
	const feats = (f: Record<string, unknown>) => Object.entries(f ?? {}).filter(([, v]) => v === true).map(([k]) => FEATURES[k]?.label ?? k).join(', ');
</script>

<svelte:head><title>Prüffälle – Datenzentrale</title></svelte:head>

<p><a href="/admin/daten">← Daten und Orte</a></p>
<h1>Prüffälle</h1>
{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}
{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

<section id="vorschlaege" aria-labelledby="v-h">
	<h2 id="v-h">Vorschläge von Mitgliedern ({q.suggestions.length})</h2>
	{#each q.suggestions as s}
		<article class="case">
			<header><strong><a href="/orte/{s.id}" target="_blank">{s.display}</a></strong> <span class="muted">· {KINDS[s.kind as Kind]?.label} · {fmt(s.created_at)}</span></header>
			{#if s.description}<p>{s.description}</p>{/if}
			{#if feats(s.features)}<p class="muted small">Angaben: {feats(s.features)}</p>{/if}
			{#if s.nearby}<p class="warnline">⚠ {s.nearby} gleichartige{s.nearby === 1 ? 'r' : ''} Ort{s.nearby === 1 ? '' : 'e'} im Umkreis von 80 m – mögliche Dublette.</p>{/if}
			<p class="small"><a href="/karte?lon={s.lon}&lat={s.lat}&z=17" target="_blank">Auf der Karte prüfen</a></p>
			<form method="POST" action="?/vorschlag" class="row">
				<input type="hidden" name="id" value={s.id} />
				<label class="f"><span>Nachricht an den Einsender <small class="muted">(kommt bei ihm unter Mitteilungen, bei Freigabe und Ablehnung)</small></span>
					<input name="to_sender" maxlength="200" value="Danke für deinen Vorschlag – wir haben ihn bearbeitet." /></label>
				<label class="f"><span>Interne Notiz <small class="muted">(nur Verwaltung)</small></span>
					<input name="note" maxlength="300" placeholder="optional" /></label>
				<button class="btn small" name="decision" value="ja">Freigeben</button>
				<button class="btn small secondary" name="decision" value="nein">Ablehnen</button>
			</form>
		</article>
	{:else}
		<p class="muted">Keine offenen Vorschläge.</p>
	{/each}
</section>

<section id="meldungen" aria-labelledby="m-h">
	<h2 id="m-h">Meldungen ({q.reports.length})</h2>
	{#each q.reports as r}
		<article class="case">
			<header><strong>{REPORT_KINDS[r.kind] ?? r.kind}</strong> · <a href="/admin/daten/ort/{r.place_id}">{r.place_display}</a> <span class="muted">· {fmt(r.created_at)}</span></header>
			{#if r.message}<blockquote>{r.message}</blockquote>{/if}
			{#if r.notice_id}<p class="muted small">Wird am Ort als unbestätigter Hinweis angezeigt.</p>{/if}
			<form method="POST" action="?/meldung" class="grid">
				<input type="hidden" name="id" value={r.id} />
				{#if r.kind === 'defekt' || r.kind === 'gesperrt'}
					<fieldset>
						<legend>Hinweis am Ort</legend>
						<label class="check"><input type="radio" name="notice" value="bestaetigen" /><span>von der Redaktion bestätigen</span></label>
						<label class="check"><input type="radio" name="notice" value="amtlich" /><span>amtlich bestätigt (mit Quelle)</span></label>
						<label class="check"><input type="radio" name="notice" value="beenden" /><span>Hinweis beenden</span></label>
					</fieldset>
					<input name="source_url" placeholder="Link zur amtlichen Meldung (optional)" aria-label="Link zur amtlichen Meldung" />
				{/if}
				{#if r.kind === 'defekt' || r.kind === 'gesperrt'}
					<label class="f"><span>Öffentlicher Hinweis am Ort <small class="muted">(für alle sichtbar, nur zusammen mit „bestätigen“ oder „amtlich“)</small></span>
						<input name="text" maxlength="500" /></label>
				{/if}
				<label class="f"><span>Nachricht an den Melder <small class="muted">(kommt bei ihm unter Mitteilungen, bei Erledigt und Ablehnen)</small></span>
					<input name="to_reporter" maxlength="200" value="Danke für deine Meldung – wir haben sie bearbeitet." /></label>
				<label class="f"><span>Interne Notiz <small class="muted">(nur Verwaltung)</small></span>
					<input name="note" maxlength="300" placeholder="optional" /></label>
				<div class="row">
					<button class="btn small" name="decision" value="erledigt">Erledigt</button>
					<button class="btn small secondary" name="decision" value="abgelehnt">Ablehnen</button>
				</div>
			</form>
		</article>
	{:else}
		<p class="muted">Keine offenen Meldungen.</p>
	{/each}
</section>

<section id="dubletten" aria-labelledby="d-h">
	<h2 id="d-h">Mögliche Dubletten ({q.duplicates.length})</h2>
	<p class="muted">Gleiche Art, höchstens 30 m auseinander. Beim Zusammenführen ziehen Quellen, Merklisten und Meldungen mit um; nichts wird gelöscht.</p>
	{#each q.duplicates as d}
		<article class="case">
			<header>{Math.round(d.distance_m)} m auseinander · {KINDS[d.a_kind as Kind]?.label}</header>
			<div class="pair">
				<div><a href="/admin/daten/ort/{d.place_a}">{d.a_display}</a><br /><small class="muted">{d.a_src ?? 'von Mitglied'}</small></div>
				<div><a href="/admin/daten/ort/{d.place_b}">{d.b_display}</a><br /><small class="muted">{d.b_src ?? 'von Mitglied'}</small></div>
			</div>
			<form method="POST" action="?/dublette" class="row">
				<input type="hidden" name="a" value={d.place_a} /><input type="hidden" name="b" value={d.place_b} />
				<button class="btn small" name="decision" value="a">Links behalten</button>
				<button class="btn small" name="decision" value="b">Rechts behalten</button>
				<button class="btn small secondary" name="decision" value="verschieden">Verschiedene Orte</button>
			</form>
		</article>
	{:else}
		<p class="muted">Keine offenen Dubletten.</p>
	{/each}
</section>

<style>
	section {
		margin-bottom: var(--sp-7);
		max-width: 60rem;
	}
	.case {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-3);
	}
	.case p {
		margin: var(--sp-2) 0;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		align-items: center;
		margin-top: var(--sp-2);
	}
	.row input {
		flex: 1 1 14rem;
	}
	.f {
		display: grid;
		gap: var(--sp-1);
		flex: 1 1 100%;
	}
	.f span {
		font-weight: 700;
		font-size: var(--fs-s, 0.9rem);
	}
	.f small {
		font-weight: 400;
	}
	.grid {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1) var(--sp-4);
	}
	legend {
		font-weight: 700;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 40px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin: var(--sp-2) 0;
	}
	blockquote {
		margin: var(--sp-2) 0;
		padding: var(--sp-2) var(--sp-3);
		border-left: 4px solid var(--line);
		background: var(--surface-2);
	}
	.warnline {
		color: var(--warn);
		font-weight: 650;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
