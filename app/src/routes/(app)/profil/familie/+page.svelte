<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { LEVELS } from '$lib/visibility';
	let { data, form } = $props();
	const visLabel = $derived(LEVELS.find((l) => l.key === data.vis)?.label ?? 'Nur ich');
</script>

<svelte:head><title>Partnerschaft & Familie – Kinder Deutschlands</title></svelte:head>
<div class="container page narrow">
	<a class="back" href="/profil"><Icon name="zurueck" size={18} />Mein Konto</a>
	<h1>Partnerschaft & Familie</h1>
	<p class="lead">Verbinde dein Konto mit dem deines Partners oder deiner Familie. Dann ist erkennbar, wer zusammengehört, und eure Kontakte können euch gemeinsam schreiben. Beide müssen bestätigen; lösen kann jede Seite jederzeit.</p>
	<p class="muted small">Wer die Verbindung sieht, legst du in deinem <a href="/profil/bearbeiten">Profil</a> fest (Feld „Verbindung Partnerschaft/Familie“, gerade: <strong>{visLabel}</strong>). Gezeigt wird sie nur, wenn ihr beide es für die jeweilige Person erlaubt.</p>
	{#if form && 'error' in form}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form && 'ok' in form}<Notice kind="ok">{form.ok}</Notice>{/if}

	{#if data.links.length}
		<ul class="list">
			{#each data.links as l (l.id)}
				<li>
					<div><strong>{l.name ?? `Familien-ID ${l.contactId}`}</strong><small>{data.kinds[l.kind]} · {l.status === 'aktiv' ? 'verbunden' : l.incoming ? 'möchte sich mit dir verbinden' : 'wartet auf Bestätigung'}</small></div>
					<div class="acts">
						{#if l.incoming}
							<form method="POST" action="?/antworten"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="accept" value="1" /><button class="btn small">Bestätigen</button></form>
							<form method="POST" action="?/antworten"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="accept" value="0" /><button class="btn small secondary">Ablehnen</button></form>
						{:else}
							<form method="POST" action="?/loesen"><input type="hidden" name="id" value={l.id} /><button class="btn small secondary">{l.status === 'aktiv' ? 'Lösen' : 'Zurückziehen'}</button></form>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/anfragen" class="card f">
		<h2>Neue Verbindung</h2>
		<label>Familien-ID<input name="cid" required value={data.prefill} placeholder="z. B. K7M-4QX-2HD" autocomplete="off" /></label>
		<fieldset>
			<legend>Beziehung</legend>
			{#each Object.entries(data.kinds) as [k, label]}<label class="radio"><input type="radio" name="kind" value={k} required checked={k === 'partnerschaft'} /> {label}</label>{/each}
		</fieldset>
		<div><button class="btn">Anfrage senden</button></div>
		<p class="muted small">Tipp: Die Familien-ID steht unter „Mein Konto“. Per QR-Code: Kontaktkarte scannen → „Als Partnerschaft/Familie verbinden“.</p>
	</form>
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
		color: var(--ink-2);
	}
	.list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: var(--sp-2);
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--sp-2);
		align-items: center;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
	}
	.list li > div:first-child {
		display: grid;
	}
	.list small {
		color: var(--ink-2);
	}
	.acts {
		display: flex;
		gap: var(--sp-2);
	}
	.f {
		display: grid;
		gap: var(--sp-3);
		padding: var(--sp-4);
		background: var(--surface);
		border-radius: var(--radius-m);
		margin-top: var(--sp-5);
	}
	.f h2 {
		margin: 0;
		font-size: var(--fs-l);
	}
	.f label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.f .radio {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		min-height: 44px;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
	}
	legend {
		font-weight: 650;
	}
	.small {
		font-size: var(--fs-s);
	}
</style>
