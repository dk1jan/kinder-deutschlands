<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Editor from '$lib/components/community/Editor.svelte';
	import RegionPicker from '$lib/components/RegionPicker.svelte';

	let { data, form } = $props();
	interface V { kind: string; title: string; body: string; topic: string; group: string; region: string; link: string; tags: string; poll: string[] }
	const v = $derived((form && 'values' in form ? form.values : null) as V | null);
	// svelte-ignore state_referenced_locally
	let kind = $state(v?.kind ?? data.prefill.kind);
	// svelte-ignore state_referenced_locally
	let group = $state(v?.group ?? data.prefill.group);
	// svelte-ignore state_referenced_locally
	let options = $state<string[]>(v?.poll?.length ? v.poll : ['', '']);
	let previews = $state<string[]>([]);
	const KINDS = [
		{ key: 'frage', label: 'Frage', hint: 'Du suchst Rat oder Erfahrungen.' },
		{ key: 'erfahrung', label: 'Erfahrung', hint: 'Du teilst, was dir geholfen hat.' },
		{ key: 'beitrag', label: 'Beitrag', hint: 'Hinweis, Idee, Austausch.' },
		{ key: 'link', label: 'Link-Tipp', hint: 'Video, Artikel, Instagram & Co.' },
		{ key: 'umfrage', label: 'Umfrage', hint: 'Meinungen einsammeln.' }
	];
	const selectedGroup = $derived(data.groups.find((g) => g.id === group));
	function onFiles(e: Event) {
		const files = [...((e.target as HTMLInputElement).files ?? [])].slice(0, 4);
		previews.forEach((u) => URL.revokeObjectURL(u));
		previews = files.map((f) => URL.createObjectURL(f));
	}
</script>

<svelte:head><title>Beitrag schreiben – Community</title></svelte:head>

<div class="page">
	<a class="back" href="/community"><Icon name="zurueck" size={18} />Community</a>
	<h1>Beitrag schreiben</h1>
	{#if form && 'error' in form && form.error}<Notice kind="error">{form.error}</Notice>{/if}

	<form method="POST" enctype="multipart/form-data">
		<fieldset class="kinds">
			<legend>Was möchtest du?</legend>
			{#each KINDS as k}
				<label class="opt"><input type="radio" name="kind" value={k.key} bind:group={kind} /><span><b>{k.label}</b><small>{k.hint}</small></span></label>
			{/each}
		</fieldset>

		<div class="field">
			<label for="title">{kind === 'frage' ? 'Deine Frage in einem Satz' : 'Titel'}</label>
			<input id="title" name="title" required minlength="3" maxlength="160" value={v?.title ?? data.prefill.title} placeholder={kind === 'frage' ? 'z. B. Wie lange hat bei euch die Kita-Eingewöhnung gedauert?' : ''} />
		</div>

		{#if kind === 'link'}
			<div class="field">
				<label for="link">Link</label>
				<input id="link" name="link" type="url" required value={v?.link ?? data.prefill.link ?? ''} placeholder="https://www.instagram.com/… oder https://youtu.be/…" />
				<span class="hint">Wir zeigen eine Vorschau ohne fremde Tracker. Videos starten erst, wenn jemand bewusst auf „Abspielen“ tippt.</span>
			</div>
		{/if}

		<Editor name="body" label={kind === 'link' ? 'Warum ist das hilfreich? (optional)' : 'Text'} value={v?.body ?? data.prefill.body} placeholder="Bitte keine Telefonnummern, Adressen oder Namen von Kindern." />

		{#if kind === 'umfrage'}
			<fieldset class="poll">
				<legend>Antwortmöglichkeiten</legend>
				{#each options as _, i}
					<input name="poll" bind:value={options[i]} maxlength="120" placeholder="Antwort {i + 1}" aria-label="Antwort {i + 1}" />
				{/each}
				{#if options.length < 10}<button type="button" class="btn small secondary" onclick={() => (options = [...options, ''])}>+ weitere Antwort</button>{/if}
				<label class="check"><input type="checkbox" name="multiple" /><span>Mehrfachauswahl erlauben</span></label>
				<label class="sel">Läuft <select name="days"><option value="">ohne Ende</option><option value="3">3 Tage</option><option value="7" selected>7 Tage</option><option value="14">14 Tage</option><option value="30">30 Tage</option></select></label>
			</fieldset>
		{/if}

		<div class="grid">
			<div class="field">
				<label for="group">Wo posten?</label>
				<select id="group" name="group" bind:value={group}>
					<option value="">In der Community (alle Mitglieder)</option>
					{#each data.groups as g}<option value={g.id}>{g.kind === 'geschuetzt' ? '🔒 ' : ''}Gruppe: {g.name}</option>{/each}
				</select>
				{#if selectedGroup?.kind === 'geschuetzt'}<span class="hint">Nur Gruppenmitglieder sehen den Beitrag – du erscheinst als „{selectedGroup.pseudonym}“.</span>{/if}
			</div>
			<div class="field">
				<label for="topic">Thema</label>
				<select id="topic" name="topic">
					<option value="">Kein bestimmtes</option>
					{#each data.topics as t}<option value={t.key} selected={(v?.topic ?? data.prefill.topic) === t.key}>{t.name}</option>{/each}
				</select>
			</div>
			<div class="field wide">
				<label for="region_code">Region <span class="muted">(optional – z. B. dein Stadtteil, damit es Eltern in der Nähe finden)</span></label>
				<RegionPicker id="region_code" name="region_code" code={data.prefill.region?.code ?? ''} label={data.prefill.region?.name ?? ''} />
			</div>
			<div class="field wide">
				<label for="tags">Schlagworte <span class="muted">(optional, durch Komma getrennt)</span></label>
				<input id="tags" name="tags" maxlength="200" value={v?.tags ?? ''} placeholder="eingewöhnung, krippe" />
			</div>
		</div>

		{#if data.prefill.place}
			<input type="hidden" name="place" value={data.prefill.place.id} />
			<p class="muted">Bezieht sich auf den Ort: <a href="/orte/{data.prefill.place.id}">{data.prefill.place.name ?? 'Ort'}</a></p>
		{/if}

		<fieldset class="imgs">
			<legend>Bilder <span class="muted">(optional, bis zu 4)</span></legend>
			<input type="file" name="images" accept="image/jpeg,image/png,image/webp,image/avif" multiple onchange={onFiles} />
			{#if previews.length}
				<div class="thumbs">
					{#each previews as p, i}<figure><img src={p} alt="" /><input name="alt" maxlength="200" placeholder="Bildbeschreibung (für Screenreader)" aria-label="Beschreibung Bild {i + 1}" /></figure>{/each}
				</div>
			{/if}
			<p class="hint">Bitte keine Fotos, auf denen Kinder oder andere Personen erkennbar sind. Standortdaten (GPS) und Kameradaten werden beim Hochladen entfernt.</p>
		</fieldset>

		<fieldset class="labels">
			<legend>Kennzeichnen <span class="muted">(falls zutreffend)</span></legend>
			<label class="check"><input type="checkbox" name="labels" value="werbung" /><span>Eigenwerbung / ich habe ein geschäftliches Interesse</span></label>
			<label class="check"><input type="checkbox" name="labels" value="triggerwarnung" /><span>Belastendes Thema (Vorschau wird ausgeblendet)</span></label>
			<label class="check"><input type="checkbox" name="labels" value="erfahrungsbericht" /><span>Persönliche Erfahrung, keine fachliche Beratung</span></label>
		</fieldset>

		<p class="muted small">Beiträge sehen nur angemeldete Mitglieder. Bei Gesundheitsfragen ersetzt die Community keine ärztliche Beratung.</p>
		<button class="btn" type="submit">Veröffentlichen</button>
	</form>
</div>

<style>
	.page {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--sp-4) var(--gutter) var(--sp-7);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-weight: 650;
	}
	form {
		display: grid;
		gap: var(--sp-5);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	legend {
		font-weight: 700;
		margin-bottom: var(--sp-2);
	}
	.kinds {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: var(--sp-2);
	}
	.kinds legend {
		grid-column: 1 / -1;
	}
	.opt {
		display: flex;
		padding: var(--sp-3);
		border: 1.5px solid var(--line);
		border-radius: var(--radius-m);
		background: var(--surface);
		cursor: pointer;
	}
	.opt input {
		position: absolute;
		opacity: 0;
	}
	.opt span {
		display: grid;
		gap: 2px;
	}
	.opt small {
		color: var(--ink-2);
		font-size: var(--fs-xs);
	}
	.opt:has(input:checked) {
		border-color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink);
	}
	.opt:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.grid {
		display: grid;
		gap: var(--sp-3) var(--sp-4);
	}
	@media (min-width: 640px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
		.wide {
			grid-column: 1 / -1;
		}
	}
	.poll {
		display: grid;
		gap: var(--sp-2);
	}
	.check {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 44px;
	}
	.check input {
		width: 1.2rem;
		height: 1.2rem;
		flex: none;
	}
	.sel {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}
	.sel select {
		width: auto;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
	.thumbs figure {
		margin: 0;
		display: grid;
		gap: 4px;
	}
	.thumbs img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-s);
	}
	.hint {
		font-size: var(--fs-xs);
		color: var(--ink-2);
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
