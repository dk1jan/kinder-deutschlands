<script lang="ts">
	// Regionssuche statt riesiger Auswahlliste (über 1 000 Gemeinden und Stadtteile).
	let { name, code = '', label = '', id = 'region' }: { name: string; code?: string; label?: string; id?: string } = $props();
	// svelte-ignore state_referenced_locally
	let value = $state(code);
	// svelte-ignore state_referenced_locally
	let text = $state(label);
	let open = $state(false);
	let items = $state<{ code: string; name: string; hint: string }[]>([]);
	let active = $state(-1);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function search() {
		value = '';
		if (timer) clearTimeout(timer);
		const q = text.trim();
		if (q.length < 2) {
			items = [];
			open = false;
			return;
		}
		timer = setTimeout(async () => {
			const r = await fetch(`/api/regionen?q=${encodeURIComponent(q)}`).catch(() => null);
			items = r?.ok ? await r.json() : [];
			open = true;
			active = -1;
		}, 200);
	}
	function pick(i: { code: string; name: string; hint: string }) {
		value = i.code;
		text = i.name;
		open = false;
	}
	function key(e: KeyboardEvent) {
		if (!open || !items.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % items.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + items.length) % items.length;
		} else if (e.key === 'Enter' && active >= 0) {
			e.preventDefault();
			pick(items[active]);
		} else if (e.key === 'Escape') open = false;
	}
</script>

<div class="rp">
	<input
		{id}
		type="text"
		role="combobox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-autocomplete="list"
		aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
		autocomplete="off"
		placeholder="Stadtteil, Gemeinde oder Kreis eingeben"
		bind:value={text}
		oninput={search}
		onkeydown={key}
		onblur={() => setTimeout(() => (open = false), 150)}
	/>
	<input type="hidden" {name} {value} />
	{#if text && !value && !open}<small class="warn">Bitte einen Vorschlag aus der Liste wählen – sonst wird keine Region gespeichert.</small>{/if}
	{#if value}<button type="button" class="clear" onclick={() => ((value = ''), (text = ''))}>Keine Angabe</button>{/if}
	{#if open}
		<ul id="{id}-list" role="listbox">
			{#each items as i, n}
				<li id="{id}-o{n}" role="option" aria-selected={n === active}>
					<button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => pick(i)}><b>{i.name}</b><small>{i.hint}</small></button>
				</li>
			{:else}
				<li class="none">Keine Region gefunden.</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.rp {
		position: relative;
		display: grid;
		gap: var(--sp-1);
	}
	ul {
		position: absolute;
		z-index: 10;
		top: 100%;
		left: 0;
		right: 0;
		margin: 4px 0 0;
		padding: var(--sp-1);
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-s);
		box-shadow: var(--shadow);
		max-height: 18rem;
		overflow: auto;
	}
	button {
		display: grid;
		width: 100%;
		text-align: left;
		padding: var(--sp-2) var(--sp-3);
		border: 0;
		background: none;
		font: inherit;
		color: var(--ink);
		border-radius: 6px;
		cursor: pointer;
		min-height: 44px;
	}
	li[aria-selected='true'] button,
	button:hover {
		background: var(--surface-2);
	}
	small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
	.warn {
		color: var(--warn);
	}
	.none {
		padding: var(--sp-2) var(--sp-3);
		color: var(--ink-2);
	}
	.clear {
		display: inline;
		width: auto;
		min-height: 0;
		padding: 0;
		color: var(--link);
		text-decoration: underline;
		font-size: var(--fs-s);
	}
</style>
