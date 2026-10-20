<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { NOTICE_KINDS } from '$lib/angebote';
	let { data, form } = $props();
	const KINDS = ['sperrung', 'absage', 'frist', 'info', 'neu'] as const;
	const STATUS: Record<string, string> = { pruefung: 'wird geprüft', aktiv: 'sichtbar', abgelehnt: 'nicht veröffentlicht', archiviert: 'beendet' };
	const v = (k: string) => (form && 'values' in form && form.values ? (form.values as Record<string, string>)[k] ?? '' : '');
	const fmt = (d: string | Date) => new Date(d).toLocaleDateString('de-DE');
</script>

<svelte:head><title>Hinweis vorschlagen – Kinder Deutschlands</title></svelte:head>

<div class="container page narrow">
	<p><a href="/hinweise">← Hinweise & Fristen</a></p>
	<h1>Hinweis vorschlagen</h1>
	<p class="lead">Etwas, das andere Familien in deiner Gegend wissen sollten – z. B. Baustelle vor der Kita, Kurs fällt aus, Anmeldefrist läuft ab. Die Redaktion schaut kurz drüber, dann erscheint der Hinweis als „Hinweis eines Mitglieds“. Dein Name wird nicht gezeigt.</p>
	<p class="muted small">Für Spielplätze und Orte auf der Karte (defekt, gesperrt) bitte direkt am Ort „Melden“ nutzen.</p>
	{#if form && 'ok' in form}<Notice kind="ok" title="Danke!">Dein Vorschlag ist bei der Redaktion. Du bekommst eine Mitteilung, sobald er sichtbar ist.</Notice>{/if}
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}
		<form method="POST" action="?/vorschlagen" class="card f">
			<label>Art<select name="kind" required>{#each KINDS as k}<option value={k} selected={v('kind') === k}>{NOTICE_KINDS[k]}</option>{/each}</select></label>
			<label>Worum geht es?<input name="title" required minlength="5" maxlength="200" value={v('title')} placeholder="z. B. Gehweg vor der Kita Am Wall bis Freitag gesperrt" /></label>
			<label>Details (optional)<textarea name="body" rows="4" maxlength="1200">{v('body')}</textarea></label>
			<div class="field"><label for="hr">Gegend</label><RegionPicker id="hr" name="region_code" code={data.region?.code ?? ''} label={data.region?.name ?? ''} /></div>
			<label>Quelle, falls vorhanden (Link)<input type="url" name="source_url" maxlength="500" value={v('source_url')} /></label>
			<label>Anzeigen für<select name="days">{#each [3, 7, 14, 30] as d}<option value={d} selected={(v('days') || '14') === String(d)}>{d} Tage</option>{/each}</select></label>
			<p class="muted small">Bitte keine Namen, Telefonnummern, Adressen von Privatpersonen. Keine Gerüchte – nur, was du selbst gesehen hast oder belegen kannst.</p>
			<div><button class="btn">Vorschlagen</button></div>
		</form>
	{/key}

	{#if data.mine.length}
		<h2>Deine Vorschläge</h2>
		<ul class="mine">
			{#each data.mine as m (m.id)}
				<li>
					<div><strong>{m.title}</strong><small>{NOTICE_KINDS[m.kind as keyof typeof NOTICE_KINDS] ?? m.kind} · {m.regionName ?? '–'} · {fmt(m.at)} · {STATUS[m.status] ?? m.status}{m.note ? ` – ${m.note}` : ''}</small></div>
					{#if m.status === 'aktiv' || m.status === 'pruefung'}
						<form method="POST" action="?/beenden"><input type="hidden" name="id" value={m.id} /><button class="btn small secondary">{m.status === 'aktiv' ? 'Beenden' : 'Zurückziehen'}</button></form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.lead {
		color: var(--ink-2);
	}
	.f {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		margin: var(--sp-4) 0;
	}
	.f label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.mine {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.mine li {
		display: flex;
		gap: var(--sp-3);
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
	}
	.mine li div {
		display: grid;
	}
	.mine small {
		color: var(--ink-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
