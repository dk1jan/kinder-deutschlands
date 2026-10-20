<script lang="ts">
	// Termin in Listen: Zeit, Titel, Ort, wichtigste Merkmale. Herkunft immer sichtbar (M12).
	import Icon from '$lib/components/Icon.svelte';
	import { EVENT_KINDS, SETTINGS, ageLabel } from '$lib/angebote';
	import { ORIGIN_LABEL, time } from '$lib/termin';
	interface Item {
		id: string;
		title: string;
		kind: string;
		origin: string;
		orgName: string | null;
		date: string;
		start: string;
		end: string | null;
		allDay: boolean;
		cancelled: boolean;
		recurring: string | null;
		regionName: string | null;
		address: string | null;
		ageMin: number | null;
		ageMax: number | null;
		costFree: boolean | null;
		costText: string | null;
		freikarte: boolean;
		setting: string | null;
		distanceKm?: number | null;
	}
	let { e }: { e: Item } = $props();
	const age = $derived(ageLabel(e.ageMin, e.ageMax));
</script>

<a class="ev" class:cancelled={e.cancelled} href="/veranstaltungen/{e.id}?am={e.date}">
	<span class="time">{#if e.allDay}<small>ganz­tägig</small>{:else}{time(e.start)}{#if e.end}<small>bis {time(e.end)}</small>{/if}{/if}</span>
	<span class="body">
		<span class="kind">{EVENT_KINDS[e.kind as keyof typeof EVENT_KINDS] ?? e.kind}{#if e.recurring}{' · ' + e.recurring}{/if}</span>
		<strong class="title">{#if e.cancelled}<span class="abgesagt">Abgesagt</span> {/if}{e.title}</strong>
		<span class="where muted">{[e.address, e.regionName].filter(Boolean).join(' · ') || 'Ort folgt'}{#if e.distanceKm != null} · {e.distanceKm.toLocaleString('de-DE')} km{/if}</span>
		<span class="chips">
			{#if age}<span class="chip">{age}</span>{/if}
			{#if e.costFree}<span class="chip free">kostenlos</span>{:else if e.costText}<span class="chip">{e.costText}</span>{/if}
			{#if e.freikarte}<span class="chip fk">FreiKarte bestätigt</span>{/if}
			{#if e.setting}<span class="chip">{SETTINGS[e.setting as keyof typeof SETTINGS]}</span>{/if}
			<span class="chip origin" class:org={e.origin === 'anbieter'}>{#if e.origin === 'anbieter'}<Icon name="ok" size={14} /> {e.orgName}{:else}{ORIGIN_LABEL[e.origin]}{/if}</span>
		</span>
	</span>
</a>

<style>
	.ev {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
		border-left: 6px solid var(--yellow);
	}
	.ev:hover .title {
		text-decoration: underline;
	}
	.ev.cancelled {
		border-left-color: var(--line);
	}
	.ev.cancelled .title {
		text-decoration: line-through;
	}
	.time {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: var(--fs-l);
		display: grid;
		align-content: start;
		line-height: 1.1;
	}
	.time small {
		font-family: var(--font-body);
		font-weight: 600;
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
	.body {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.kind {
		font-size: var(--fs-xs);
		font-weight: 700;
		color: var(--sea-ink);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.title {
		font-size: var(--fs-m);
	}
	.abgesagt {
		display: inline-block;
		text-decoration: none;
		background: #b3261e;
		color: #fff;
		font-size: var(--fs-xs);
		padding: 1px 8px;
		border-radius: 999px;
	}
	.where {
		font-size: var(--fs-s);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}
	.chip {
		font-size: var(--fs-xs);
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.chip.free {
		background: #d8efe3;
		color: #14532d;
	}
	.chip.fk {
		background: #fff3d1;
		color: var(--navy);
	}
	.chip.origin.org {
		font-weight: 700;
	}
</style>
