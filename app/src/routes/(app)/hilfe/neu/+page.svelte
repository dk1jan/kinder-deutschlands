<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import CrisisBox from '$lib/components/alltag/CrisisBox.svelte';
	import { HELP_CATEGORIES, HELP_KINDS } from '$lib/alltag';
	let { data, form } = $props();
	const values = $derived((form?.values ?? {}) as Record<string, string[]>);
	const v = (k: string) => values[k]?.[0] ?? '';
</script>

<svelte:head><title>Eintrag schreiben – Familien helfen Familien</title></svelte:head>

<div class="container page narrow">
	<a class="back" href="/hilfe"><Icon name="zurueck" size={18} />Familien helfen Familien</a>
	<h1>Eintrag schreiben</h1>
	<CrisisBox />
	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#key form}
		<form method="POST" class="f">
			<fieldset class="pills"><legend>Was möchtest du?</legend>
				{#each Object.entries(HELP_KINDS) as [k, l]}<label class="pill"><input type="radio" name="kind" value={k} checked={(v('kind') || data.kind) === k} /> {l}</label>{/each}
			</fieldset>
			<div class="field"><label for="category">Thema</label>
				<select id="category" name="category" required><option value="">Bitte wählen</option>{#each Object.entries(HELP_CATEGORIES) as [k, l]}<option value={k} selected={v('category') === k}>{l}</option>{/each}</select></div>
			<div class="field"><label for="title">Kurz und konkret</label><input id="title" name="title" required minlength="3" maxlength="120" value={v('title')} placeholder="z. B. Wer hat Erfahrung mit dem Elterngeld-Antrag?" /></div>
			<div class="field"><label for="body">Mehr dazu <span class="muted">(optional)</span></label><textarea id="body" name="body" rows="5" maxlength="3000">{v('body')}</textarea></div>
			<div class="field"><label for="region_code">Gegend</label><RegionPicker id="region_code" name="region_code" code={form?.region?.code ?? data.region?.code ?? ''} label={form?.region?.name ?? data.region?.name ?? ''} /></div>
			<p class="muted small">Bitte keine Telefonnummer, Adresse oder Gesundheitsdetails. Wer antworten möchte, schickt dir eine Kontaktanfrage über die Familien-ID. Einträge laufen nach 30 Tagen ab.</p>
			<div><button class="btn">Veröffentlichen</button></div>
		</form>
	{/key}
</div>

<style>
	.narrow {
		max-width: 44rem;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	.f {
		display: grid;
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}
	.pills {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.pills legend {
		font-weight: 700;
		width: 100%;
		margin-bottom: var(--sp-2);
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
	.small {
		font-size: var(--fs-s);
	}
</style>
