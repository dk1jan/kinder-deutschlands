<script lang="ts">
	// Stammdaten einer Einrichtung (Antrag und Verwaltung). Standort per Karte optional.
	import FamilyMap from '$lib/components/FamilyMap.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';
	import { ORG_KINDS, RADAR_TOPICS } from '$lib/angebote';
	let { values, region = null, tiles, center = [8.8017, 53.0793] }: { values: Record<string, string[]>; region?: { code: string; name: string } | null; tiles: boolean; center?: [number, number] } = $props();
	const v = (k: string) => values[k]?.[0] ?? '';
	const has = (k: string, x: string) => (values[k] ?? []).includes(x);
	// svelte-ignore state_referenced_locally
	let lat = $state(v('lat'));
	// svelte-ignore state_referenced_locally
	let lon = $state(v('lon'));
	let showMap = $state(false);
</script>

<div class="field"><label for="name">Name der Einrichtung</label><input id="name" name="name" required minlength="2" maxlength="160" value={v('name')} /></div>
<div class="field"><label for="kind">Art</label>
	<select id="kind" name="kind" required><option value="">Bitte wählen</option>{#each Object.entries(ORG_KINDS) as [k, l]}<option value={k} selected={v('kind') === k}>{l}</option>{/each}</select>
</div>
<div class="field"><label for="description">Kurzbeschreibung</label><textarea id="description" name="description" rows="4" maxlength="5000">{v('description')}</textarea></div>
<fieldset class="row"><legend>Themen</legend>
	{#each Object.entries(RADAR_TOPICS) as [k, l]}<label class="pill"><input type="checkbox" name="topics" value={k} checked={has('topics', k)} /> {l}</label>{/each}
</fieldset>
<div class="field"><label for="address">Adresse</label><input id="address" name="address" maxlength="300" value={v('address')} /></div>
<div class="field"><label for="region_code">Ort / Stadtteil</label><RegionPicker id="region_code" name="region_code" code={region?.code ?? v('region_code')} label={region?.name ?? ''} /></div>
<input type="hidden" name="lat" value={lat} /><input type="hidden" name="lon" value={lon} />
{#if showMap}
	<div class="mapbox"><FamilyMap mode="pick" {tiles} center={lat && lon ? [Number(lon), Number(lat)] : center} zoom={lat ? 17 : 13} label="Karte zum Setzen des Standorts" onPick={(x, y) => ((lon = x.toFixed(6)), (lat = y.toFixed(6)))} /></div>
{:else}
	<p><button type="button" class="btn small secondary" onclick={() => (showMap = true)}>{lat ? 'Standort auf der Karte ändern' : 'Standort auf der Karte setzen (optional)'}</button></p>
{/if}
<div class="two">
	<div class="field"><label for="website">Webseite</label><input id="website" type="url" name="website" maxlength="300" value={v('website')} placeholder="https://…" /></div>
	<div class="field"><label for="email">E-Mail (öffentlich)</label><input id="email" type="email" name="email" maxlength="200" value={v('email')} /></div>
	<div class="field"><label for="phone">Telefon (öffentlich)</label><input id="phone" type="tel" name="phone" maxlength="60" value={v('phone')} /></div>
</div>

<style>
	.row {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-1);
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
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
	}
	.mapbox {
		height: 280px;
		border-radius: var(--radius-m);
		overflow: hidden;
	}
</style>
