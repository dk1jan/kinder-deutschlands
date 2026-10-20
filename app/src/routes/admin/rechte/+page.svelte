<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
	let scopeType = $state('global');
	const scopeLabel: Record<string, string> = {
		global: 'Überall',
		region: 'Region (gilt auch für alle Regionen darunter)',
		topic: 'Thema',
		org: 'Organisation',
		group: 'Geschützte Gruppe (nur diese eine)'
	};
</script>

<svelte:head><title>Rollen und Rechte – Verwaltung</title></svelte:head>

<h1>Rollen und Rechte</h1>
<p class="muted">Recht = Rolle × Geltungsbereich, optional befristet. Jede Vergabe und jeder Entzug wird protokolliert. Geschützte Gruppen öffnen sich nie über Regions- oder Themenrechte.</p>

{#if form?.error}<Notice kind="error">{form.error}</Notice>{/if}
{#if form?.ok}<Notice kind="ok">{form.ok}</Notice>{/if}

<section aria-labelledby="vergeben" class="card block">
	<h2 id="vergeben">Rolle vergeben</h2>
	<form method="POST" action="?/vergeben" class="grid">
		<div class="field">
			<label for="user_id">Konto</label>
			<select id="user_id" name="user_id" required>
				{#each data.users as u}<option value={u.id} selected={u.id === data.selected}>{u.cid}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label for="role_key">Rolle</label>
			<select id="role_key" name="role_key" required>
				{#each data.roles as r}<option value={r.key}>{r.name}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label for="scope_type">Geltungsbereich</label>
			<select id="scope_type" name="scope_type" bind:value={scopeType}>
				{#each Object.entries(scopeLabel) as [k, l]}<option value={k}>{l}</option>{/each}
			</select>
		</div>
		{#if scopeType === 'region'}
			<div class="field">
				<label for="region_id">Region</label>
				<select id="region_id" name="region_id" required>
					{#each data.regions as r}<option value={r.code}>{r.name} ({r.code})</option>{/each}
				</select>
			</div>
		{:else if scopeType !== 'global'}
			<div class="field">
				<label for="scope_id">Kennung</label>
				<input id="scope_id" name="scope_id" type="text" required />
			</div>
		{/if}
		<div class="field">
			<label for="expires_at">Befristet bis <span class="muted">(optional)</span></label>
			<input id="expires_at" name="expires_at" type="datetime-local" />
		</div>
		<div class="field">
			<label for="note">Grund <span class="muted">(bei Betreiber- und Technikrolle Pflicht – eine zweite Person muss zustimmen)</span></label>
			<input id="note" name="note" type="text" maxlength="300" />
		</div>
		<div><button class="btn" type="submit">Rolle vergeben</button></div>
	</form>
</section>

{#if data.preview}
	<section aria-labelledby="vorschau" class="block">
		<h2 id="vorschau">Effektive Rechte: Familien-ID {data.preview.cid}</h2>
		{#if data.preview.rows.length === 0}
			<p>Keine Rollen – normale Mitgliedsrechte.</p>
		{:else}
			<table class="data">
				<thead><tr><th scope="col">Rolle</th><th scope="col">Geltungsbereich</th><th scope="col">Aktionen</th></tr></thead>
				<tbody>
					{#each data.preview.rows as r}
						<tr><td>{r.role}</td><td>{r.scope}</td><td>{r.actions.includes('*') ? 'alle' : r.actions.join(', ')}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
{/if}

<section aria-labelledby="aktiv" class="block">
	<h2 id="aktiv">Vergebene Rollen</h2>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
		<table class="data">
			<thead><tr><th scope="col">Konto</th><th scope="col">Rolle</th><th scope="col">Geltungsbereich</th><th scope="col">Gültig bis</th><th scope="col">Grund</th><th scope="col"><span class="visually-hidden">Aktionen</span></th></tr></thead>
			<tbody>
				{#each data.assignments as a}
					<tr>
						<td><a href="?nutzer={a.userId}">{a.cid}</a></td>
						<td>{a.role}</td>
						<td>{a.scope}</td>
						<td>{a.expires}{a.expired ? ' (abgelaufen)' : ''}</td>
						<td>{a.note ?? '–'}</td>
						<td>
							<form method="POST" action="?/entziehen">
								<input type="hidden" name="id" value={a.id} />
								<input name="reason" maxlength="300" placeholder="Grund" aria-label="Grund" required={a.role === 'superadmin' || a.role === 'tech_admin'} />
								<button class="btn small danger" type="submit">Entziehen</button>
							</form>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section aria-labelledby="rollen" class="block">
	<h2 id="rollen">Rollen</h2>
	<table class="data">
		<thead><tr><th scope="col">Rolle</th><th scope="col">Beschreibung</th><th scope="col">Aktionen</th></tr></thead>
		<tbody>
			{#each data.roles as r}
				<tr><td>{r.name}<br /><code class="muted">{r.key}</code></td><td>{r.description}</td><td>{r.actions.includes('*') ? 'alle' : r.actions.join(', ')}</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.block {
		margin: var(--sp-6) 0;
	}
	.grid {
		display: grid;
		gap: 0 var(--sp-4);
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		align-items: end;
	}
	.grid > div:last-child {
		margin-bottom: var(--sp-4);
	}
	.scroll {
		overflow-x: auto;
	}
</style>
