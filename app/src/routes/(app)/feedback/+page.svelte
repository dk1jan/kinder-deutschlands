<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { FEEDBACK_KINDS } from '$lib/feedback';
	let { data, form } = $props();
	const kind = $derived(form?.values?.kind || data.kind);
	const page = $derived(form?.values?.page ?? data.page ?? '');
</script>

<svelte:head>
	<title>Feedback – Kinder Deutschlands</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="container page narrow">
	<a class="back" href={data.page || '/'}><Icon name="zurueck" size={18} />Zurück</a>
	<h1>Feedback</h1>
	{#if form?.done}
		<Notice kind="ok" title="Danke!">&nbsp;Dein Feedback ist angekommen. Wir lesen jede Rückmeldung.</Notice>
		<p><a class="btn secondary" href={data.page || '/'}>Weiter</a></p>
	{:else}
		<p class="lead">Was ist dir aufgefallen? Hier kannst du Fehler melden, falsche Inhalte korrigieren lassen oder uns einfach etwas mitgeben.</p>
		{#if form?.error}<Notice kind="error">&nbsp;{form.error}</Notice>{/if}
		<form method="POST" class="f">
			<fieldset class="pills"><legend>Worum geht es?</legend>
				{#each Object.entries(FEEDBACK_KINDS) as [k, l]}<label class="pill"><input type="radio" name="kind" value={k} checked={kind === k} /> {l}</label>{/each}
			</fieldset>
			<div class="field">
				<label for="body">Deine Nachricht</label>
				<textarea id="body" name="body" rows="7" required minlength="5" maxlength="2000" placeholder="Was ist passiert? Was hast du erwartet? Bei einem Fehler: Was hast du zuletzt angetippt?">{form?.values?.body ?? ''}</textarea>
			</div>
			<input type="hidden" name="page" value={page} />
			{#if page}<p class="muted small">Gemeldet von der Seite <code>{page}</code> – die Seite schicken wir automatisch mit.</p>{/if}
			<p class="muted small">Bitte keine Passwörter, Telefonnummern oder Gesundheitsdetails schreiben. Wir antworten nicht per E-Mail; wenn wir etwas klären konnten, bekommst du eine Mitteilung in der Glocke. Bei einem Notfall wähle 112.</p>
			<div><button class="btn">Absenden</button></div>
		</form>
	{/if}
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
	.lead {
		margin-block: var(--sp-3);
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
		margin-bottom: var(--sp-1);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		min-height: 44px;
		padding: 0 var(--sp-3);
		border: 2px solid var(--line);
		border-radius: 999px;
		cursor: pointer;
	}
	.pill:has(input:checked) {
		border-color: var(--ink);
		background: var(--surface);
		font-weight: 650;
	}
	.pill:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
