<script lang="ts">
	// Anzeige aufgeben/bearbeiten (M09). Gegend statt Adresse; Fotos ohne Personen.
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { CONDITIONS, MARKET_CATEGORIES, MARKET_KINDS, SAFETY_CATEGORIES } from '$lib/alltag';
	interface Props {
		values: Record<string, string[]>;
		region: { code: string; name: string } | null;
		submit: string;
		withImages?: boolean;
	}
	let { values, region, submit, withImages = true }: Props = $props();
	const v = (k: string) => values[k]?.[0] ?? '';
	// svelte-ignore state_referenced_locally
	let kind = $state(v('kind') || 'verkaufen');
	// svelte-ignore state_referenced_locally
	let category = $state(v('category'));
	const safety = $derived(kind !== 'suchen' && SAFETY_CATEGORIES.includes(category));
</script>

<form method="POST" enctype="multipart/form-data" class="lf">
	<fieldset class="pills"><legend>Was möchtest du?</legend>
		{#each Object.entries(MARKET_KINDS) as [k, l]}<label class="pill"><input type="radio" name="kind" value={k} bind:group={kind} /> {l}</label>{/each}
	</fieldset>
	<div class="field"><label for="title">Titel</label><input id="title" name="title" required minlength="3" maxlength="120" value={v('title')} placeholder={kind === 'suchen' ? 'z. B. Laufrad für 3-Jährige' : 'z. B. Kinderwagen, gut erhalten'} /></div>
	<div class="two">
		<div class="field"><label for="category">Kategorie</label>
			<select id="category" name="category" required bind:value={category}><option value="">Bitte wählen</option>{#each Object.entries(MARKET_CATEGORIES) as [k, l]}<option value={k}>{l}</option>{/each}</select></div>
		{#if kind !== 'suchen'}
			<div class="field"><label for="condition">Zustand</label>
				<select id="condition" name="condition"><option value="">keine Angabe</option>{#each Object.entries(CONDITIONS) as [k, l]}<option value={k} selected={v('condition') === k}>{l}</option>{/each}</select></div>
		{/if}
	</div>
	{#if kind === 'verkaufen' || kind === 'suchen'}
		<div class="two">
			<div class="field"><label for="price">{kind === 'suchen' ? 'Budget bis (€, optional)' : 'Preis (€)'}</label><input id="price" name="price" inputmode="decimal" value={v('price')} placeholder="z. B. 25" /></div>
			{#if kind === 'verkaufen'}<label class="check"><input type="checkbox" name="negotiable" checked={v('negotiable') === 'on'} /> <span>Verhandlungssache (VB)</span></label>{/if}
		</div>
	{/if}
	<div class="two">
		<div class="field"><label for="size">Größe <span class="muted">(optional)</span></label><input id="size" name="size" maxlength="60" value={v('size')} placeholder="z. B. 98/104" /></div>
		<div class="field"><label for="age_min">Alter von</label><input id="age_min" type="number" name="age_min" min="0" max="18" value={v('age_min')} /></div>
		<div class="field"><label for="age_max">bis (Jahre)</label><input id="age_max" type="number" name="age_max" min="0" max="18" value={v('age_max')} /></div>
	</div>
	<div class="field"><label for="description">Beschreibung</label><textarea id="description" name="description" rows="5" maxlength="4000" placeholder="Marke, Mängel, Abholung …">{v('description')}</textarea></div>
	<div class="field"><label for="region_code">Gegend <span class="muted">(Stadtteil oder Ort – keine Adresse)</span></label><RegionPicker id="region_code" name="region_code" code={region?.code ?? v('region_code')} label={region?.name ?? ''} /></div>

	{#if withImages}
		<fieldset><legend>Fotos <span class="muted">(bis 6, optional)</span></legend>
			<input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
			<label class="check"><input type="checkbox" name="no_people" /> <span>Auf den Fotos sind keine Personen und keine Kinder erkennbar.</span></label>
			<p class="muted small">Standort- und Kameradaten werden aus den Fotos entfernt.</p>
		</fieldset>
	{/if}

	{#if safety}
		<div class="safety">
			<p><strong>Sicherheitsrelevant:</strong> Bei Autositzen, Babyschalen und Kinderwagen bitte ehrlich angeben, ob der Artikel unfallfrei und vollständig ist, und – soweit bekannt – Herstellungsjahr und Prüfnorm (z. B. Aufkleber am Sitz).</p>
			<label class="check"><input type="checkbox" name="safety_ack" checked={v('safety_ack') === 'on'} /> <span>Meine Angaben zu Zustand, Unfallfreiheit und Vollständigkeit stimmen.</span></label>
		</div>
	{/if}
	<label class="check"><input type="checkbox" name="private" required checked={v('private') === 'on'} /> <span>Ich biete privat an, nicht gewerblich.</span></label>
	<p class="muted small">Bitte keine Telefonnummer, Adresse oder Kontodaten in die Anzeige – Interessierte melden sich über die Familien-ID. Anzeigen laufen nach 30 Tagen ab und lassen sich verlängern.</p>
	<div><button class="btn">{submit}</button></div>
</form>

<style>
	.lf {
		display: grid;
		gap: var(--sp-4);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.pills legend {
		width: 100%;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 14px;
		border: 1.5px solid var(--line);
		border-radius: 999px;
		min-height: 44px;
		background: var(--surface);
		font-weight: 650;
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		align-items: end;
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 40px;
	}
	.safety {
		padding: var(--sp-3) var(--sp-4);
		border-left: 6px solid var(--yellow);
		background: var(--surface);
		border-radius: var(--radius-s);
	}
	.safety p {
		margin: 0 0 var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
