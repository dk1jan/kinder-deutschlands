<script lang="ts">
	import { page } from '$app/state';
	import ContactCard from '$lib/components/ContactCard.svelte';
	import RequestBox from '$lib/components/RequestBox.svelte';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Profil – Kinder Deutschlands</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="container narrow page">
	<p class="back"><button type="button" class="linkbtn" onclick={() => history.back()}>← Zurück</button></p>
	<ContactCard card={data.card}>
		<RequestBox relation={data.relation} pending={data.pending} done={form?.done} error={form?.error}
			action="?/anfragen" loginHref={`/anmelden?weiter=${encodeURIComponent(page.url.pathname)}`} chatWith={data.card.contactIdFormatted} />
	</ContactCard>
	{#if data.writeTogether}<p class="together"><a class="btn small secondary" href="/nachrichten/gruppe/neu?mit={data.writeTogether.join(',')}">Gemeinsam schreiben</a></p>{/if}
	{#if data.relation !== 'extern' && data.relation !== 'selbst'}<p class="muted small"><a href="/profil/familie?id={data.card.contactIdFormatted}">Als Familie verbinden …</a></p>{/if}
</div>

<style>
	.back {
		margin-bottom: var(--sp-4);
		font-size: var(--fs-s);
	}
	.linkbtn {
		background: none;
		border: 0;
		padding: 0;
		min-height: 44px;
		font: inherit;
		font-weight: 650;
		color: var(--link, inherit);
		text-decoration: underline;
		cursor: pointer;
	}
	.linkbtn:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.small {
		margin-top: var(--sp-4);
		font-size: var(--fs-s);
	}
</style>
