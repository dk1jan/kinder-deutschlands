<script lang="ts">
	// Familienradar-Profil (M05): Regionen, Themen, Alter, Arten, Häufigkeit, Kanal.
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { AGE_GROUPS, RADAR_TOPICS } from '$lib/angebote';
	interface Props {
		values: Record<string, string[]>;
		regions: { code: string; name: string }[];
		include: Record<string, string>;
		frequencies: Record<string, string>;
		mail: boolean;
		submit: string;
	}
	let { values, regions, include, frequencies, mail, submit }: Props = $props();
	const v = (k: string) => values[k]?.[0] ?? '';
	const has = (k: string, x: string) => (values[k] ?? []).includes(x);
	// svelte-ignore state_referenced_locally
	let freq = $state(v('frequency') || 'woechentlich');
	// svelte-ignore state_referenced_locally
	let extra = $state(regions.length ? 0 : 1);
</script>

<form method="POST" action="?/speichern" class="rf">
	<div class="field"><label for="name">Name des Profils</label><input id="name" name="name" required maxlength="80" value={v('name')} placeholder="z. B. Bremen-Findorff, Kita & Freizeit" /></div>

	<fieldset><legend>Regionen <span class="muted">(leer = überall; Unterregionen sind enthalten)</span></legend>
		{#each regions as r, i}<RegionPicker id="reg-{i}" name="regions" code={r.code} label={r.name} />{/each}
		{#each Array(extra) as _, i}<RegionPicker id="reg-x{i}" name="regions" />{/each}
		{#if regions.length + extra < 10}<p><button type="button" class="linkbtn" onclick={() => extra++}>+ weitere Region</button></p>{/if}
	</fieldset>

	<fieldset class="row"><legend>Was soll drin sein?</legend>
		{#each Object.entries(include) as [k, l]}<label class="pill"><input type="checkbox" name="include" value={k} checked={values.include ? has('include', k) : true} /> {l}</label>{/each}
	</fieldset>
	<fieldset class="row"><legend>Themen <span class="muted">(leer = alle)</span></legend>
		{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="topics" value={k} checked={has('topics', k)} /> {l}</label>{/each}
	</fieldset>
	<fieldset class="row"><legend>Alter der Kinder <span class="muted">(leer = alle)</span></legend>
		{#each Object.entries(AGE_GROUPS) as [k, a]}<label class="pill"><input type="checkbox" name="ages" value={k} checked={has('ages', k)} /> {a.label}</label>{/each}
	</fieldset>

	<fieldset><legend>Wie oft?</legend>
		{#each Object.entries(frequencies) as [k, l]}<label class="check"><input type="radio" name="frequency" value={k} bind:group={freq} /> <span>{l}</span></label>{/each}
		{#if freq !== 'nur_portal'}
			<label class="check"><input type="checkbox" name="via_email" checked={values.via_email ? has('via_email', 'on') : mail} disabled={!mail} /> <span>per E-Mail{mail ? '' : ' (E-Mail-Versand ist noch nicht eingerichtet)'}</span></label>
			<label class="check"><input type="checkbox" name="via_push" checked={has('via_push', 'on')} /> <span>als Push-Mitteilung (ohne Inhalt: „Dein Familienradar ist da“)</span></label>
		{/if}
		<p class="muted small">Nur neue Einträge, keine Dubletten. Leere Zusammenfassungen schicken wir nicht. Betreff und Push nennen keine Themen.</p>
	</fieldset>

	<div><button class="btn">{submit}</button></div>
</form>

<style>
	.rf {
		display: grid;
		gap: var(--sp-5);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	fieldset.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
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
		min-height: 40px;
		background: var(--surface);
	}
	.pill:has(input:checked) {
		border-color: var(--navy);
		background: #fff3d1;
		color: var(--navy);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 36px;
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
	.small {
		font-size: var(--fs-s);
	}
</style>
