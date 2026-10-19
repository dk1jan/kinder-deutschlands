<script lang="ts">
	// Termin anlegen/bearbeiten (M12). Ohne JavaScript nutzbar; Karte zum Setzen des Ortes ist optional.
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { ACCESSIBILITY, EVENT_KINDS, RADAR_TOPICS, SETTINGS, VISIBILITY } from '$lib/angebote';

	interface Props {
		values: Record<string, string[]>;
		owners: { value: string; label: string }[];
		owner?: string | null;
		region?: { code: string; name: string } | null;
		place?: { id: string; name: string } | null;
		tiles: boolean;
		center: [number, number];
		submit: string;
		edit?: boolean;
	}
	let { values, owners, owner = null, region = null, place = null, tiles, center, submit, edit = false }: Props = $props();
	const v = (k: string) => values[k]?.[0] ?? '';
	const has = (k: string, x: string) => (values[k] ?? []).includes(x);

	// svelte-ignore state_referenced_locally
	let allDay = $state(has('all_day', 'on'));
	// svelte-ignore state_referenced_locally
	let repeat = $state(v('repeat') || 'nie');
	// svelte-ignore state_referenced_locally
	let who = $state(owner ?? owners[0]?.value ?? 'ich');
	// svelte-ignore state_referenced_locally
	let lat = $state(v('lat'));
	// svelte-ignore state_referenced_locally
	let lon = $state(v('lon'));
	let showMap = $state(false);
	const isMember = $derived(who === 'ich');
</script>

<form method="POST" class="ef">
	{#if owners.length > 1 && !edit}
		<fieldset class="row"><legend>Wer veranstaltet?</legend>
			{#each owners as o}<label class="pill"><input type="radio" name="owner" value={o.value} bind:group={who} /> {o.label}</label>{/each}
		</fieldset>
	{:else}
		<input type="hidden" name="owner" value={who} />
	{/if}

	<div class="field"><label for="title">Titel</label><input id="title" name="title" required minlength="3" maxlength="160" value={v('title')} placeholder="z. B. Kinderflohmarkt im Bürgerhaus" /></div>

	<div class="two">
		<div class="field"><label for="kind">Art</label>
			<select id="kind" name="kind" required>
				<option value="">Bitte wählen</option>
				{#each Object.entries(EVENT_KINDS) as [k, l]}<option value={k} selected={v('kind') === k}>{l}</option>{/each}
			</select>
		</div>
		<div class="field"><label for="setting">Drinnen/draußen</label>
			<select id="setting" name="setting"><option value="">keine Angabe</option>{#each Object.entries(SETTINGS) as [k, l]}<option value={k} selected={v('setting') === k}>{l}</option>{/each}</select>
		</div>
	</div>

	<fieldset class="when"><legend>Wann?</legend>
		<label class="check"><input type="checkbox" name="all_day" bind:checked={allDay} /> <span>ganztägig</span></label>
		<div class="two">
			{#if allDay}
				<div class="field"><label for="start_date">Am / ab</label><input id="start_date" type="date" name="start_date" required value={v('start_date') || v('start').slice(0, 10)} /></div>
				<div class="field"><label for="end_date">bis <span class="muted">(optional)</span></label><input id="end_date" type="date" name="end_date" value={v('end_date')} /></div>
			{:else}
				<div class="field"><label for="start">Beginn</label><input id="start" type="datetime-local" name="start" required value={v('start')} /></div>
				<div class="field"><label for="end">Ende <span class="muted">(optional)</span></label><input id="end" type="datetime-local" name="end" value={v('end')} /></div>
			{/if}
		</div>
		<div class="two">
			<div class="field"><label for="repeat">Wiederholen</label>
				<select id="repeat" name="repeat" bind:value={repeat}>
					<option value="nie">nicht wiederholen</option>
					<option value="woechentlich">jede Woche</option>
					<option value="zweiwoechentlich">alle zwei Wochen</option>
					<option value="monatlich_wochentag">jeden Monat am gleichen Wochentag (z. B. 1. Samstag)</option>
					<option value="monatlich_tag">jeden Monat am gleichen Tag</option>
					<option value="taeglich">täglich</option>
					{#if v('repeat') === 'beibehalten'}<option value="beibehalten">wie bisher (Regel aus der Quelle)</option>{/if}
				</select>
			</div>
			{#if repeat !== 'nie' && repeat !== 'beibehalten'}
				<div class="field"><label for="repeat_until">bis einschließlich <span class="muted">(optional)</span></label><input id="repeat_until" type="date" name="repeat_until" value={v('repeat_until')} /></div>
			{/if}
		</div>
		<p class="muted small">Zeiten in deutscher Ortszeit. Einzelne Tage einer Reihe kannst du später absagen.</p>
	</fieldset>

	<fieldset><legend>Wo?</legend>
		{#if place}
			<label class="check"><input type="checkbox" name="place_id" value={place.id} checked={has('place_id', place.id)} /> <span>An diesem Ort der Familienkarte: <strong>{place.name}</strong></span></label>
		{/if}
		<div class="field"><label for="address">Adresse oder Treffpunkt</label><input id="address" name="address" maxlength="300" value={v('address')} placeholder="z. B. Bürgerhaus Weserterrassen, Osterdeich 70b" /></div>
		<div class="field"><label for="region_code">Ort / Stadtteil</label><RegionPicker id="region_code" name="region_code" code={region?.code ?? v('region_code')} label={region?.name ?? ''} /></div>
		<input type="hidden" name="lat" value={lat} /><input type="hidden" name="lon" value={lon} />
		{#if showMap}
			<div class="mapbox"><FamilyMap mode="pick" {tiles} center={lat && lon ? [Number(lon), Number(lat)] : center} zoom={lat ? 17 : 13} label="Karte zum Setzen des Treffpunkts" onPick={(x, y) => ((lon = x.toFixed(6)), (lat = y.toFixed(6)))} /></div>
			<p class="muted small">{lat ? `Position: ${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}` : 'Karte verschieben, bis die Markierung passt.'} <button type="button" class="linkbtn" onclick={() => ((lat = ''), (lon = ''), (showMap = false))}>Position entfernen</button></p>
		{:else}
			<p><button type="button" class="btn small secondary" onclick={() => (showMap = true)}>{lat ? 'Position auf der Karte ändern' : 'Position auf der Karte setzen (optional)'}</button></p>
		{/if}
		<p class="muted small">Bitte keine Privatadressen bei öffentlichen Terminen.</p>
	</fieldset>

	<div class="field"><label for="description">Beschreibung</label><textarea id="description" name="description" rows="5" maxlength="8000" placeholder="Was erwartet Familien? Was mitbringen?">{v('description')}</textarea></div>

	<fieldset><legend>Für wen?</legend>
		<div class="two">
			<div class="field"><label for="age_min">Alter von</label><input id="age_min" type="number" name="age_min" min="0" max="18" inputmode="numeric" value={v('age_min')} /></div>
			<div class="field"><label for="age_max">bis (Jahre)</label><input id="age_max" type="number" name="age_max" min="0" max="18" inputmode="numeric" value={v('age_max')} /></div>
		</div>
		<div class="row">{#each Object.entries(ACCESSIBILITY) as [k, l]}<label class="pill"><input type="checkbox" name="accessibility" value={k} checked={has('accessibility', k)} /> {l}</label>{/each}</div>
	</fieldset>

	<fieldset><legend>Kosten</legend>
		<div class="row">
			<label class="pill"><input type="radio" name="cost" value="" checked={!v('cost')} /> keine Angabe</label>
			<label class="pill"><input type="radio" name="cost" value="frei" checked={v('cost') === 'frei'} /> kostenlos</label>
			<label class="pill"><input type="radio" name="cost" value="kosten" checked={v('cost') === 'kosten'} /> kostenpflichtig</label>
		</div>
		<div class="two">
			<div class="field"><label for="cost_text">Preis <span class="muted">(Text)</span></label><input id="cost_text" name="cost_text" maxlength="200" value={v('cost_text')} placeholder="z. B. 3 € pro Kind" /></div>
			<div class="field"><label for="discounts">Ermäßigungen</label><input id="discounts" name="discounts" maxlength="300" value={v('discounts')} placeholder="z. B. Geschwister frei" /></div>
		</div>
		{#if !isMember}<label class="check"><input type="checkbox" name="freikarte" checked={has('freikarte', 'on')} /> <span>Mit FreiKarte nutzbar (vom Anbieter bestätigt)</span></label>{/if}
	</fieldset>

	<fieldset><legend>Anmeldung <span class="muted">(optional)</span></legend>
		<div class="two">
			<div class="field"><label for="registration_url">Link zur Anmeldung</label><input id="registration_url" type="url" name="registration_url" maxlength="500" value={v('registration_url')} placeholder="https://…" /></div>
			<div class="field"><label for="registration_deadline">Anmeldeschluss</label><input id="registration_deadline" type="datetime-local" name="registration_deadline" value={v('registration_deadline')} /></div>
		</div>
		<div class="two">
			<div class="field"><label for="capacity">Plätze</label><input id="capacity" type="number" name="capacity" min="1" max="100000" value={v('capacity')} /></div>
			<label class="check"><input type="checkbox" name="waitlist" checked={has('waitlist', 'on')} /> <span>Warteliste möglich</span></label>
		</div>
	</fieldset>

	<fieldset class="row"><legend>Themen fürs Familienradar</legend>
		{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="topics" value={k} checked={has('topics', k) || (!values.topics?.length && k === 'freizeit')} /> {l}</label>{/each}
	</fieldset>

	<fieldset><legend>Wer darf den Termin sehen?</legend>
		{#each Object.entries(VISIBILITY) as [k, l]}
			{#if k !== 'oeffentlich' || !isMember}
				<label class="check"><input type="radio" name="visibility" value={k} checked={(v('visibility') || (isMember ? 'mitglieder' : 'oeffentlich')) === k} /> <span>{l}</span></label>
			{/if}
		{/each}
		{#if isMember}<p class="muted small">Termine von Mitgliedern sind nur im Netzwerk oder per Link sichtbar und tragen den Hinweis „von einem Mitglied“.</p>{/if}
	</fieldset>

	<p class="muted small">Keine Fotos oder Namen von Kindern. Angaben müssen stimmen – Falsches kann gemeldet werden.</p>
	<button class="btn" type="submit">{submit}</button>
</form>

<style>
	.ef {
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
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		align-items: end;
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
		cursor: pointer;
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
		min-height: 40px;
	}
	.mapbox {
		height: 300px;
		border-radius: var(--radius-m);
		overflow: hidden;
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
</style>
