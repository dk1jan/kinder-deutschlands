<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Nutzer – Verwaltung</title></svelte:head>

<h1>Nutzer</h1>
<p class="muted">E-Mail-Adressen sind nur hier für berechtigte Verwaltung sichtbar, nie im Profil. Mitgliedsregistrierung folgt mit Abschnitt 1.</p>

<div class="scroll">
	<table class="data">
		<thead>
			<tr><th scope="col">E-Mail</th><th scope="col">Status</th><th scope="col">Zwei-Faktor</th><th scope="col">Rollen</th><th scope="col">Angelegt</th><th scope="col">Letzte Anmeldung</th><th scope="col"><span class="visually-hidden">Aktion</span></th></tr>
		</thead>
		<tbody>
			{#each data.users as u}
				<tr>
					<td>{u.email}</td>
					<td>{u.status === 'active' ? 'Aktiv' : u.status === 'suspended' ? 'Gesperrt' : 'Gelöscht'}</td>
					<td>{u.mfa ? 'Ja' : 'Nein'}</td>
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
	.scroll {
		overflow-x: auto;
	}
</style>
