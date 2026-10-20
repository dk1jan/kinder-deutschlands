<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Nutzer – Verwaltung</title></svelte:head>

<h1>Nutzer</h1>
<p class="muted">Kennzeichen ist die Familien-ID. E-Mail-Adressen sieht niemand in der Verwaltung (D-060) – nur das Mitglied selbst. Gelöschte Konten erscheinen anonymisiert.</p>

<details class="card msg" open={!!form?.msgError}>
	<summary>Nachricht an ein Mitglied</summary>
	<p class="muted small">Geht als Mitteilung in die Glocke des Mitglieds – ohne E-Mail. Im Protokoll steht, wer wem geschrieben hat, nicht der Text.</p>
	{#if form?.msgError}<Notice kind="error">{form.msgError}</Notice>{/if}
	{#if form?.msgOk}<Notice kind="ok">{form.msgOk}</Notice>{/if}
	<form method="POST" action="?/nachricht" class="mf">
		<label>Familien-ID<input name="cid" required placeholder="z. B. K7M-4QX-2HD" value={form && 'cid' in form ? form.cid : ''} autocomplete="off" /></label>
		<label>Nachricht<textarea name="text" rows="3" maxlength="800" required>{form && 'text' in form ? form.text : ''}</textarea></label>
		<div><button class="btn small">Senden</button></div>
	</form>
</details>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" tabindex="0" role="region" aria-label="Tabelle (seitlich scrollbar)">
	<table class="data">
		<thead>
			<tr><th scope="col">Familien-ID</th><th scope="col">Status</th><th scope="col">Bestätigt</th><th scope="col">Anmeldeschutz</th><th scope="col">Rollen</th><th scope="col">Angelegt</th><th scope="col">Letzte Anmeldung</th><th scope="col"><span class="visually-hidden">Aktion</span></th></tr>
		</thead>
		<tbody>
			{#each data.users as u}
				<tr>
					<td>{u.contactId}</td>
					<td>{u.status === 'active' ? 'Aktiv' : u.status === 'suspended' ? 'Gesperrt' : 'Gelöscht'}</td>
					<td>{u.verified ? 'Ja' : 'Nein'}</td>
					<td>{[u.mfa ? 'App-Code' : '', u.passkeys ? `${u.passkeys} Passkey` : ''].filter(Boolean).join(', ') || 'Nur Passwort'}</td>
					<td>{u.roles.length ? u.roles.join(', ') : 'Mitglied'}</td>
					<td>{u.created}</td>
					<td>{u.lastLogin}</td>
					<td><a href="/admin/rechte?nutzer={u.id}">Rechte</a></td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.card {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}
	summary {
		cursor: pointer;
		font-weight: 700;
	}
	.mf {
		display: grid;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}
	.mf label {
		display: grid;
		gap: 4px;
		font-weight: 650;
	}
	.small {
		font-size: var(--fs-s);
	}
	.scroll {
		overflow-x: auto;
	}
</style>
