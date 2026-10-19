<script lang="ts">
	// Angebot mit Verfügbarkeit (M17): Angabe immer mit Stand und Gültigkeit; abgelaufen = „unbekannt“.
	import { AVAILABILITY, OFFER_KINDS, ageLabel } from '$lib/angebote';
	interface Item {
		id: string;
		title: string;
		kind: string;
		orgName: string;
		regionName: string | null;
		ageMin: number | null;
		ageMax: number | null;
		scheduleText: string | null;
		costText: string | null;
		freikarte: boolean;
		availability: string;
		placesCount: number | null;
		confirmedAt: Date | string | null;
		validUntil: Date | string | null;
	}
	let { o, showOrg = true }: { o: Item; showOrg?: boolean } = $props();
	const age = $derived(ageLabel(o.ageMin, o.ageMax));
	const d = (x: Date | string) => new Date(x).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
</script>

<a class="of" href="/angebote/{o.id}">
	<span class="av {o.availability}">{AVAILABILITY[o.availability as keyof typeof AVAILABILITY]}{o.placesCount !== null && o.availability !== 'unbekannt' ? ` · ${o.placesCount}` : ''}</span>
	<strong>{o.title}</strong>
	<small>{OFFER_KINDS[o.kind as keyof typeof OFFER_KINDS] ?? o.kind}{showOrg ? ` · ${o.orgName}` : ''}{o.regionName ? ` · ${o.regionName}` : ''}</small>
	<span class="chips">
		{#if age}<span class="chip">{age}</span>{/if}
		{#if o.scheduleText}<span class="chip">{o.scheduleText}</span>{/if}
		{#if o.costText}<span class="chip">{o.costText}</span>{/if}
		{#if o.freikarte}<span class="chip fk">FreiKarte bestätigt</span>{/if}
	</span>
	<small class="stand">{#if o.availability !== 'unbekannt' && o.confirmedAt}Stand {d(o.confirmedAt)}, gilt bis {d(o.validUntil!)}{:else}Keine aktuelle Angabe der Einrichtung – bitte dort nachfragen.{/if}</small>
</a>

<style>
	.of {
		display: grid;
		gap: 4px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
	}
	.av {
		justify-self: start;
		font-size: var(--fs-xs);
		font-weight: 800;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--line);
		color: var(--ink);
	}
	.av.frei {
		background: #1f7468;
		color: #fff;
	}
	.av.wenige {
		background: var(--yellow);
		color: var(--navy);
	}
	.av.warteliste,
	.av.ausgebucht {
		background: #d63d31;
		color: #fff;
	}
	small {
		color: var(--ink-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.chip {
		font-size: var(--fs-xs);
		padding: 2px 8px;
		border-radius: 999px;
		border: 1px solid var(--line);
	}
	.chip.fk {
		border-color: var(--navy);
		font-weight: 700;
	}
	.stand {
		font-size: var(--fs-xs);
	}
</style>
