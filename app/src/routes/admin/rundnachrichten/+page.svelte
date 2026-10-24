<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { LAENDER } from '$lib/laender';
	let { data, form } = $props();
	type V = { title: string; body: string; link: string | null; all: boolean; regions: string[]; push: boolean };
	const v = $derived((form && 'values' in form && form.values ? form.values : null) as V | null);
	// svelte-ignore state_referenced_locally
	let ziel = $state<'alle' | 'regionen'>(v ? (v.all ? 'alle' : 'regionen') : data.rights.all ? 'alle' : 'regionen');
	const fmt = (d: string | Date) => new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
	const fz = (n: number) => (n === 0 ? '0' : n < 5 ? '< 5' : n.toLocaleString('de-DE'));
</script>

<svelte:head><title>Rundnachrichten – Verwaltung</title></svelte:head>

<h1>Rundnachrichten</h1>
<p class="muted">
	Eine Nachricht an alle Mitglieder oder gezielt an Bundesländer, Kreise, Städte oder Stadtteile – zum Beispiel „Die Karte hakt gerade, wir kümmern uns“. Sie kommt als Mitteilung in die Glocke.
	Push geht nur an Mitglieder, die „Wichtiges sofort“ eingeschaltet haben. Erreicht werden Mitglieder mit eingetragener Wohnregion in der gewählten Gegend; „Ganz Deutschland“ erreicht alle.
</p>
{#if !data.rights.all}
	<Notice kind="info">Du darfst Rundnachrichten schicken an: {data.rights.regions.map((r) => r.name).join(', ') || '–'} (jeweils mit allem darunter).</Notice>
{/if}
{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}
{#if form && 'preview' in form && form.preview}<Notice kind="info">{form.preview}</Notice>{/if}
{#if form && 'ok' in form && form.ok}<Notice kind="ok" title="Verschickt">{form.ok}</Notice>{/if}

<section class="card">
	{#key form}
		<form method="POST" action="?/senden" class="f">
			<label>Titel<input name="title" required minlength="3" maxlength="120" value={v?.title ?? ''} placeholder="z. B. Karte gerade gestört" /></label>
			<label>Text<textarea name="body" rows="5" required minlength="3" maxlength="2000" placeholder="Was ist los, was sollen Mitglieder tun?">{v?.body ?? ''}</textarea></label>
			<label>Link (optional)<input name="link" maxlength="500" value={v?.link ?? ''} placeholder="/karte oder https://…" /></label>

			<fieldset class="ziel">
				<legend>An wen?</legend>
				{#if data.rights.all}
					<label class="check"><input type="radio" name="ziel" value="alle" bind:group={ziel} /> Ganz Deutschland (alle Mitglieder)</label>
				{/if}
				<label class="check"><input type="radio" name="ziel" value="regionen" bind:group={ziel} /> Bestimmte Regionen</label>
				{#if ziel === 'regionen'}
					<div class="regs">
						{#if data.rights.all}
							<p class="muted hint-s">Bundesländer:</p>
							<div class="pills">
								{#each LAENDER as l}<label class="pill"><input type="checkbox" name="laender" value={l.code} checked={v?.regions?.includes(l.code)} /> {l.name}</label>{/each}
							</div>
						{:else}
							<div class="pills">
								{#each data.rights.regions as r}<label class="pill"><input type="checkbox" name="laender" value={r.code} checked={v?.regions?.includes(r.code)} /> {r.name}</label>{/each}
							</div>
						{/if}
						<p class="muted hint-s">Dazu Städte, Kreise oder Stadtteile (z. B. Kiel, Elmshorn, Bremen):</p>
						<div class="pick"><RegionPicker id="r1" name="region" /><RegionPicker id="r2" name="region" /><RegionPicker id="r3" name="region" /></div>
					</div>
				{/if}
			</fieldset>

			<label class="check"><input type="checkbox" name="push" checked={v?.push ?? false} /> Zusätzlich als Push (nur an Mitglieder mit „Wichtiges sofort“) – sparsam einsetzen</label>
			<label class="check"><input type="checkbox" name="bestaetigt" /> Ich habe Text und Empfänger geprüft – so verschicken.</label>
			<div class="row">
				<button class="btn small secondary" formaction="?/vorschau" formnovalidate>Empfänger zählen</button>
				<button class="btn small">Verschicken</button>
			</div>
		</form>
	{/key}
</section>

<h2>Verschickt</h2>
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
	<table class="data">
		<thead><tr><th scope="col">Wann</th><th scope="col">Titel</th><th scope="col">An</th><th scope="col">Empfänger</th><th scope="col">Geöffnet</th><th scope="col">Von</th></tr></thead>
		<tbody>
			{#each data.rows as r (r.id)}
				<tr>
					<td>{fmt(r.createdAt)}</td>
					<td><a href="/rundnachricht/{r.id}">{r.title}</a>{r.push ? ' · Push' : ''}</td>
					<td>{r.target}</td>
					<td>{fz(r.recipients)}</td>
					<td>{fz(r.opened)}</td>
					<td>{r.by}</td>
				</tr>
			{:else}<tr><td colspan="6" class="muted">Noch keine Rundnachricht verschickt.</td></tr>{/each}
		</tbody>
	</table>
</div>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-5);
	}
	.f {
		display: grid;
		gap: var(--sp-3);
	}
	.f > label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.f .check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		font-weight: 400;
	}
	.ziel {
		border: 1.5px solid var(--line);
		border-radius: var(--radius-s);
		padding: var(--sp-3);
		display: grid;
		gap: var(--sp-2);
	}
	legend {
		font-weight: 700;
		padding: 0 var(--sp-1);
	}
	.regs {
		display: grid;
		gap: var(--sp-2);
		margin-top: var(--sp-1);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
	}
	.pick {
		display: grid;
		gap: var(--sp-2);
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.hint-s {
		font-size: var(--fs-s);
		margin: 0;
	}
	.scroll {
		overflow-x: auto;
	}
</style>
