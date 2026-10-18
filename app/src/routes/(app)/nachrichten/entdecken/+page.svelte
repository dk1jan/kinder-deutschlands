<script lang="ts">
	import ContactCard from '$lib/components/ContactCard.svelte';
	import RequestBox from '$lib/components/RequestBox.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Familien entdecken – Kinder Deutschlands</title></svelte:head>

<div class="container page">
	<p><a href="/nachrichten">Zurück zu den Kontakten</a></p>
	<h1>Familien entdecken</h1>
	<p class="lead">Hier erscheinen nur Familien, die das ausdrücklich eingeschaltet haben. Du siehst, was sie für Mitglieder freigeben.</p>

	{#if !data.meDiscoverable}
		<Notice kind="info" title="Du selbst bist nicht auffindbar">Das kannst du in deinem <a href="/profil/bearbeiten">Profil</a> ändern. Entdecken klappt trotzdem.</Notice>
	{/if}

	<form method="GET" class="filter">
		<label for="region">Region</label>
		<select id="region" name="region">
			<option value="">Alle Regionen</option>
			{#each data.regions as r}<option value={r.code} selected={r.code === data.region}>{r.name}</option>{/each}
		</select>
		<button class="btn small secondary" type="submit">Anzeigen</button>
	</form>

	{#if data.items.length === 0}
		<p class="empty">Hier ist noch niemand auffindbar{data.region ? ' in dieser Region' : ''}. Das Netzwerk startet gerade. Wir zeigen keine erfundenen Familien.</p>
	{:else}
		<ul class="grid" role="list">
			{#each data.items as it}
				<li>
					<ContactCard card={it.card}>
						<RequestBox relation={it.relation} pending={it.pending}
							done={form?.cid === it.cid ? form?.done : null} error={form?.cid === it.cid ? form?.error : null}
							action="?/anfragen" loginHref="/anmelden" hidden={{ cid: it.cid }} />
					</ContactCard>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.filter {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		margin: var(--sp-5) 0;
	}
	.filter label {
		font-weight: 700;
	}
	.filter select {
		width: auto;
		min-width: 14rem;
	}
	.empty {
		padding: var(--sp-5);
		border: 2px dashed var(--line);
		border-radius: var(--radius-m);
		max-width: 44rem;
	}
	.grid {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--sp-4);
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
