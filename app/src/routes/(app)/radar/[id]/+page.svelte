<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RadarForm from '$lib/components/angebote/RadarForm.svelte';
	import { when } from '$lib/termin';

	let { data, form } = $props();
	const d = (x: string) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
	const groups = $derived([
		['Fristen', data.items.filter((i) => i.kind === 'notice' && i.deadline).sort((a, b) => a.deadline!.localeCompare(b.deadline!))],
		['Veranstaltungen', data.items.filter((i) => i.kind === 'event')],
		['Freie Plätze & Kurse', data.items.filter((i) => i.kind === 'offer')],
		['Hinweise', data.items.filter((i) => i.kind === 'notice' && !i.deadline)]
	] as const);
</script>

<svelte:head><title>{data.profile.name} – Familienradar</title></svelte:head>

<div class="container page wrap">
	<a class="back" href="/radar"><Icon name="zurueck" size={18} />Familienradar</a>
	<h1>{data.profile.name}</h1>
	{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
	{#if data.profile.paused}<Notice kind="info" title="Pausiert">Es werden keine Zusammenfassungen verschickt. Die Übersicht hier bleibt.</Notice>{/if}

	<div class="acts">
		<form method="POST" action="?/pause"><input type="hidden" name="paused" value={data.profile.paused ? '0' : '1'} /><button class="btn small secondary">{data.profile.paused ? 'Fortsetzen' : 'Pausieren'}</button></form>
		<form method="POST" action="?/loeschen" onsubmit={(e) => { if (!confirm('Profil löschen?')) e.preventDefault(); }}><button class="btn small secondary">Löschen</button></form>
	</div>

	<h2>Die nächsten 30 Tage</h2>
	{#if !data.items.length}
		<p class="empty">Für dieses Profil gibt es gerade nichts. Neues erscheint hier, sobald Einrichtungen, Redaktion oder Quellen etwas eintragen.</p>
	{/if}
	{#each groups as [title, list]}
		{#if list.length}
			<section>
				<h3>{title}</h3>
				<ul class="items">
					{#each list as i (i.kind + i.id)}
						<li class:new={i.isNew}>
							<a href={i.url}>{i.title}</a>{#if i.isNew}<span class="tag">neu</span>{/if}
							<small>{#if i.when}{when(i.when, null, false)} · {/if}{#if i.deadline}Frist {d(i.deadline)} · {/if}{i.meta}{i.meta ? ' · ' : ''}Quelle: {i.source}</small>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}
	<p class="muted small">„neu“ = noch in keiner Zusammenfassung dieses Profils.</p>

	<details class="edit" open={!!form && 'error' in form}>
		<summary>Profil ändern</summary>
		{#key form}
			<RadarForm values={form && 'values' in form && form.values ? form.values : data.values} regions={form && 'regions' in form && form.regions ? form.regions : data.regions} include={data.include} frequencies={data.frequencies} mail={data.mail} submit="Speichern" />
		{/key}
	</details>
</div>

<style>
	.wrap {
		max-width: 52rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.acts {
		display: flex;
		gap: var(--sp-2);
	}
	h2 {
		font-size: var(--fs-l);
		margin: var(--sp-5) 0 var(--sp-2);
	}
	h3 {
		font-size: var(--fs-m);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.items li {
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border-radius: var(--radius-s);
		display: grid;
		gap: 2px;
		border-left: 4px solid transparent;
	}
	.items li.new {
		border-left-color: var(--yellow);
	}
	.items small {
		color: var(--ink-2);
	}
	.tag {
		margin-left: var(--sp-2);
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--yellow);
		color: var(--navy);
	}
	.empty {
		padding: var(--sp-4);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
	}
	.edit {
		margin-top: var(--sp-6);
	}
	.edit summary {
		cursor: pointer;
		font-weight: 700;
		min-height: 44px;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
