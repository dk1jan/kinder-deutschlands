<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import { CHILD_AGES, FIELDS, LEVELS, PRESETS } from '$lib/visibility';
	let { data, form } = $props();
	// svelte-ignore state_referenced_locally
	let preset = $state(data.profile.preset);
	// svelte-ignore state_referenced_locally
	let vis = $state({ ...data.profile.visibility });
	const presets = [
		{ key: 'zurueckhaltend', label: 'Zurückhaltend', hint: 'Mitglieder sehen deinen Anzeigenamen, alles andere nur bestätigte Kontakte. Empfohlen.' },
		{ key: 'offen', label: 'Offen', hint: 'Name für alle, die meisten Angaben für Mitglieder. Altersgruppen nur für Kontakte.' },
		{ key: 'individuell', label: 'Individuell', hint: 'Du legst für jede Angabe selbst fest, wer sie sieht.' }
	];
	function choose(p: string) {
		preset = p as typeof preset;
		if (p !== 'individuell') vis = { ...PRESETS[p as 'offen' | 'zurueckhaltend'] };
	}
	const groupedRegions = $derived([
		{ label: 'Bundesländer', items: data.regions.filter((r) => r.level === 'land') },
		{ label: 'Städte und Kreise', items: data.regions.filter((r) => r.level !== 'land') }
	]);
</script>

<svelte:head><title>Profil bearbeiten – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">
	<p><a href="/profil">Zurück zum Profil</a></p>
	<h1>Profil bearbeiten</h1>
	<p class="lead">Alle Angaben sind freiwillig. Telefonnummer, E-Mail und Adresse gehören nicht hierher, Kontakt läuft über deine Familien-ID.</p>

	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}

	<form method="POST">
		<fieldset class="block">
			<legend>Über dich</legend>
			<div class="field">
				<label for="display_name">Anzeigename</label>
				<span class="hint">Zum Beispiel ein Vorname oder ein Spitzname. Leer lassen geht auch, dann siehst du nur als ID aus.</span>
				<input id="display_name" name="display_name" type="text" maxlength="60" value={data.profile.displayName} />
			</div>
			<div class="field">
				<label for="can_help">Ich kann helfen</label>
				<span class="hint">Zum Beispiel: Erfahrung mit Kita-Anträgen, Kleidung Größe 86 abzugeben</span>
				<textarea id="can_help" name="can_help" rows="3" maxlength="500">{data.profile.canHelp}</textarea>
			</div>
			<div class="field">
				<label for="looking_for">Ich suche</label>
				<span class="hint">Zum Beispiel: Spielplatzbekanntschaften in der Neustadt, Tipps zum Babyschwimmen</span>
				<textarea id="looking_for" name="looking_for" rows="3" maxlength="500">{data.profile.lookingFor}</textarea>
			</div>
			<div class="field">
				<label for="interests">Interessen</label>
				<span class="hint">Mit Komma trennen, höchstens 12</span>
				<input id="interests" name="interests" type="text" value={data.profile.interests} />
			</div>
		</fieldset>

		<fieldset class="block">
			<legend>Altersgruppen der Kinder</legend>
			<p class="hint-p">Freiwillig. Keine Namen, keine Geburtsdaten.</p>
			<div class="chips">
				{#each CHILD_AGES as a}
					<label class="chip">
						<input type="checkbox" name="child_ages" value={a.key} checked={data.profile.childAges.includes(a.key)} />
						<span>{a.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<fieldset class="block">
			<legend>Region</legend>
			<div class="field">
				<label for="region_code">Grobe Region</label>
				<span class="hint">Nie die Adresse. Feinere Regionen (Stadtteile) kommen mit dem Regionen-Import.</span>
				<select id="region_code" name="region_code">
					<option value="">Keine Angabe</option>
					{#each groupedRegions as g}
						<optgroup label={g.label}>
							{#each g.items as r}<option value={r.code} selected={r.code === data.profile.regionCode}>{r.name}</option>{/each}
						</optgroup>
					{/each}
				</select>
			</div>
			<label class="check">
				<input type="checkbox" name="discoverable" checked={data.profile.discoverable} />
				<span><strong>Für Mitglieder auffindbar sein</strong><br />Angemeldete Mitglieder können dich in der Liste „Familien entdecken“ finden, gefiltert nach Region. Ohne Haken findet man dich nur über deine ID oder deinen QR-Code.</span>
			</label>
		</fieldset>

		<fieldset class="block">
			<legend>Wer sieht was?</legend>
			<div class="presets">
				{#each presets as p}
					<label class="preset" class:on={preset === p.key}>
						<input type="radio" name="preset" value={p.key} checked={preset === p.key} onchange={() => choose(p.key)} />
						<span><strong>{p.label}</strong><small>{p.hint}</small></span>
					</label>
				{/each}
			</div>
			<table class="vis">
				<caption class="visually-hidden">Sichtbarkeit je Angabe</caption>
				<tbody>
					{#each FIELDS as fld}
						<tr>
							<th scope="row"><label for={`vis_${fld.key}`}>{fld.label}</label></th>
							<td>
								<select id={`vis_${fld.key}`} name={`vis_${fld.key}`} bind:value={vis[fld.key]} disabled={preset !== 'individuell'}>
									{#each LEVELS as l}<option value={l.key}>{l.label}</option>{/each}
								</select>
								{#if preset !== 'individuell'}<input type="hidden" name={`vis_${fld.key}`} value={vis[fld.key]} />{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="hint-p">Deine Familien-ID sieht jede Person, der du sie gibst. E-Mail-Adresse und Konto-Nummer sieht niemand.</p>
		</fieldset>

		<div class="actions">
			<button class="btn signal" type="submit">Speichern und Vorschau ansehen</button>
			<a class="btn secondary" href="/profil">Abbrechen</a>
		</div>
	</form>
</div>

<style>
	.block {
		border: 0;
		padding: var(--sp-5);
		margin: 0 0 var(--sp-5);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow);
	}
	legend {
		float: left;
		width: 100%;
		font-family: var(--font-display);
		font-size: var(--fs-l);
		font-weight: 700;
		margin-bottom: var(--sp-4);
	}
	legend + * {
		clear: both;
	}
	textarea {
		min-height: 0;
		padding: var(--sp-3) var(--sp-4);
		resize: vertical;
	}
	.hint-p {
		font-size: var(--fs-s);
		color: var(--ink-2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.chip {
		position: relative;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
	}
	.chip span {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 var(--sp-4);
		border-radius: 999px;
		border: 1.5px solid var(--line);
		background: var(--paper);
		cursor: pointer;
	}
	.chip input:checked + span {
		background: var(--yellow);
		border-color: var(--yellow);
		color: var(--navy);
		font-weight: 700;
	}
	.chip input:checked + span::before {
		content: '✓';
		margin-right: var(--sp-2);
	}
	.chip input:focus-visible + span {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.check,
	.preset {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-3);
		align-items: start;
		line-height: 1.45;
	}
	.check input,
	.preset input {
		width: 1.4rem;
		height: 1.4rem;
		margin-top: 2px;
		accent-color: var(--ink);
	}
	.presets {
		display: grid;
		gap: var(--sp-2);
		margin-bottom: var(--sp-5);
	}
	.preset {
		padding: var(--sp-3) var(--sp-4);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-m);
		cursor: pointer;
	}
	.preset.on {
		border-color: var(--ink);
		box-shadow: inset 5px 0 0 var(--yellow);
	}
	.preset span {
		display: grid;
	}
	.preset small {
		color: var(--ink-2);
	}
	.vis {
		width: 100%;
		border-collapse: collapse;
	}
	.vis th {
		text-align: left;
		font-weight: 600;
		padding: var(--sp-2) var(--sp-3) var(--sp-2) 0;
		width: 45%;
	}
	.vis td {
		padding: var(--sp-1) 0;
	}
	.vis select[disabled] {
		opacity: 0.75;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
	}
</style>
