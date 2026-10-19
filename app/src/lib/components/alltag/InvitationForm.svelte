<script lang="ts">
	// Einladung anlegen/bearbeiten (M21). Keine Nachnamen, Geburtsdaten oder Adressen nötig.
	interface Props {
		values: Record<string, string[]>;
		place: { id: string; name: string } | null;
		submit: string;
		action?: string;
	}
	let { values, place, submit, action = '' }: Props = $props();
	const v = (k: string) => values[k]?.[0] ?? '';
	const on = (k: string, def: boolean) => (values[k] ? values[k].includes('on') : def);
</script>

<form method="POST" {action} class="if">
	<div class="field"><label for="title">Titel</label><input id="title" name="title" required minlength="3" maxlength="120" value={v('title')} placeholder="z. B. Emmas 6. Geburtstag" /></div>
	<div class="two">
		<div class="field"><label for="start">Beginn</label><input id="start" name="start" type="datetime-local" required value={v('start')} /></div>
		<div class="field"><label for="end">Ende <span class="muted">(optional)</span></label><input id="end" name="end" type="datetime-local" value={v('end')} /></div>
	</div>
	<div class="field"><label for="message">Einladungstext</label><textarea id="message" name="message" rows="5" maxlength="3000" placeholder="Was ist geplant, was mitbringen, Abholzeit …">{v('message')}</textarea></div>
	<fieldset><legend>Wo?</legend>
		{#if place}<label class="check"><input type="checkbox" name="place_id" value={place.id} checked={values.place_id ? values.place_id.includes(place.id) : true} /> <span>Ort aus der Familienkarte: <strong>{place.name}</strong></span></label>{/if}
		<div class="field"><label for="place_text">Adresse oder Treffpunkt</label><input id="place_text" name="place_text" maxlength="300" value={v('place_text')} placeholder="z. B. bei uns: Musterstraße 1, 2. OG" /></div>
		<label class="check"><input type="checkbox" name="address_after_rsvp" checked={on('address_after_rsvp', true)} /> <span>Ort erst nach Zusage zeigen (empfohlen bei privater Adresse)</span></label>
	</fieldset>
	<div class="two">
		<div class="field"><label for="rsvp_until">Antwort bis <span class="muted">(optional)</span></label><input id="rsvp_until" name="rsvp_until" type="date" value={v('rsvp_until')} /></div>
		<div class="field"><label for="max_guests">Höchstens Zusagen <span class="muted">(optional)</span></label><input id="max_guests" name="max_guests" type="number" min="1" max="200" value={v('max_guests')} /></div>
	</div>
	<label class="check"><input type="checkbox" name="guests_see_list" checked={on('guests_see_list', false)} /> <span>Wer zugesagt hat, sieht die Namen der anderen Zusagen (sonst nur die Anzahl)</span></label>
	<p class="muted small">Die Einladung ist nur über den Link erreichbar, den du verschickst – du kannst ihn jederzeit erneuern oder abschalten. Gäste brauchen kein Konto. Antworten und Einladung werden 30 Tage nach dem Termin gelöscht.</p>
	<div><button class="btn">{submit}</button></div>
</form>

<style>
	.if {
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
	.two {
		display: grid;
		gap: var(--sp-3);
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 40px;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
