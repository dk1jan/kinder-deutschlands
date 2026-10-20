<script lang="ts">
	import { page } from '$app/state';
	import ContactCard from '$lib/components/ContactCard.svelte';
	import RequestBox from '$lib/components/RequestBox.svelte';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Kontaktkarte – Kinder Deutschlands</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="container narrow page">
	<p class="intro">Diese Familie nutzt <strong>Kinder Deutschlands</strong>: Kontakt über eine Familien-ID statt Telefonnummer.</p>
	<ContactCard card={data.card}>
		<RequestBox relation={data.relation} pending={data.pending} done={form?.done} error={form?.error}
			action="?/anfragen" loginHref={`/anmelden?weiter=${encodeURIComponent(page.url.pathname)}`} />
	</ContactCard>
	{#if data.writeTogether}<p class="together"><a class="btn small secondary" href="/nachrichten/gruppe/neu?mit={data.writeTogether.join(',')}">Gemeinsam schreiben</a></p>{/if}
	{#if data.relation !== 'extern' && data.relation !== 'selbst'}<p class="muted small"><a href="/profil/familie?id={data.card.contactIdFormatted}">Als Partnerschaft/Familie verbinden …</a></p>{/if}
	{#if data.temporary}<p class="muted small">Dieser Code ist befristet und funktioniert nur für kurze Zeit.</p>{/if}
	{#if data.relation === 'extern'}
		<p class="muted small">Noch kein Konto? <a href="/registrieren">Konto anlegen</a> oder <a href="/">mehr über Kinder Deutschlands</a>.</p>
	{/if}
</div>

<style>
	.intro {
		margin-bottom: var(--sp-5);
	}
	.small {
		margin-top: var(--sp-4);
		font-size: var(--fs-s);
	}
</style>
