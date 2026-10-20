<script lang="ts">
	import ContactCard from '$lib/components/ContactCard.svelte';
	import RequestBox from '$lib/components/RequestBox.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { data, form } = $props();
</script>

<svelte:head><title>Familie finden – Kinder Deutschlands</title></svelte:head>

<div class="container narrow page">
	<p><a href="/nachrichten">Zurück zu den Kontakten</a></p>
	<h1>Familie finden</h1>

	<form method="GET" class="search">
		<label class="visually-hidden" for="id">Familien-ID</label>
		<input id="id" name="id" type="text" value={data.query} autocomplete="off" spellcheck="false" maxlength="15" placeholder="K7M-4QX-2HD" required />
		<button class="btn" type="submit">Suchen</button>
	</form>

	{#if data.notFound}<Notice kind="warn" title="Nicht gefunden">{data.notFound}</Notice>{/if}

	{#if data.found}
		<ContactCard card={data.found.card}>
			<RequestBox relation={data.found.relation} pending={data.found.pending} done={form?.done} error={form?.error}
				action="?/anfragen" loginHref="/anmelden" hidden={{ cid: data.found.cid }} />
		</ContactCard>
		{#if data.found.writeTogether}<p class="together"><a class="btn small secondary" href="/nachrichten/gruppe/neu?mit={data.found.writeTogether.join(',')}">Gemeinsam schreiben</a></p>{/if}
		{#if data.found.relation !== 'extern' && data.found.relation !== 'selbst'}<p class="muted small"><a href="/profil/familie?id={data.found.card.contactIdFormatted}">Als Partnerschaft/Familie verbinden …</a></p>{/if}
		<details class="report">
			<summary>Diese Familie blockieren</summary>
			<p>Blockierte Familien können dich nicht mehr finden, scannen oder anfragen. Bestehende Verbindungen werden beendet.</p>
			<form method="POST" action="?/blockieren">
				<input type="hidden" name="cid" value={data.found.cid} />
				<button class="btn small danger" type="submit">Blockieren</button>
			</form>
		</details>
	{/if}
</div>

<style>
	.search {
		display: flex;
		gap: var(--sp-2);
		margin: var(--sp-4) 0 var(--sp-5);
		max-width: 30rem;
	}
	.search input {
		font-family: var(--font-display);
		font-size: var(--fs-l);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.report {
		margin-top: var(--sp-5);
		max-width: 34rem;
	}
	.report summary {
		cursor: pointer;
		color: var(--ink-2);
		min-height: 44px;
		display: flex;
		align-items: center;
	}
</style>
