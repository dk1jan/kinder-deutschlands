<script lang="ts">
	// Kurzangaben einer Kinderwagenroute
	let { r }: { r: { distanceM: number; loop: boolean; surface: string | null; incline: string | null; stairs: boolean | null; narrow?: boolean | null; durationMin: number | null } } = $props();
	const S: Record<string, string> = { asphalt: 'Asphalt', pflaster: 'Pflaster', wassergebunden: 'Kies/Splitt', waldweg: 'Wald-/Feldweg', gemischt: 'gemischt' };
	const I: Record<string, string> = { eben: 'eben', leicht: 'leichte Steigungen', steil: 'steile Stellen' };
	const km = $derived((r.distanceM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }));
</script>

<span class="chips">
	<span class="chip strong">{km} km{r.loop ? ' · Rundweg' : ''}</span>
	{#if r.durationMin}<span class="chip">ca. {r.durationMin} Min.</span>{/if}
	{#if r.surface}<span class="chip">{S[r.surface] ?? r.surface}</span>{/if}
	{#if r.incline}<span class="chip">{I[r.incline] ?? r.incline}</span>{/if}
	{#if r.stairs === false}<span class="chip ok">ohne Treppen</span>{:else if r.stairs === true}<span class="chip warn">mit Treppen</span>{/if}
	{#if r.narrow === true}<span class="chip warn">enge Stellen</span>{/if}
</span>

<style>
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
	.chip.strong {
		font-weight: 800;
		border-color: var(--navy);
	}
	.chip.ok {
		border-color: #1f7468;
	}
	.chip.warn {
		border-color: #d63d31;
	}
</style>
