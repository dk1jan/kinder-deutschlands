<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	const permanent = $derived(data.items.find((i) => i.kind === 'dauerhaft' && i.active));
	const temporary = $derived(data.items.filter((i) => i.kind === 'befristet' && i.active));
	const inactive = $derived(data.items.filter((i) => !i.active));
</script>

<svelte:head><title>QR-Codes – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<p><a href="/profil">Zurück zum Profil</a></p>
	<h1>QR-Codes und Wimpel</h1>
	<p class="lead">Wer einen deiner Codes scannt, sieht deine Kontaktkarte, so wie du sie freigegeben hast. Gesperrte und abgelaufene Codes zeigen nichts mehr an.</p>

	{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
	{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}

	{#if permanent}
		<section class="perm card">
			<div class="qr">{@html permanent.svg}</div>
			<div>
				<h2>Dein dauerhafter Code</h2>
				<p>Für das Handy, einen Anhänger oder den Wimpel am Kinderwagen. Erstellt am {permanent.created}{#if permanent.lastScan}, zuletzt gescannt am {permanent.lastScan}{/if}.</p>
				<div class="row">
					<a class="btn signal" href={`/profil/qr/druck?id=${permanent.id}`}>Als Wimpel drucken</a>
					<form method="POST" action="?/ersetzen">
						<button class="btn secondary" type="submit">Neuen Code erzeugen</button>
					</form>
				</div>
				<p class="muted small">„Neuen Code erzeugen“ sperrt den alten sofort, etwa wenn ein Wimpel verloren gegangen ist.</p>
			</div>
		</section>
	{/if}

	<section class="block">
		<h2>Befristeter Code für eine Begegnung</h2>
		<p>Für den Kurs, das Spielplatztreffen oder den Flohmarkt: Der Code funktioniert nur für kurze Zeit.</p>
		<form method="POST" action="?/befristet" class="temp">
			<div class="field">
				<label for="hours">Gültig für</label>
				<select id="hours" name="hours">
					<option value="1">1 Stunde</option>
					<option value="3" selected>3 Stunden</option>
					<option value="24">1 Tag</option>
					<option value="168">1 Woche</option>
				</select>
			</div>
			<div class="field">
				<label for="label">Notiz für dich <span class="muted">(optional)</span></label>
				<input id="label" name="label" type="text" maxlength="60" placeholder="z. B. PEKiP Dienstag" />
			</div>
			<button class="btn" type="submit">Code erstellen</button>
		</form>

		{#if temporary.length}
			<ul class="temps">
				{#each temporary as t}
					<li class="card">
						<div class="qr small">{@html t.svg}</div>
						<div>
							<strong>{t.label || 'Befristeter Code'}</strong>
							<p class="muted">Gültig bis {t.expires}</p>
							<form method="POST" action="?/sperren">
								<input type="hidden" name="id" value={t.id} />
								<button class="btn small danger" type="submit">Jetzt sperren</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if inactive.length}
		<section class="block">
			<h2>Nicht mehr gültig</h2>
			<table class="data">
				<thead><tr><th scope="col">Art</th><th scope="col">Notiz</th><th scope="col">Zustand</th><th scope="col">Erstellt</th></tr></thead>
				<tbody>
					{#each inactive as i}
						<tr><td>{i.kind === 'dauerhaft' ? 'Dauerhaft' : 'Befristet'}</td><td>{i.label}</td><td>{i.state}</td><td>{i.created}</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>

<style>
	.perm {
		display: grid;
		gap: var(--sp-5);
		align-items: center;
		margin-bottom: var(--sp-6);
		border-top: 8px solid var(--yellow);
	}
	.qr {
		width: 180px;
		padding: 12px;
		background: #fff;
		border-radius: var(--radius-m);
	}
	.qr.small {
		width: 110px;
		padding: 8px;
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		margin: var(--sp-4) 0 var(--sp-2);
	}
	.small {
		font-size: var(--fs-s);
	}
	.block {
		margin-bottom: var(--sp-7);
	}
	.block h2 {
		font-size: var(--fs-xl);
	}
	.temp {
		display: grid;
		gap: 0 var(--sp-4);
		max-width: 40rem;
	}
	.temps {
		list-style: none;
		padding: 0;
		margin: var(--sp-5) 0 0;
		display: grid;
		gap: var(--sp-3);
	}
	.temps li {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--sp-4);
		align-items: center;
	}
	.temps p {
		margin: 0 0 var(--sp-2);
	}
	@media (min-width: 760px) {
		.perm {
			grid-template-columns: auto 1fr;
		}
		.temp {
			grid-template-columns: 12rem 1fr auto;
			align-items: end;
		}
		.temp .btn {
			margin-bottom: var(--sp-4);
		}
		.temps {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
