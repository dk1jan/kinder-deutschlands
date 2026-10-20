<script lang="ts">
	// Veranstaltungen (M12): Liste, Kalender, Karte. Filter per Formular (funktioniert auch ohne JavaScript).
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import EventCard from '$lib/components/angebote/EventCard.svelte';
	import { AGE_GROUPS, EVENT_KINDS } from '$lib/angebote';
	import { dayHeading, dayKey, time } from '$lib/termin';

	let { data } = $props();
	const todayKey = dayKey(new Date());
	const tomorrowKey = dayKey(new Date(Date.now() + 86_400_000));

	const groups = $derived.by(() => {
		const m = new Map<string, typeof data.items>();
		for (const i of data.items) {
			const k = i.date;
			if (!m.has(k)) m.set(k, []);
			m.get(k)!.push(i);
		}
		return [...m.entries()];
	});

	// Kalender: Monatsraster ab Montag
	const cal = $derived.by(() => {
		const [y, m] = data.month.split('-').map(Number);
		const first = new Date(Date.UTC(y, m - 1, 1));
		const lead = (first.getUTCDay() + 6) % 7;
		const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
		const cells: { key: string | null; d: number | null }[] = [];
		for (let i = 0; i < lead; i++) cells.push({ key: null, d: null });
		for (let d = 1; d <= days; d++) cells.push({ key: `${data.month}-${String(d).padStart(2, '0')}`, d });
		while (cells.length % 7) cells.push({ key: null, d: null });
		const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
		const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
		const label = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
		return { cells, prev, next, label };
	});
	const byDay = $derived(new Map(groups));
	let openDay = $state<string | null>(null);

	const located = $derived(data.items.filter((i) => i.lat !== null && i.lon !== null));
	let picked = $state<number | null>(null);

	function link(over: Record<string, string | null>) {
		const u = new URLSearchParams(page.url.search);
		for (const [k, v] of Object.entries(over)) {
			if (v === null) u.delete(k);
			else u.set(k, v);
		}
		return `?${u.toString()}`;
	}
	const viewHref = (v: string) => link({ ansicht: v, monat: null });
</script>

<svelte:head>
	<title>Veranstaltungen – Kinder Deutschlands</title>
	<meta name="description" content="Flohmärkte, Feste, Kurse und Ferienprogramme für Familien – mit Quelle, Alter, Kosten und Ort." />
</svelte:head>

<div class="container page">
	<div class="head">
		<h1>Veranstaltungen</h1>
		<div class="acts">
			<a class="btn small signal" href="/veranstaltungen/heute"><Icon name="stern" size={18} /> Was machen wir heute?</a>
			{#if data.member}<a class="btn small secondary" href="/veranstaltungen/neu"><Icon name="plus" size={18} /> Termin eintragen</a>{/if}
		</div>
	</div>

	<nav class="viewtabs" aria-label="Ansicht">
		{#each [['liste', 'Liste'], ['kalender', 'Kalender'], ['karte', 'Karte']] as [v, l]}
			<a href={viewHref(v)} aria-current={data.view === v ? 'page' : undefined} data-sveltekit-noscroll>{l}</a>
		{/each}
	</nav>

	<details class="filters" open={!!(data.filters.q || data.filters.kinds.length || data.filters.ages.length || data.filters.region || data.filters.kostenlos || data.filters.wo || data.filters.freikarte)}>
		<summary><Icon name="filter" size={18} /> Filter</summary>
		<form method="GET" class="fform">
			<input type="hidden" name="ansicht" value={data.view} />
			{#if data.view === 'kalender'}<input type="hidden" name="monat" value={data.month} />{/if}
			<label class="q"><span class="visually-hidden">Suche</span><input type="search" name="q" value={data.filters.q} placeholder="Suche, z. B. Laternenfest" /></label>
			{#if data.view !== 'kalender'}
				<fieldset class="row"><legend>Zeitraum</legend>
					{#each [['heute', 'Heute'], ['wochenende', 'Wochenende'], ['7', '7 Tage'], ['30', '30 Tage'], ['90', '3 Monate']] as [v, l]}
						<label class="pill"><input type="radio" name="zeitraum" value={v} checked={data.zeitraum === v} /> {l}</label>
					{/each}
				</fieldset>
			{/if}
			<div class="field"><label for="region">Region</label><RegionPicker id="region" name="region" code={data.filters.region?.code ?? ''} label={data.filters.region?.name ?? ''} /></div>
			<fieldset class="row"><legend>Art</legend>
				{#each Object.entries(EVENT_KINDS) as [k, l]}<label class="pill"><input type="checkbox" name="art" value={k} checked={data.filters.kinds.includes(k)} /> {l}</label>{/each}
			</fieldset>
			<fieldset class="row"><legend>Alter</legend>
				{#each Object.entries(AGE_GROUPS) as [k, a]}<label class="pill"><input type="checkbox" name="alter" value={k} checked={data.filters.ages.includes(k)} /> {a.label}</label>{/each}
			</fieldset>
			<fieldset class="row"><legend>Sonst</legend>
				<label class="pill"><input type="checkbox" name="kostenlos" value="1" checked={data.filters.kostenlos} /> kostenlos</label>
				<label class="pill"><input type="checkbox" name="freikarte" value="1" checked={data.filters.freikarte} /> FreiKarte bestätigt</label>
				<label class="pill"><input type="radio" name="wo" value="" checked={!data.filters.wo} /> egal</label>
				<label class="pill"><input type="radio" name="wo" value="drinnen" checked={data.filters.wo === 'drinnen'} /> drinnen</label>
				<label class="pill"><input type="radio" name="wo" value="draussen" checked={data.filters.wo === 'draussen'} /> draußen</label>
			</fieldset>
			<div class="fbtns"><button class="btn small" type="submit">Anzeigen</button> <a class="btn small secondary" href="?ansicht={data.view}">Zurücksetzen</a></div>
		</form>
	</details>

	{#if data.view === 'liste'}
		{#if !groups.length}
			<p class="empty">Keine Termine gefunden. Es erscheinen nur Termine von verifizierten Einrichtungen, der Redaktion, angebundenen Quellen und Mitgliedern – nichts Erfundenes. {#if data.member}<a href="/veranstaltungen/neu">Einen Termin eintragen</a>.{/if}</p>
		{/if}
		{#each groups as [key, list]}
			<section class="day" aria-labelledby="d-{key}">
				<h2 id="d-{key}">{dayHeading(key, todayKey, tomorrowKey)}</h2>
				<div class="list">{#each list as e (e.id + e.date)}<EventCard {e} />{/each}</div>
			</section>
		{/each}
	{:else if data.view === 'kalender'}
		<div class="calhead">
			<a class="btn small secondary" href={link({ monat: cal.prev })} aria-label="Vorheriger Monat" data-sveltekit-noscroll><Icon name="zurueck" size={18} /></a>
			<h2>{cal.label}</h2>
			<a class="btn small secondary next" href={link({ monat: cal.next })} aria-label="Nächster Monat" data-sveltekit-noscroll><Icon name="zurueck" size={18} /></a>
		</div>
		<div class="cal" role="grid" aria-label="Kalender {cal.label}">
			{#each ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as w}<div class="wd" role="columnheader">{w}</div>{/each}
			{#each cal.cells as c}
				{#if c.key}
					{@const list = byDay.get(c.key) ?? []}
					<button type="button" class="cell" class:today={c.key === todayKey} class:has={list.length} class:sel={openDay === c.key} onclick={() => (openDay = openDay === c.key ? null : c.key)} aria-label="{c.d}. – {list.length} Termine">
						<span class="dnum">{c.d}</span>
						{#each list.slice(0, 2) as e}<span class="mini" class:x={e.cancelled}>{e.allDay ? '' : time(e.start) + ' '}{e.title}</span>{/each}
						{#if list.length > 2}<span class="more">+{list.length - 2}</span>{/if}
					</button>
				{:else}<div class="cell empty-cell"></div>{/if}
			{/each}
		</div>
		{#if openDay}
			<section class="day"><h2>{dayHeading(openDay, todayKey, tomorrowKey)}</h2>
				<div class="list">{#each byDay.get(openDay) ?? [] as e (e.id + e.date)}<EventCard {e} />{:else}<p class="muted">Keine Termine an diesem Tag.</p>{/each}</div>
			</section>
		{/if}
	{:else}
		<div class="mapwrap">
			<FamilyMap mode="mini" tiles={data.tiles} center={located[0] ? [located[0].lon!, located[0].lat!] : [8.8017, 53.0793]} zoom={11} points={located.map((i) => ({ lon: i.lon!, lat: i.lat!, kind: 'termin' }))} label="Karte der Veranstaltungen" onPoint={(i) => (picked = i)} />
		</div>
		{#if picked !== null && located[picked]}
			<div class="list picked"><EventCard e={located[picked]} /></div>
		{/if}
		<p class="muted small">{located.length} von {data.items.length} Terminen haben einen Ort auf der Karte. <button class="linkbtn" type="button" onclick={() => goto(viewHref('liste'))}>Alle als Liste</button></p>
	{/if}
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
	}
	.head h1 {
		margin: 0;
	}
	.acts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.acts .btn {
		display: inline-flex;
		gap: var(--sp-1);
		align-items: center;
	}
	.viewtabs {
		display: flex;
		gap: var(--sp-1);
		margin: var(--sp-5) 0 var(--sp-3);
		border-bottom: 2px solid var(--line);
	}
	.viewtabs a {
		padding: var(--sp-2) var(--sp-4);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: var(--ink-2);
		text-decoration: none;
		font-weight: 700;
		border-bottom: 4px solid transparent;
		margin-bottom: -2px;
	}
	.viewtabs a[aria-current='page'] {
		color: var(--ink);
		border-bottom-color: var(--yellow);
	}
	.filters {
		margin-bottom: var(--sp-5);
	}
	.filters summary {
		cursor: pointer;
		font-weight: 700;
		display: inline-flex;
		gap: var(--sp-1);
		align-items: center;
		min-height: 44px;
	}
	.fform {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		max-width: 60rem;
	}
	.row {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	legend {
		font-weight: 700;
		font-size: var(--fs-s);
		margin-bottom: var(--sp-1);
		width: 100%;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		font-size: var(--fs-s);
		min-height: 36px;
		cursor: pointer;
		background: var(--surface);
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.pill input {
		margin: 0;
	}
	.fbtns {
		display: flex;
		gap: var(--sp-2);
	}
	.day {
		margin-bottom: var(--sp-6);
		max-width: 52rem;
	}
	.day h2 {
		font-size: var(--fs-l);
		margin: 0 0 var(--sp-3);
	}
	.list {
		display: grid;
		gap: var(--sp-3);
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
	.calhead {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}
	.calhead h2 {
		margin: 0;
		font-size: var(--fs-l);
		min-width: 12rem;
		text-align: center;
	}
	.calhead .next :global(svg) {
		transform: rotate(180deg);
	}
	.cal {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 3px;
		margin-bottom: var(--sp-5);
	}
	.wd {
		text-align: center;
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--ink-2);
		padding: var(--sp-1);
	}
	.cell {
		min-height: 4.5rem;
		background: var(--surface);
		border: 1.5px solid transparent;
		border-radius: var(--radius-s);
		padding: 4px;
		display: grid;
		align-content: start;
		gap: 2px;
		text-align: left;
		font: inherit;
		color: var(--ink);
		cursor: pointer;
		min-width: 0;
	}
	.cell.empty-cell {
		background: transparent;
		cursor: default;
	}
	.cell.today .dnum {
		background: var(--navy);
		color: var(--yellow);
	}
	.cell.has {
		border-color: var(--yellow);
	}
	.cell.sel {
		border-color: var(--navy);
	}
	.dnum {
		font-weight: 700;
		font-size: var(--fs-s);
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	.mini {
		font-size: 0.7rem;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		background: #fff3d1;
		color: var(--navy);
		border-radius: 4px;
		padding: 1px 3px;
	}
	.mini.x {
		text-decoration: line-through;
		color: var(--ink-2);
	}
	.more {
		font-size: 0.7rem;
		color: var(--ink-2);
	}
	.mapwrap {
		height: min(70vh, 34rem);
		border-radius: var(--radius-m);
		overflow: hidden;
		margin-bottom: var(--sp-3);
	}
	.picked {
		max-width: 40rem;
		margin-bottom: var(--sp-3);
	}
	.small {
		font-size: var(--fs-s);
	}
	.linkbtn {
		background: none;
		border: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font: inherit;
		cursor: pointer;
	}
	@media (max-width: 600px) {
		.cell {
			min-height: 3.2rem;
		}
		.mini {
			display: none;
		}
		.cell.has::after {
			content: '';
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: var(--red);
			justify-self: center;
		}
	}
</style>
