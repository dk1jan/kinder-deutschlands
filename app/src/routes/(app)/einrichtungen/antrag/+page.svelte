<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import OrgFields from '$lib/components/angebote/OrgFields.svelte';
	let { data, form } = $props();
	const values = $derived((form && 'values' in form ? form.values : {}) as Record<string, string[]>);
</script>

<svelte:head><title>Einrichtung anmelden – Kinder Deutschlands</title></svelte:head>

<div class="neu">
	<a class="back" href="/einrichtungen"><Icon name="zurueck" size={18} />Einrichtungen</a>
	<h1>Einrichtung anmelden</h1>
	{#if form && 'done' in form && form.direct}
		<Notice kind="ok" title="Einrichtung angelegt">Sie ist sofort sichtbar. Du bist als Verwalter eingetragen und kannst Termine, freie Plätze und Hinweise pflegen.</Notice>
		<p><a class="btn small" href="/einrichtungen/{form.done}">Zur Einrichtung</a> <a class="btn small secondary" href="/einrichtungen/verwalten">Zu meinen Einrichtungen</a></p>
	{:else if form && 'done' in form}
		<Notice kind="ok" title="Antrag eingegangen">Wir prüfen die Zuordnung und melden uns über deine Mitteilungen. Danach kannst du Termine, freie Plätze und Hinweise pflegen und weitere Mitarbeitende hinzufügen.</Notice>
		<p><a class="btn small secondary" href="/einrichtungen/verwalten">Zu meinen Einrichtungen</a></p>
	{:else}
		<p class="lead">Für Familienzentren, Beratungsstellen, Vereine, Kitas, Kursanbieter und Kommunen. Kostenlos. Wir prüfen, ob du wirklich für die Einrichtung sprichst – erst dann erscheint sie öffentlich.</p>
		{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
		{#key form}
			<form method="POST" class="f">
				<OrgFields {values} tiles={data.tiles} />
				{#if data.direct}
					<p class="muted">Du legst die Einrichtung als Verwaltung an: Sie ist sofort sichtbar, eine Prüfung entfällt.</p>
				{:else}
				<fieldset>
					<legend>Zur Prüfung <span class="muted">(nur für die Verwaltung sichtbar, wird nach der Entscheidung gelöscht)</span></legend>
					<div class="field"><label for="role">Deine Funktion</label><input id="role" name="role" required minlength="3" maxlength="200" value={values.role?.[0] ?? ''} placeholder="z. B. Leitung, Öffentlichkeitsarbeit" /></div>
					<div class="field"><label for="proof">Wie können wir das prüfen?</label><textarea id="proof" name="proof" rows="3" required minlength="10" maxlength="1000" aria-describedby="proof-hint" placeholder="z. B. dienstliche E-Mail-Adresse, Telefonnummer der Einrichtung für einen Rückruf">{values.proof?.[0] ?? ''}</textarea><small id="proof-hint" class="muted">Mindestens 10 Zeichen, z. B. „Rückruf über 0421 … der Einrichtung“.</small></div>
					<label class="check"><input type="checkbox" name="ok" required checked={values.ok?.[0] === 'on'} /> <span>Ich darf für diese Einrichtung handeln.</span></label>
				</fieldset>
				{/if}
				<button class="btn">{data.direct ? 'Einrichtung anlegen' : 'Antrag senden'}</button>
			</form>
		{/key}
	{/if}
</div>

<style>
	.neu {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	h1 {
		margin: var(--sp-3) 0 var(--sp-2);
	}
	.lead {
		color: var(--ink-2);
	}
	.f {
		display: grid;
		gap: var(--sp-4);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-3);
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}
</style>
