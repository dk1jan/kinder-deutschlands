<script lang="ts">
	// Rechtstexte sicher darstellen (kein HTML aus der Eingabe): Überschriften, Absätze, Listen.
	let { blocks }: { blocks: { t: 'h' | 'p' | 'li'; text: string }[] } = $props();
	const groups = $derived.by(() => {
		const out: ({ t: 'h' | 'p'; text: string } | { t: 'ul'; items: string[] })[] = [];
		for (const b of blocks) {
			if (b.t === 'li') {
				const last = out.at(-1);
				if (last && last.t === 'ul') last.items.push(b.text);
				else out.push({ t: 'ul', items: [b.text] });
			} else out.push({ t: b.t, text: b.text });
		}
		return out;
	});
</script>

<div class="legal">
	{#each groups as g}
		{#if g.t === 'h'}<h2>{g.text}</h2>
		{:else if g.t === 'p'}<p>{g.text}</p>
		{:else if g.t === 'ul'}<ul>{#each g.items as it}<li>{it}</li>{/each}</ul>{/if}
	{/each}
</div>

<style>
	.legal h2 {
		margin: var(--sp-5) 0 var(--sp-2);
		font-size: var(--fs-l);
	}
	.legal p {
		white-space: pre-line;
		margin: 0 0 var(--sp-3);
	}
	.legal ul {
		margin: 0 0 var(--sp-3);
		padding-left: 1.2em;
	}
</style>
